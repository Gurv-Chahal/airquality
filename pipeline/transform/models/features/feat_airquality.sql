{{ config(materialized='table') }}

-- Phase 1e / Step 4 — final feature table (the thing the model trains on).
-- Join gap-filled PM2.5 + weather, then add lag features, trailing rolling stats,
-- and local-time calendar features. One row per (station_id, valid_time).

with pm25 as (
    select * from {{ ref('int_pm25_gapfilled') }}   -- station_id, valid_time, pm25, was_imputed
),

weather as (
    select * from {{ ref('stg_weather') }}          -- station_id, valid_time, + 4 weather cols
),

joined as (
    select
        p.station_id,
        p.valid_time,
        p.pm25,
        p.was_imputed,
        w.temperature_2m,
        w.wind_speed_10m,
        w.wind_direction_10m,
        w.precipitation
    from pm25 p
    join weather w
      on p.station_id = w.station_id
     and p.valid_time = w.valid_time
),

features as (
    select
        station_id,
        valid_time,
        pm25,

        -- lag features (over the gap-filled, contiguous hourly series)
        lag(pm25, 1)  over (partition by station_id order by valid_time) as pm25_lag_1h,
        lag(pm25, 24) over (partition by station_id order by valid_time) as pm25_lag_24h,
        lag(pm25, 48) over (partition by station_id order by valid_time) as pm25_lag_48h,

        -- trailing rolling stats: 24h window ENDING at the current row (never future -> no leakage)
        avg(pm25) over (
            partition by station_id order by valid_time
            rows between 23 preceding and current row
        ) as pm25_roll_mean_24h,
        max(pm25) over (
            partition by station_id order by valid_time
            rows between 23 preceding and current row
        ) as pm25_roll_max_24h,

        -- weather covariates
        temperature_2m,
        wind_speed_10m,
        wind_direction_10m,
        precipitation,

        -- calendar features in LOCAL time (America/Vancouver, DST-aware)
        hour(convert_timezone('UTC', 'America/Vancouver', valid_time))      as hour_local,
        dayofweek(convert_timezone('UTC', 'America/Vancouver', valid_time)) as day_of_week,

        -- missing-data mask (carried from gap-fill)
        was_imputed
    from joined
)

select * from features