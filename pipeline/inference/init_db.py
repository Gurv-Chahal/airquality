# Phase 3a — creates the two Postgres tables the website reads from: "forecast"
# (the predictions) and "forecast_eval" (predictions scored against reality).
# Everything uses IF NOT EXISTS, so running this again does nothing harmful —
# that's why it's safe to run repeatedly, including from the scheduled job in
# Phase 5. web/db/schema.ts describes these same two tables for the frontend.
import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()

# All the table/index setup as one SQL script. DDL = "Data Definition Language",
# meaning the SQL that defines database structure (as opposed to reading/writing rows).
DDL = """
      CREATE TABLE IF NOT EXISTS forecast (
                                              station_id      TEXT        NOT NULL,
                                              valid_time      TIMESTAMPTZ NOT NULL,   -- the hour being predicted
                                              issued_time     TIMESTAMPTZ NOT NULL,   -- when the forecast was made
                                              horizon_hours   INTEGER     NOT NULL,
                                              predicted_pm25  REAL,
                                              exceedance_prob REAL,
                                              pm25_aqi_band   TEXT,
                                              model_version   TEXT,                   -- e.g. 'pm25-lstm:v1' or 'persistence'
          -- these four columns together uniquely identify a forecast row
                                              PRIMARY KEY (station_id, valid_time, issued_time, horizon_hours)
          );

      -- upgrade path: the earliest version of this table had no model_version column,
-- so add it if it's missing (does nothing on a fresh table that already has it)
      ALTER TABLE forecast ADD COLUMN IF NOT EXISTS model_version TEXT;

-- one row per forecast, filled in later once the real reading for that hour arrives
      CREATE TABLE IF NOT EXISTS forecast_eval (
                                                   station_id      TEXT        NOT NULL,
                                                   valid_time      TIMESTAMPTZ NOT NULL,
                                                   issued_time     TIMESTAMPTZ NOT NULL,
                                                   horizon_hours   INTEGER     NOT NULL,
                                                   model_version   TEXT,
                                                   predicted_pm25  REAL        NOT NULL,
                                                   actual_pm25     REAL        NOT NULL,
          -- error is computed by the database itself from the two columns above,
          -- so it can never disagree with them; STORED means it's saved on disk
                                                   abs_error       REAL        GENERATED ALWAYS AS (abs(predicted_pm25 - actual_pm25)) STORED,
          evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),   -- when this row was scored
          PRIMARY KEY (station_id, valid_time, issued_time, horizon_hours)
          );

      -- indexes that make the website's two main queries fast: "newest forecast per
-- station" and "recent scoring history per station"
      CREATE INDEX IF NOT EXISTS forecast_station_issued_idx
          ON forecast (station_id, issued_time DESC);
      CREATE INDEX IF NOT EXISTS forecast_eval_station_valid_idx
          ON forecast_eval (station_id, valid_time DESC); \
      """

if __name__ == "__main__":
    # Connect to Postgres using the connection string from the .env file.
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        # Run the whole DDL script, then commit so the changes are saved.
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
        # Sanity check: ask the database how many columns each table now has and
        # print it, so you can see the setup actually took effect.
        with conn.cursor() as cur:
            cur.execute("""SELECT table_name, count(*) FROM information_schema.columns
                           WHERE table_name IN ('forecast', 'forecast_eval')
                           GROUP BY 1 ORDER BY 1""")
            for name, ncols in cur.fetchall():
                print(f"{name}: {ncols} columns")
    finally:
        # Always close the connection, even if the setup above failed partway.
        conn.close()