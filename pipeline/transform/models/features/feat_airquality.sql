{{ config(materialized='table') }}

with pm25 as (
    select * from {{ ref('int_pm25_gapfilled') }}
),

weather as (
    select * from {{ ref('stg_weather') }}
),

joined as (
    select
        pm25.station_id,
        pm25.valid_time,
        pm25.pm25,
        pm25.was_imputed,
        weather.temperature_2m,
        weather.wind_speed_10m,
        weather.wind_direction_10m,
        weather.precipitation
    from pm25
    inner join weather
      on pm25.station_id = weather.station_id
     and pm25.valid_time = weather.valid_time
),

features as (
    select
        station_id,
        valid_time,
        pm25,

        lag(pm25, 1) over (
            partition by station_id
            order by valid_time
        ) as pm25_lag_1h,

        lag(pm25, 24) over (
            partition by station_id
            order by valid_time
        ) as pm25_lag_24h,

        lag(pm25, 48) over (
            partition by station_id
            order by valid_time
        ) as pm25_lag_48h,

        avg(pm25) over (
            partition by station_id
            order by valid_time
            rows between 23 preceding and current row
        ) as pm25_roll_mean_24h,

        max(pm25) over (
            partition by station_id
            order by valid_time
            rows between 23 preceding and current row
        ) as pm25_roll_max_24h,

        temperature_2m,
        wind_speed_10m,
        wind_direction_10m,
        precipitation,

        extract(
            hour from valid_time at time zone 'America/Vancouver'
        )::integer as hour_local,

        extract(
            dow from valid_time at time zone 'America/Vancouver'
        )::integer as day_of_week,

        was_imputed

    from joined
)

select * from features