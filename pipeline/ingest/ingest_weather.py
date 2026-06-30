"""
Phase 1c / Step 4 — Ingest hourly weather (Open-Meteo historical-forecast archive)
for ALL registered stations into Snowflake RAW. This is the TRAINING weather — same
model as the live forecast, so no train/serve skew. (Not ERA5.)
"""
import datetime as dt

import pandas as pd
import requests

from common.snowflake_io import load_replace
from common.stations import STATIONS

OM_HISTORICAL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
HOURLY_VARS = ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "precipitation"]
DAYS = 90
TABLE = "WEATHER_OBSERVATIONS"
DDL = ("STATION_ID STRING, VALID_TIME STRING, TEMPERATURE_2M FLOAT, "
       "WIND_SPEED_10M FLOAT, WIND_DIRECTION_10M FLOAT, PRECIPITATION FLOAT")

RENAME = {"time": "VALID_TIME", "temperature_2m": "TEMPERATURE_2M",
          "wind_speed_10m": "WIND_SPEED_10M", "wind_direction_10m": "WIND_DIRECTION_10M",
          "precipitation": "PRECIPITATION"}


def fetch_weather_history(station) -> pd.DataFrame:
    """Pull DAYS of hourly weather for one station's coordinates."""
    end = dt.date.today()
    start = end - dt.timedelta(days=DAYS)
    r = requests.get(OM_HISTORICAL, timeout=60, params={
        "latitude": station.lat, "longitude": station.lon,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "hourly": ",".join(HOURLY_VARS), "timezone": "UTC"})
    r.raise_for_status()

    df = pd.DataFrame(r.json()["hourly"]).rename(columns=RENAME)
    df.insert(0, "STATION_ID", station.station_id)
    # match the PM2.5 table's UTC string format so dbt can join them in 1e
    df["VALID_TIME"] = pd.to_datetime(df["VALID_TIME"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    return df[["STATION_ID", "VALID_TIME", "TEMPERATURE_2M",
               "WIND_SPEED_10M", "WIND_DIRECTION_10M", "PRECIPITATION"]]


if __name__ == "__main__":
    frames = []
    for station in STATIONS:
        df = fetch_weather_history(station)
        print(f"{station.station_id:<14} fetched {len(df)} weather rows")
        frames.append(df)

    all_rows = pd.concat(frames, ignore_index=True)
    total = load_replace(all_rows, TABLE, DDL)
    print(f"loaded {len(all_rows)} rows -> RAW.{TABLE} ({total} in table)")