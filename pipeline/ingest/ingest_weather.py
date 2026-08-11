# Downloads 3 years of hourly weather for every station and
# loads it into PostgreSQL's raw schema.
import datetime as dt

import pandas as pd
import requests
import time
from common.postgres_io import load_replace
from common.stations import STATIONS

OM_HISTORICAL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
# The four weather measurements we pull for each hour.
HOURLY_VARS = ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "precipitation"]
DAYS = 1095
TABLE = "WEATHER_OBSERVATIONS"
DDL = (
    "station_id text, "
    "valid_time timestamptz, "
    "temperature_2m double precision, "
    "wind_speed_10m double precision, "
    "wind_direction_10m double precision, "
    "precipitation double precision"
)

# Open-Meteo returns lowercase column names; this maps them to the uppercase
# names our raw table uses.
RENAME = {"time": "VALID_TIME", "temperature_2m": "TEMPERATURE_2M",
          "wind_speed_10m": "WIND_SPEED_10M", "wind_direction_10m": "WIND_DIRECTION_10M",
          "precipitation": "PRECIPITATION"}


# Pull the full 3 years of hourly weather for one station, returned as a table.
def fetch_weather_history(station, tries=4) -> pd.DataFrame:
    end = dt.date.today()
    start = end - dt.timedelta(days=DAYS)
    # Try the request a few times; if it fails, wait a bit longer each attempt
    # (5s, then 10s, then 15s) before giving up.
    for attempt in range(tries):
        try:
            r = requests.get(OM_HISTORICAL, timeout=180, params={
                "latitude": station.lat, "longitude": station.lon,
                "start_date": start.isoformat(), "end_date": end.isoformat(),
                "hourly": ",".join(HOURLY_VARS), "timezone": "UTC"})
            r.raise_for_status()
            break                             # success — stop retrying
        except requests.exceptions.RequestException:
            if attempt == tries - 1:          # last attempt failed: give up and raise
                raise
            time.sleep(5 * (attempt + 1))

    # Turn the response into a table and rename the columns to our convention.
    df = pd.DataFrame(r.json()["hourly"]).rename(columns=RENAME)
    df.insert(0, "STATION_ID", station.station_id)   # tag every row with the station
    # Reformat the timestamp to the same "YYYY-MM-DD HH:MM:SS" string the PM2.5
    # table uses, so dbt can join weather to air-quality on time later.
    df["VALID_TIME"] = pd.to_datetime(df["VALID_TIME"], utc=True)
    # Return the columns in a fixed order matching the table definition.
    return df[["STATION_ID", "VALID_TIME", "TEMPERATURE_2M",
               "WIND_SPEED_10M", "WIND_DIRECTION_10M", "PRECIPITATION"]]


if __name__ == "__main__":
    # Fetch every station's weather and collect the tables in a list.
    frames = []
    for station in STATIONS:
        df = fetch_weather_history(station)
        print(f"{station.station_id:<14} fetched {len(df)} weather rows")
        frames.append(df)

    # Stack all stations into one table and load it into PostgreSQL. load_replace
    # wipes the table first and reloads it, so re-running never makes duplicates.
    all_rows = pd.concat(frames, ignore_index=True)
    total = load_replace(all_rows, TABLE, DDL)
    print(f"loaded {len(all_rows)} rows -> RAW.{TABLE} ({total} in table)")
