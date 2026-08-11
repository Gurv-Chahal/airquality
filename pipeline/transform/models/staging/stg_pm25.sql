{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'pm25_observations') }}
),

ranked as (
    select
        station_id,
        sensor_id,
        valid_time::timestamptz as valid_time,
        greatest(pm25, 0) as pm25,
        row_number() over (
            partition by sensor_id, valid_time
            order by valid_time
        ) as row_number
    from source
    where pm25 is not null
)

select
    station_id,
    sensor_id,
    valid_time,
    pm25
from ranked
where row_number = 1