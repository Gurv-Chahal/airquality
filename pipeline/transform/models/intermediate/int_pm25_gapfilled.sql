{{ config(materialized='view') }}

-- Build a complete hourly spine per station, forward-fill short gaps, flag imputed
-- rows, and drop rows inside gaps longer than the threshold. This is the missing-data
-- handling from the plan: ffill short + was_imputed mask + drop long-gap windows.

{% set max_gap_hours = 6 %}

with stg as (
    select * from {{ ref('stg_pm25') }}
),

bounds as (   -- each station's active time range
    select station_id, min(valid_time) as min_t, max(valid_time) as max_t
    from stg
    group by station_id
),

overall as (
    select max(max_t) as max_t from bounds
),

hours as (   -- a generous backward series of hourly timestamps (4800h ≈ 200 days covers the window)
    select dateadd('hour', -seq4(), (select max_t from overall)) as valid_time
    from table(generator(rowcount => 4800))
),

spine as (   -- every hour within each station's own range (gaps become real rows)
    select b.station_id, h.valid_time
    from bounds b
    join hours h on h.valid_time between b.min_t and b.max_t
),

joined as (   -- attach actual readings; missing hours come through as NULL
    select s.station_id, s.valid_time, p.pm25 as pm25_raw
    from spine s
    left join stg p
      on s.station_id = p.station_id and s.valid_time = p.valid_time
),

filled as (
    select
        station_id,
        valid_time,
        pm25_raw,
        (pm25_raw is null) as was_imputed,
        -- forward-fill: carry the last real reading forward across the gap
        last_value(pm25_raw ignore nulls) over (
            partition by station_id order by valid_time
            rows between unbounded preceding and current row
        ) as pm25_ffill
    from joined
),

blocked as (   -- block_id increments at each real reading; a gap = trailing nulls in one block
    select *,
        sum(iff(not was_imputed, 1, 0)) over (
            partition by station_id order by valid_time
            rows between unbounded preceding and current row
        ) as block_id
    from filled
),

gap_sized as (   -- how many consecutive imputed hours are in this gap
    select *,
        sum(iff(was_imputed, 1, 0)) over (partition by station_id, block_id) as gap_len
    from blocked
)

select
    station_id,
    valid_time,
    pm25_ffill as pm25,
    was_imputed
from gap_sized
where pm25_ffill is not null            -- drop leading edge with nothing to fill from
  and not (was_imputed and gap_len > {{ max_gap_hours }})   -- drop rows inside long gaps
