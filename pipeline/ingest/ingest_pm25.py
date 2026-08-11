# Downloads 3 years of hourly PM2.5 readings for every
# station in our registry and loads them into PostgreSQL's raw schema.
import datetime as dt
import os
import time
import pandas as pd
import requests

from common.postgres_io import load_replace
from common.stations import STATIONS

OPENAQ_BASE = "https://api.openaq.org/v3"
OPENAQ_KEY = os.environ["OPENAQ_API_KEY"]
DAYS = 1095
TABLE = "PM25_OBSERVATIONS"
DDL = (
    "station_id text, "
    "sensor_id bigint, "
    "valid_time timestamptz, "
    "pm25 double precision"
)

# We ask the API for 180 days at a time instead of all 3 years at once. Smaller
# date ranges mean fewer pages of results to page through per request.
CHUNK_DAYS = 180


# Make an API request that retries itself if the server is temporarily busy.
def _get_with_retry(url, params, tries=5):
    for attempt in range(tries):
        r = requests.get(url, headers={"X-API-Key": OPENAQ_KEY}, timeout=60, params=params)
        # These status codes mean "busy / try again later", not a real failure.
        # Wait a bit and retry, doubling the wait each time (1, 2, 4, 8, 16s).
        if r.status_code in (408, 429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()                  # any other error code: stop and raise it
        return r
    r.raise_for_status()                      # ran out of retries: surface the last error


# Pull the full 3 years of hourly PM2.5 for one station, returned as a table.
def fetch_pm25_history(station) -> pd.DataFrame:
    # Work backwards from the current hour to 3 years ago.
    end = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = end - dt.timedelta(days=DAYS)
    rows = []
    chunk_start = start
    # Walk forward through the 3 years in 180-day chunks.
    while chunk_start < end:
        chunk_end = min(chunk_start + dt.timedelta(days=CHUNK_DAYS), end)
        page = 1
        # The API returns results one page at a time, so keep asking for the
        # next page until it comes back empty.
        while True:
            r = _get_with_retry(
                f"{OPENAQ_BASE}/sensors/{station.sensor_id}/measurements/hourly",
                {"datetime_from": chunk_start.isoformat(),
                 "datetime_to": chunk_end.isoformat(),
                 "limit": 1000, "page": page})
            results = r.json()["results"]
            if not results:                   # no more data in this chunk
                break
            rows += results
            page += 1
        chunk_start = chunk_end               # move to the next 180-day chunk

    # Pull just the fields we care about out of each raw reading into a table.
    df = pd.DataFrame([{"STATION_ID": station.station_id, "SENSOR_ID": station.sensor_id,
                        "VALID_TIME": m["period"]["datetimeTo"]["utc"], "PM25": m["value"]}
                       for m in rows])
    # Reformat the timestamp into a plain "YYYY-MM-DD HH:MM:SS" string so it
    # matches the weather table and the two can be joined later.
    df["VALID_TIME"] = pd.to_datetime(df["VALID_TIME"], utc=True)

    return df


if __name__ == "__main__":
    # Fetch every station's history and collect the tables in a list.
    frames = []
    for station in STATIONS:
        df = fetch_pm25_history(station)
        print(f"{station.station_id:<14} fetched {len(df)} rows")
        frames.append(df)

    # Stack all stations into one table and load it into PostgreSQL. load_replace
    # wipes the table first and reloads it, so re-running never makes duplicates.
    all_rows = pd.concat(frames, ignore_index=True)
    total = load_replace(all_rows, TABLE, DDL)
    print(f"loaded {len(all_rows)} rows -> RAW.{TABLE} ({total} in table)")
