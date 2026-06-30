{{ config(materialized='table') }}

-- Phase 1e / Step 4 — final feature table (the thing the model trains on).
-- Join gap-filled PM2.5 + weather, then add lag features, trailing rolling stats,
-- and local-time calendar features. One row per (station_id, valid_time).

with pm25 as (
    select * from {{ ref('int_pm25_gapfilled') }}   -- station_id, valid_time, pm25, was_imputed
),

weather as (
    select * from {{ ref('stg_weather') }}          -- station_id, valid_time, temperature_2m, wind_speed_10m, wind_direction_10m, precipitation
),

joined as (
    -- TODO: inner join pm25 + weather on (station_id, valid_time)
    select 1 as placeholder
),

features as (
    -- TODO: from joined, add:
    --   lags:     pm25_lag_1h, pm25_lag_24h, pm25_lag_48h
    --   rolling:  pm25_roll_mean_24h, pm25_roll_max_24h   (TRAILING ONLY)
    --   calendar: hour_local, day_of_week   (America/Vancouver)
    --   carry:    pm25, was_imputed, the 4 weather columns
    select 1 as placeholder
)

select * from features
