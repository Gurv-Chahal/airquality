# Once per run it: reads each station's most
# recent features from PostgreSQL, loads the exact model version we've pinned from
# Weights & Biases (its weights, its scaler, and its config), predicts the PM2.5
# 24 hours from now for each station, and saves those predictions into Postgres.
# -> production gets produced -> turned into a stored forecast

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]        # the pipeline/ folder
sys.path.insert(0, str(ROOT / "modeling"))        # so we can import windowing.py and model.py

import joblib
import numpy as np
import pandas as pd
import torch
import wandb
from psycopg2.extras import execute_values

from common.aqi import pm25_to_aqi_band
from common.postgres_io import fetch_df, get_connection
from model import LSTMRegressor
from windowing import latest_window

# The one exact model version this job uses. Pinning a specific version
# means retraining a new model can never silently change what production predicts.
ARTIFACT = "gurv-ch32-university-of-the-fraser-valley/airquality-pm25/pm25-lstm:v3"
MODEL_VERSION = ARTIFACT.rsplit("/", 1)[-1]
FEATURE_TABLE = "analytics.feat_airquality"
LOOKBACK_HOURS = 168   # pull a full week so short gaps can't starve the 48h window


# Download the pinned model and everything needed to run it exactly like training did.
def load_artifact():
    art_dir = Path(wandb.Api().artifact(ARTIFACT).download())
    prep = joblib.load(art_dir / "preprocess.joblib")
    cfg = json.loads((art_dir / "model_config.json").read_text())
    # Rebuild the network with the same shape, then load the trained weights into it.
    model = LSTMRegressor(
        cfg["n_features"],
        cfg["hidden"],
        cfg["layers"],
        cfg["dropout"],
        residual=bool(cfg.get("residual", prep.get("residual", False))),
    )
    model.load_state_dict(torch.load(art_dir / "model.pt", map_location="cpu", weights_only=True))
    model.eval() # switch to prediction mode (no training behavior)
    return model, prep


# Read the last week of feature rows for every station from PostgreSQL.
def read_latest_features() -> pd.DataFrame:
    df = fetch_df(f"""
        select *
        from (
            select
                features.*,
                row_number() over (
                    partition by station_id
                    order by valid_time desc
                ) as _row_number
            from {FEATURE_TABLE} as features
        ) as ranked
        where _row_number <= {LOOKBACK_HOURS}
    """)

    df.columns = [column.lower() for column in df.columns]
    return df.drop(columns=["_row_number"], errors="ignore")


def as_utc(value) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)

    if timestamp.tzinfo is None:
        return timestamp.tz_localize("UTC")

    return timestamp.tz_convert("UTC")

# Turn the feature rows into one forecast row per station, ready to save.
def build_rows(df: pd.DataFrame, model, prep) -> list[tuple]:
    seq_len = int(prep["seq_len"])
    horizon = int(prep["horizon"])
    pm25_index = prep["feature_cols"].index("pm25")
    rows = []
    for sid, g in df.groupby("station_id"):
        try:
            # Grab the most recent unbroken 48-hour window; anchor = its last hour.
            w, anchor = latest_window(g, prep["feature_cols"], seq_len)
        except ValueError:
            # If the latest 48 hours have a gap, we can't predict safely — skip this station.
            print(f"{sid:<14} no contiguous {seq_len}h window — skipped")
            continue
        # Scaling hides the raw PM2.5 value, so preserve it separately for a
        # residual model. Older absolute models safely ignore this argument.
        x = prep["scaler"].transform(w).astype(np.float32)
        current_pm25 = torch.tensor(
            [[w[-1, pm25_index]]],
            dtype=torch.float32,
        )
        with torch.no_grad():
            pred = model(
                torch.from_numpy(x).unsqueeze(0),
                current_pm25,
            ).item()
        pred = max(pred, 0.0)

        # The window's last hour is when the forecast is "issued"; valid_time is
        # that hour plus the 24h horizon (the hour we're actually predicting).
        issued = as_utc(anchor)
        valid = issued + pd.Timedelta(horizon, unit="h")
        band = pm25_to_aqi_band(pred) # turn the number into a health label
        print(f"{sid:<14} anchor={issued}  t+{horizon}h -> {pred:.1f} µg/m³ ({band})")
        rows.append((sid, valid, issued, horizon, pred, None, band, MODEL_VERSION))
    return rows


# Save the forecast rows to Postgres.
def upsert_forecast(rows: list[tuple]) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Insert all rows; if one already exists for this station/hour, update
            # it instead of erroring. This is what makes re-running in the same
            # hour safe — it refreshes the forecast rather than duplicating it.
            execute_values(cur, """
                                INSERT INTO forecast (station_id, valid_time, issued_time, horizon_hours,
                                                      predicted_pm25, exceedance_prob, pm25_aqi_band, model_version)
                                VALUES %s
                                    ON CONFLICT (station_id, valid_time, issued_time, horizon_hours)
                DO UPDATE SET predicted_pm25  = EXCLUDED.predicted_pm25,
                                                           exceedance_prob = EXCLUDED.exceedance_prob,
                                                           pm25_aqi_band   = EXCLUDED.pm25_aqi_band,
                                                           model_version   = EXCLUDED.model_version
                                """, rows)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    # Full run: load the pinned model, build one forecast per station, save them.
    model, prep = load_artifact()
    rows = build_rows(read_latest_features(), model, prep)
    upsert_forecast(rows)
    print(f"upserted {len(rows)} forecast rows ({MODEL_VERSION})")
