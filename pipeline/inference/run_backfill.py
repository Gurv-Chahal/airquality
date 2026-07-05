"""
Backfill forecasts: run the pinned model on EVERY valid hourly anchor in the recent
past (not just the latest one, like run_forecast).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]        # -> pipeline/
sys.path.insert(0, str(ROOT / "modeling"))        # windowing.py, model.py

import numpy as np
import pandas as pd
import torch

from common.aqi import pm25_to_aqi_band
from common.snowflake_io import fetch_df
from inference.run_forecast import FEATURE_TABLE, MODEL_VERSION, load_artifact, upsert_forecast
from windowing import _hours, _valid_anchors

BACKFILL_DAYS = 8                                 # of anchors -> ~7 days of past + 24h of future
LOOKBACK_HOURS = (BACKFILL_DAYS + 3) * 24         # extra 48h window + slack for gaps


def read_features() -> pd.DataFrame:
    df = fetch_df(f"""
        select * from {FEATURE_TABLE}
        qualify row_number() over (partition by station_id order by valid_time desc) <= {LOOKBACK_HOURS}
    """)
    df.columns = [c.lower() for c in df.columns]
    return df


def backfill_rows(df: pd.DataFrame, model, prep) -> list[tuple]:
    seq_len, horizon, feature_cols = prep["seq_len"], prep["horizon"], prep["feature_cols"]
    rows = []
    for sid, g in df.groupby("station_id"):
        g = g.sort_values("valid_time").dropna(subset=feature_cols)
        if len(g) <= seq_len:
            print(f"{sid:<14} not enough contiguous history — skipped")
            continue
        times = _hours(g["valid_time"])
        feats = g[feature_cols].to_numpy(np.float32)
        vt = g["valid_time"].to_numpy()

        anchors = [i for i, _ in _valid_anchors(times, seq_len, horizon, require_target=False)]
        if not anchors:
            print(f"{sid:<14} no valid windows — skipped")
            continue

        X = np.stack([feats[i - seq_len + 1: i + 1] for i in anchors])
        n, L, F = X.shape
        Xs = prep["scaler"].transform(X.reshape(-1, F)).reshape(n, L, F).astype(np.float32)
        with torch.no_grad():
            preds = model(torch.from_numpy(Xs)).numpy().ravel()

        for i, p in zip(anchors, preds):
            p = max(float(p), 0.0)
            issued = pd.Timestamp(vt[i]).tz_localize("UTC")
            valid = issued + pd.Timedelta(hours=horizon)
            rows.append((sid, valid, issued, horizon, p, None, pm25_to_aqi_band(p), MODEL_VERSION))
        print(f"{sid:<14} {len(anchors)} forecasts issued "
              f"(anchors {pd.Timestamp(vt[anchors[0]])} .. {pd.Timestamp(vt[anchors[-1]])})")
    return rows


if __name__ == "__main__":
    model, prep = load_artifact()
    rows = backfill_rows(read_features(), model, prep)
    upsert_forecast(rows)
    print(f"upserted {len(rows)} forecast rows ({MODEL_VERSION})")
