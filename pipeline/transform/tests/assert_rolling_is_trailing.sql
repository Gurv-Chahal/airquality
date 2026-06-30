-- Singular test: pm25_roll_mean_24h / pm25_roll_max_24h must come from a TRAILING window
-- (past + current rows only). We independently recompute the trailing values from
-- int_pm25_gapfilled and flag any row where feat_airquality disagrees — which would mean a
-- centered/leading (future-leaking) window slipped in. A dbt test PASSES when this returns 0 rows.

with expected as (
    select
        station_id,
        valid_time,
        avg(pm25) over (
            partition by station_id order by valid_time
            rows between 23 preceding and current row
        ) as exp_mean,
        max(pm25) over (
            partition by station_id order by valid_time
            rows between 23 preceding and current row
        ) as exp_max
    from {{ ref('int_pm25_gapfilled') }}
),

     actual as (
         select station_id, valid_time, pm25_roll_mean_24h, pm25_roll_max_24h
         from {{ ref('feat_airquality') }}
     )

select a.station_id, a.valid_time, a.pm25_roll_mean_24h, e.exp_mean
from actual a
         join expected e
              on e.station_id = a.station_id
                  and e.valid_time = a.valid_time
where abs(a.pm25_roll_mean_24h - e.exp_mean) > 0.0001
   or a.pm25_roll_max_24h <> e.exp_max