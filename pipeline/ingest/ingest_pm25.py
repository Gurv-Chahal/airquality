"""
Phase 1c / Step 3 — Ingest PM2.5 for ALL registered stations into Snowflake RAW.
"""
import datetime as dt
import os

import pandas as pd
import requests

from common.snowflake_io import load_replace   # importing this also loads pipeline/.env
from common.stations import STATIONS

OPENAQ_BASE = "https://api.openaq.org/v3"
OPENAQ_KEY = os.environ["OPENAQ_API_KEY"]
DAYS = 90
TABLE = "PM25_OBSERVATIONS"
DDL = "STATION_ID STRING, SENSOR_ID NUMBER, VALID_TIME STRING, PM25 FLOAT"


def fetch_pm25_history(station) -> pd.DataFrame:
    """Pull DAYS of hourly PM2.5 for one station, paging through OpenAQ's 1000-row limit."""
    end = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = end - dt.timedelta(days=DAYS)
    rows, page = [], 1
    while True:
        r = requests.get(f"{OPENAQ_BASE}/sensors/{station.sensor_id}/measurements/hourly",
                         headers={"X-API-Key": OPENAQ_KEY}, timeout=30,
                         params={"datetime_from": start.isoformat(), "datetime_to": end.isoformat(),
                                 "limit": 1000, "page": page})
        r.raise_for_status()
        results = r.json()["results"]
        if not results:
            break
        rows += results
        page += 1

    df = pd.DataFrame([{"STATION_ID": station.station_id, "SENSOR_ID": station.sensor_id,
                        "VALID_TIME": m["period"]["datetimeTo"]["utc"], "PM25": m["value"]}
                       for m in rows])
    df["VALID_TIME"] = (pd.to_datetime(df["VALID_TIME"], utc=True)
                        .dt.tz_localize(None).dt.strftime("%Y-%m-%d %H:%M:%S"))
    return df


if __name__ == "__main__":
    frames = []
    for station in STATIONS:
        df = fetch_pm25_history(station)
        print(f"{station.station_id:<14} fetched {len(df)} rows")
        frames.append(df)

    all_rows = pd.concat(frames, ignore_index=True)
    total = load_replace(all_rows, TABLE, DDL)   # one truncate+reload of the full multi-station set
    print(f"loaded {len(all_rows)} rows -> RAW.{TABLE} ({total} in table)")