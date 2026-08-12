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
from common.postgres_io import fetch_df
from inference.run_forecast import (
    FEATURE_TABLE,
    MODEL_VERSION,
    as_utc,
    load_artifact,
    upsert_forecast,
)
from windowing import _hours, _valid_anchors, add_station_features

BACKFILL_DAYS = 8                                 # of anchors -> ~7 days of past + 24h of future
LOOKBACK_HOURS = (BACKFILL_DAYS + 3) * 24         # extra 48h window + slack for gaps


def read_features() -> pd.DataFrame:
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


def backfill_rows(df: pd.DataFrame, model, prep) -> list[tuple]:
    seq_len = int(prep["seq_len"])
    horizon = int(prep["horizon"])
    feature_cols = prep["feature_cols"]
    pm25_index = feature_cols.index("pm25")
    rows = []
    for sid, g in df.groupby("station_id"):
        g = add_station_features(g)
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
        current_pm25 = torch.from_numpy(
            X[:, -1, pm25_index]
        ).float().unsqueeze(1)
        with torch.no_grad():
            preds = model(
                torch.from_numpy(Xs),
                current_pm25,
            ).numpy().ravel()

        for i, p in zip(anchors, preds):
            p = max(float(p), 0.0)
            issued = as_utc(vt[i])
            valid = issued + pd.Timedelta(horizon, unit="h")
            rows.append((sid, valid, issued, horizon, p, None, pm25_to_aqi_band(p), MODEL_VERSION))
        print(f"{sid:<14} {len(anchors)} forecasts issued "
              f"(anchors {pd.Timestamp(vt[anchors[0]])} .. {pd.Timestamp(vt[anchors[-1]])})")
    return rows


if __name__ == "__main__":
    model, prep = load_artifact()
    rows = backfill_rows(read_features(), model, prep)
    upsert_forecast(rows)
    print(f"upserted {len(rows)} forecast rows ({MODEL_VERSION})")
