# scores the model's past forecasts. It takes forecasts whose target
# hour has already passed, looks up what the sensor actually measured, saves the
# prediction-vs-reality pair into forecast_eval, and prints a rolling average
# error per station.

import pandas as pd
from psycopg2.extras import execute_values

from common.postgres_io import fetch_df, get_connection

FEATURE_TABLE = "analytics.feat_airquality"
BACKFILL_DAYS = 14   # how far back to re-check forecasts on every run
ROLLING_DAYS = 7     # how many days the reported average error covers


# Pull forecasts whose predicted hour is now in the past, so the real reading
# for that hour should already exist and we can score them.
def read_mature_forecasts() -> pd.DataFrame:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT station_id, valid_time, issued_time, horizon_hours,
                   predicted_pm25, model_version
            FROM forecast
            WHERE valid_time <= now()
              AND valid_time >= now() - interval '{BACKFILL_DAYS} days'
        """)
        # Turn the raw rows into a DataFrame, naming columns from the query.
        return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])
    finally:
        conn.close()


# Pull the actual PM2.5 readings to score against. We take only real readings
def read_actuals() -> pd.DataFrame:
    df = fetch_df(f"""
    select station_id, valid_time, pm25
    from {FEATURE_TABLE}
    where was_imputed = false
      and valid_time >= current_timestamp - interval '{BACKFILL_DAYS + 2} days'
""")
    # Make timestamps explicitly UTC so they line up with the forecast rows.
    df.columns = [c.lower() for c in df.columns]
    df["valid_time"] = pd.to_datetime(df["valid_time"], utc=True)
    return df.rename(columns={"pm25": "actual_pm25"})


# Match each forecast to the actual reading for the same station and hour. Uses
# an inner join, so a forecast with no actual yet is simply skipped and picked
# up on a later run once its reading arrives.
def build_eval_rows(fc: pd.DataFrame, actuals: pd.DataFrame) -> list[tuple]:
    fc = fc.copy()
    # Make both timestamp columns UTC so the join compares them correctly.
    fc["valid_time"] = pd.to_datetime(fc["valid_time"], utc=True)
    fc["issued_time"] = pd.to_datetime(fc["issued_time"], utc=True)
    m = fc.merge(actuals, on=["station_id", "valid_time"], how="inner")
    # Flatten each matched row into a plain tuple ready for the database insert.
    return [(r.station_id, r.valid_time.to_pydatetime(), r.issued_time.to_pydatetime(),
             int(r.horizon_hours), r.model_version,
             float(r.predicted_pm25), float(r.actual_pm25))
            for r in m.itertuples()]


# Write the scored rows into forecast_eval.
def upsert_eval(rows: list[tuple]) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Insert all rows at once. ON CONFLICT means: if a row for this same
            # forecast already exists, update it instead of erroring
            execute_values(cur, """
                                INSERT INTO forecast_eval (station_id, valid_time, issued_time, horizon_hours,
                                                           model_version, predicted_pm25, actual_pm25)
                                VALUES %s
                                    ON CONFLICT (station_id, valid_time, issued_time, horizon_hours)
                DO UPDATE SET predicted_pm25 = EXCLUDED.predicted_pm25,
                                                           actual_pm25    = EXCLUDED.actual_pm25,
                                                           model_version  = EXCLUDED.model_version
                                """, rows)   # note: abs_error is filled in by Postgres itself
        conn.commit()
    finally:
        conn.close()


# Print the average error per station and model over the last ROLLING_DAYS days. (Mean Absolute Error)
# MAE tells us how far off PM2.5 predictions are - such as +- 2 or 3 (predicton - actual)
def report_rolling_mae() -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        # Average the absolute error, grouped by station and model version.
        cur.execute(f"""
            SELECT station_id, coalesce(model_version, 'skeleton') AS model,
                   round(avg(abs_error)::numeric, 2) AS rolling_mae, count(*) AS n
            FROM forecast_eval
            WHERE valid_time >= now() - interval '{ROLLING_DAYS} days'
            GROUP BY 1, 2 ORDER BY 1, 2
        """)
        print(f"\nrolling {ROLLING_DAYS}d MAE (station, model, mae, n):")
        for r in cur.fetchall():
            print(" ", r)
    finally:
        conn.close()


if __name__ == "__main__":
    # Full run: get mature forecasts, match them to actuals, save the matches,
    # then print the rolling error.
    fc = read_mature_forecasts()
    rows = build_eval_rows(fc, read_actuals())
    print(f"{len(fc)} mature forecasts in window, {len(rows)} matched to actuals")
    if rows:
        upsert_eval(rows)
    report_rolling_mae()
