"""Create the public PostgreSQL tables consumed by the dashboard."""

from common.postgres_io import get_connection


DDL = """
CREATE TABLE IF NOT EXISTS public.forecast (
    station_id      TEXT        NOT NULL,
    valid_time      TIMESTAMPTZ NOT NULL,
    issued_time     TIMESTAMPTZ NOT NULL,
    horizon_hours   INTEGER     NOT NULL,
    predicted_pm25  REAL,
    exceedance_prob REAL,
    pm25_aqi_band   TEXT,
    model_version   TEXT,
    PRIMARY KEY (station_id, valid_time, issued_time, horizon_hours)
);

ALTER TABLE public.forecast
    ADD COLUMN IF NOT EXISTS model_version TEXT;

CREATE TABLE IF NOT EXISTS public.forecast_eval (
    station_id      TEXT        NOT NULL,
    valid_time      TIMESTAMPTZ NOT NULL,
    issued_time     TIMESTAMPTZ NOT NULL,
    horizon_hours   INTEGER     NOT NULL,
    model_version   TEXT,
    predicted_pm25  REAL        NOT NULL,
    actual_pm25     REAL        NOT NULL,
    abs_error       REAL GENERATED ALWAYS AS (
        abs(predicted_pm25 - actual_pm25)
    ) STORED,
    evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (station_id, valid_time, issued_time, horizon_hours)
);

CREATE INDEX IF NOT EXISTS forecast_station_issued_idx
    ON public.forecast (station_id, issued_time DESC);

CREATE INDEX IF NOT EXISTS forecast_eval_station_valid_idx
    ON public.forecast_eval (station_id, valid_time DESC);
"""


if __name__ == "__main__":
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(DDL)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name, count(*)
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name IN ('forecast', 'forecast_eval')
                GROUP BY table_name
                ORDER BY table_name
                """
            )
            for name, column_count in cur.fetchall():
                print(f"{name}: {column_count} columns")
    finally:
        conn.close()
