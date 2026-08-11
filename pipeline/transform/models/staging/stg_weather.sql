{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'weather_observations') }}
),

ranked as (
    select
        station_id,
        valid_time,
        temperature_2m,
        wind_speed_10m,
        wind_direction_10m,
        precipitation,
        row_number() over (
            partition by station_id, valid_time
            order by valid_time
        ) as row_number
    from source
),

cleaned as (
    select
        station_id,
        valid_time::timestamptz + interval '1 hour' as valid_time,
        temperature_2m,
        wind_speed_10m,
        wind_direction_10m,
        precipitation
    from ranked
    where row_number = 1
)

select * from cleaned