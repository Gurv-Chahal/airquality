{{ config(materialized='view') }}

{% set max_gap_hours = 6 %}

with stg as (
    select * from {{ ref('stg_pm25') }}
),

bounds as (
    select
        station_id,
        min(valid_time) as min_time,
        max(valid_time) as max_time
    from stg
    group by station_id
),

spine as (
    select
        bounds.station_id,
        generated.valid_time
    from bounds
    cross join lateral generate_series(
        bounds.min_time,
        bounds.max_time,
        interval '1 hour'
    ) as generated(valid_time)
),

joined as (
    select
        spine.station_id,
        spine.valid_time,
        stg.pm25 as pm25_raw
    from spine
    left join stg
      on spine.station_id = stg.station_id
     and spine.valid_time = stg.valid_time
),

marked as (
    select
        station_id,
        valid_time,
        pm25_raw,

        max(valid_time) filter (where pm25_raw is not null) over (
            partition by station_id
            order by valid_time
            rows between unbounded preceding and current row
        ) as previous_real_time,

        min(valid_time) filter (where pm25_raw is not null) over (
            partition by station_id
            order by valid_time
            rows between current row and unbounded following
        ) as next_real_time

    from joined
),

filled as (
    select
        marked.station_id,
        marked.valid_time,
        marked.pm25_raw is null as was_imputed,
        previous.pm25_raw as pm25_ffill,

        case
            when marked.pm25_raw is not null then 0
            else (
                extract(
                    epoch from (
                        marked.next_real_time - marked.previous_real_time
                    )
                ) / 3600
            ) - 1
        end as gap_length

    from marked

    left join joined as previous
      on marked.station_id = previous.station_id
     and marked.previous_real_time = previous.valid_time
)

select
    station_id,
    valid_time,
    pm25_ffill as pm25,
    was_imputed
from filled
where pm25_ffill is not null
  and (
    not was_imputed
        or gap_length <= {{ max_gap_hours }}
    )