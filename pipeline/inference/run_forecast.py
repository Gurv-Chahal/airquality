# Once per run it: reads each station's most
# recent features from Snowflake, loads the exact model version we've pinned from
# Weights & Biases (its weights, its scaler, and its config), predicts the PM2.5
# 24 hours from now for each station, and saves those predictions into Postgres.
# -> production gets produced -> turned into a stored forecast

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]        # the pipeline/ folder
sys.path.insert(0, str(ROOT / "modeling"))        # so we can import windowing.py and model.py

import joblib
import numpy as np
import pandas as pd
import psycopg2
import torch
import wandb
from psycopg2.extras import execute_values

from common.aqi import pm25_to_aqi_band
from common.snowflake_io import fetch_df
from model import LSTMRegressor
from windowing import latest_window

# The one exact model version this job uses. Pinning a specific version (":v1")
# means retraining a new model can never silently change what production predicts.
ARTIFACT = "gurv-ch32-university-of-the-fraser-valley/airquality-pm25/pm25-lstm:v1"
MODEL_VERSION = ARTIFACT.rsplit("/", 1)[-1]
FEATURE_TABLE = "AIRQUALITY.ANALYTICS.FEAT_AIRQUALITY"
LOOKBACK_HOURS = 168   # pull a full week so short gaps can't starve the 48h window


# Download the pinned model and everything needed to run it exactly like training did.
def load_artifact():
    art_dir = Path(wandb.Api().artifact(ARTIFACT).download())
    prep = joblib.load(art_dir / "preprocess.joblib")
    cfg = json.loads((art_dir / "model_config.json").read_text())
    # Rebuild the network with the same shape, then load the trained weights into it.
    model = LSTMRegressor(cfg["n_features"], cfg["hidden"], cfg["layers"], cfg["dropout"])
    model.load_state_dict(torch.load(art_dir / "model.pt", map_location="cpu", weights_only=True))
    model.eval() # switch to prediction mode (no training behavior)
    return model, prep


# Read the last week of feature rows for every station from Snowflake.
def read_latest_features() -> pd.DataFrame:
    # "qualify row_number() ..." keeps only the newest LOOKBACK_HOURS rows per station.
    df = fetch_df(f"""
        select * from {FEATURE_TABLE}
        qualify row_number() over (partition by station_id order by valid_time desc) <= {LOOKBACK_HOURS}
    """)
    df.columns = [c.lower() for c in df.columns]  # Snowflake returns UPPERCASE names; make them lowercase
    return df


# Turn the feature rows into one forecast row per station, ready to save.
def build_rows(df: pd.DataFrame, model, prep) -> list[tuple]:
    rows = []
    for sid, g in df.groupby("station_id"):
        try:
            # Grab the most recent unbroken 48-hour window; anchor = its last hour.
            w, anchor = latest_window(g, prep["feature_cols"], prep["seq_len"])
        except ValueError:
            # If the latest 48 hours have a gap, we can't predict safely — skip this station.
            print(f"{sid:<14} no contiguous {prep['seq_len']}h window — skipped")
            continue
        # Scale the window with the SAME scaler used in training, then run the model.
        x = prep["scaler"].transform(w).astype(np.float32)
        with torch.no_grad():                                       # no gradients needed for prediction
            pred = float(model(torch.from_numpy(x).unsqueeze(0)))   # add a batch dimension, get one number back
        pred = max(pred, 0.0)                                       # a pollution level can't be negative

        # The window's last hour is when the forecast is "issued"; valid_time is
        # that hour plus the 24h horizon (the hour we're actually predicting).
        issued = pd.Timestamp(anchor).tz_localize("UTC")
        valid = issued + pd.Timedelta(hours=prep["horizon"])
        band = pm25_to_aqi_band(pred) # turn the number into a health label
        print(f"{sid:<14} anchor={issued}  t+{prep['horizon']}h -> {pred:.1f} µg/m³ ({band})")
        rows.append((sid, valid, issued, prep["horizon"], pred, None, band, MODEL_VERSION))
    return rows


# Save the forecast rows to Postgres.
def upsert_forecast(rows: list[tuple]) -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
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