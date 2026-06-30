{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'weather_observations') }}
),

cleaned as (
    select
        station_id,
        -- Open-Meteo labels each hour by its START; OpenAQ PM2.5 (datetimeTo) labels by hour
        -- END. Shift weather +1h so both use the same hour-ending UTC convention and join on
        -- (station_id, valid_time).
        dateadd('hour', 1, valid_time::timestamp_ntz) as valid_time,
        temperature_2m,
        wind_speed_10m,
        wind_direction_10m,
        precipitation
    from source
    -- belt-and-suspenders dedupe: one row per (station, raw hour)
    qualify row_number() over (partition by station_id, valid_time order by valid_time) = 1
)

select * from cleaned
