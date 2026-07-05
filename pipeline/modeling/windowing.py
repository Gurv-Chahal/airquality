"""Shared contiguity-aware windowing. Used by BOTH training (build_supervised) and
inference (latest_window) -> no train/serve skew. Windows never straddle a dropped gap."""
from __future__ import annotations
import numpy as np, pandas as pd

HORIZON = 24        # predict t + 24h
SEQ_LEN = 48        # input window = last 48 hours

# Every model input comes straight from the dbt feat_airquality table — dbt stays the
# single source of truth, so there's no feature engineering here to drift between train & serve.
FEATURE_COLS = ["pm25", "pm25_lag_1h", "pm25_lag_24h", "pm25_lag_48h",
                "pm25_roll_mean_24h", "pm25_roll_max_24h",
                "temperature_2m", "wind_speed_10m", "wind_direction_10m", "precipitation",
                "hour_local", "day_of_week", "was_imputed"]

def _hours(s: pd.Series) -> np.ndarray:
    return pd.to_datetime(s, utc=True).dt.tz_localize(None).to_numpy("datetime64[h]")

def _valid_anchors(times, seq_len, horizon, require_target):
    """positions i where [i-seq_len+1 .. i] are hourly-contiguous and (opt.) t+horizon exists."""
    tset = {t: k for k, t in enumerate(times)}
    step = np.timedelta64(1, "h")
    for i in range(seq_len - 1, len(times)):
        if times[i] - times[i - seq_len + 1] != (seq_len - 1) * step:   # gap in the input window
            continue
        if require_target:
            j = tset.get(times[i] + horizon * step)
            if j is None:
                continue
            yield i, j
        else:
            yield i, None

def build_supervised(df, feature_cols=FEATURE_COLS, seq_len=SEQ_LEN, horizon=HORIZON):
    """Per-station windows -> X:(n,seq_len,F), y:(n,), meta DataFrame."""
    Xs, ys, meta = [], [], []
    for sid, g in df.groupby("station_id", sort=False):
        g = g.sort_values("valid_time").dropna(subset=feature_cols)   # drops leading lag-NaN rows
        if len(g) <= seq_len:
            continue
        times = _hours(g["valid_time"])
        feats = g[feature_cols].to_numpy(np.float32)
        pm25  = g["pm25"].to_numpy(np.float32)
        vt    = g["valid_time"].to_numpy()
        for i, j in _valid_anchors(times, seq_len, horizon, require_target=True):
            Xs.append(feats[i - seq_len + 1 : i + 1]); ys.append(pm25[j])
            meta.append((sid, vt[i], vt[j]))
    X = np.stack(Xs); y = np.asarray(ys, np.float32)
    meta = pd.DataFrame(meta, columns=["station_id", "anchor_time", "valid_time"])
    return X, y, meta

def latest_window(df_station, feature_cols=FEATURE_COLS, seq_len=SEQ_LEN):
    """Inference: most-recent contiguous seq_len window for one station -> (seq_len,F), anchor_time."""
    g = df_station.sort_values("valid_time").dropna(subset=feature_cols)
    times, feats = _hours(g["valid_time"]), g[feature_cols].to_numpy(np.float32)
    last = None
    for i, _ in _valid_anchors(times, seq_len, HORIZON, require_target=False):
        last = i
    if last is None:
        raise ValueError("no contiguous window available")
    return feats[last - seq_len + 1 : last + 1], g["valid_time"].iloc[last]