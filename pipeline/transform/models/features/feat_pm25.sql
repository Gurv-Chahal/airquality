{{ config(materialized='table') }}

with stg as (
    select * from {{ ref('stg_pm25') }}   -- ref() = "depends on the staging model"
)

select
    station_id,
    valid_time,
    pm25,
    -- the one feature: PM2.5 from 24 hours earlier (same hour yesterday)
    lag(pm25, 24) over (partition by station_id order by valid_time) as pm25_lag_24h
from stg