{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'pm25_observations') }}
),

cleaned as (
    select
        station_id,
        sensor_id,
        valid_time::timestamp_ntz as valid_time,   -- cast the UTC text from RAW to a real timestamp
        greatest(pm25, 0) as pm25                  -- clamp sensor noise: negative µg/m³ is impossible
    from source
    where pm25 is not null
    qualify row_number() over (partition by sensor_id, valid_time order by valid_time) = 1
)

select * from cleaned