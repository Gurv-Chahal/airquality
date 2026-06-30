"""
Phase 1b / Step 3 — Persistence "model": read the dbt feature table from Snowflake,
emit a 24-hour seasonal-persistence forecast, and upsert it into Postgres (Supabase).
This is the placeholder the LSTM later drops into.
"""
import datetime as dt
import os

import psycopg2
import snowflake.connector
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

FEATURE_TABLE = "AIRQUALITY.ANALYTICS.FEAT_PM25"


def pm25_to_aqi_band(pm25: float) -> str:
    """Map a PM2.5 concentration (µg/m³) to its AQI category — the regress-then-bucket step (also Step 4)."""
    for hi, label in [(12.0, "Good"), (35.4, "Moderate"),
                      (55.4, "Unhealthy for Sensitive Groups"), (150.4, "Unhealthy"),
                      (250.4, "Very Unhealthy"), (float("inf"), "Hazardous")]:
        if pm25 <= hi:
            return label


def read_recent_actuals() -> tuple[str, dict]:
    """Pull the last 72h of actual PM2.5 from the dbt feature table, keyed by hour."""
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"], role=os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"))
    try:
        cur = conn.cursor()
        cur.execute(f"""SELECT station_id, valid_time, pm25 FROM {FEATURE_TABLE}
                        ORDER BY valid_time DESC LIMIT 72""")
        data = cur.fetchall()
    finally:
        conn.close()
    station_id = data[0][0]
    actuals = {t: v for _, t, v in data}
    return station_id, actuals


def build_forecast(station_id: str, actuals: dict) -> list[tuple]:
    """24-hour seasonal persistence: predicted(issued + h) = actual(issued + h - 24)."""
    issued = max(actuals)                      # latest actual hour = when the forecast is "issued"
    rows, last = [], None
    for h in range(1, 25):                      # the next 24 hours
        src = issued + dt.timedelta(hours=h - 24)   # "same hour yesterday" for valid = issued + h
        v = actuals.get(src, last)              # forward-fill across small gaps
        if v is None:
            continue
        last = v
        valid = issued + dt.timedelta(hours=h)
        rows.append((
            station_id,
            valid.replace(tzinfo=dt.timezone.utc),    # store UTC-aware (column is TIMESTAMPTZ)
            issued.replace(tzinfo=dt.timezone.utc),
            h, v, None, pm25_to_aqi_band(v),
        ))
    return rows


def upsert_forecast(rows: list[tuple]) -> None:
    """Create the forecast table if needed, then upsert — idempotent on the primary key."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        cur = conn.cursor()
        cur.execute("""
                    CREATE TABLE IF NOT EXISTS forecast (
                                                            station_id      TEXT        NOT NULL,
                                                            valid_time      TIMESTAMPTZ NOT NULL,
                                                            issued_time     TIMESTAMPTZ NOT NULL,
                                                            horizon_hours   INTEGER     NOT NULL,
                                                            predicted_pm25  REAL,
                                                            exceedance_prob REAL,
                                                            pm25_aqi_band   TEXT,
                                                            PRIMARY KEY (station_id, valid_time, issued_time, horizon_hours)
                        )
                    """)
        execute_values(cur, """
                            INSERT INTO forecast (station_id, valid_time, issued_time, horizon_hours,
                                                  predicted_pm25, exceedance_prob, pm25_aqi_band)
                            VALUES %s
                                ON CONFLICT (station_id, valid_time, issued_time, horizon_hours)
            DO UPDATE SET predicted_pm25  = EXCLUDED.predicted_pm25,
                                                   exceedance_prob = EXCLUDED.exceedance_prob,
                                                   pm25_aqi_band   = EXCLUDED.pm25_aqi_band
                            """, rows)
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM forecast")
        print("rows in forecast table:", cur.fetchone()[0])
    finally:
        conn.close()


if __name__ == "__main__":
    station_id, actuals = read_recent_actuals()
    rows = build_forecast(station_id, actuals)
    print(f"built {len(rows)} forecast rows for {station_id}")
    upsert_forecast(rows)