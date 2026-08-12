"""Shared, gap-aware windowing used by both training and inference.

The database remains the source of truth for measured and weather features.
Station identity is added here so the exact same derived columns are created
during training, live forecasting, and backfills.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


HORIZON = 24
SEQ_LEN = 48

BASE_FEATURE_COLS = [
    "pm25",
    "pm25_lag_1h",
    "pm25_lag_24h",
    "pm25_lag_48h",
    "pm25_roll_mean_24h",
    "pm25_roll_max_24h",
    "temperature_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "precipitation",
    "hour_local",
    "day_of_week",
    "was_imputed",
]

STATION_FEATURES = {
    "station_is_kelowna": "kelowna",
    "station_is_prince_george": "prince_george",
    "station_is_vancouver": "vancouver",
}

FEATURE_COLS = BASE_FEATURE_COLS + list(STATION_FEATURES)


def add_station_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add stable one-hot station columns without mutating the caller's frame."""
    result = df.copy()
    for column, station_id in STATION_FEATURES.items():
        result[column] = (result["station_id"] == station_id).astype(np.float32)
    return result


def _hours(series: pd.Series) -> np.ndarray:
    return (
        pd.to_datetime(series, utc=True)
        .dt.tz_localize(None)
        .to_numpy("datetime64[h]")
    )


def _valid_anchors(times, seq_len, horizon, require_target):
    """Yield anchors whose input window is hourly-contiguous."""
    time_to_position = {timestamp: position for position, timestamp in enumerate(times)}
    one_hour = np.timedelta64(1, "h")

    for anchor in range(seq_len - 1, len(times)):
        first = anchor - seq_len + 1
        if times[anchor] - times[first] != (seq_len - 1) * one_hour:
            continue

        if require_target:
            target = time_to_position.get(times[anchor] + horizon * one_hour)
            if target is None:
                continue
            yield anchor, target
        else:
            yield anchor, None


def build_supervised(
    df,
    feature_cols=FEATURE_COLS,
    seq_len=SEQ_LEN,
    horizon=HORIZON,
):
    """Build per-station windows and exact t+horizon targets."""
    df = add_station_features(df)
    windows = []
    targets = []
    metadata = []

    for station_id, group in df.groupby("station_id", sort=False):
        group = group.sort_values("valid_time").dropna(subset=feature_cols)
        if len(group) <= seq_len:
            continue

        times = _hours(group["valid_time"])
        features = group[feature_cols].to_numpy(np.float32)
        pm25 = group["pm25"].to_numpy(np.float32)
        valid_times = group["valid_time"].to_numpy()

        for anchor, target in _valid_anchors(
            times,
            seq_len,
            horizon,
            require_target=True,
        ):
            windows.append(features[anchor - seq_len + 1 : anchor + 1])
            targets.append(pm25[target])
            metadata.append(
                (station_id, valid_times[anchor], valid_times[target])
            )

    if not windows:
        raise ValueError("no valid supervised windows available")

    X = np.stack(windows)
    y = np.asarray(targets, np.float32)
    meta = pd.DataFrame(
        metadata,
        columns=["station_id", "anchor_time", "valid_time"],
    )
    return X, y, meta


def latest_window(
    df_station,
    feature_cols=FEATURE_COLS,
    seq_len=SEQ_LEN,
):
    """Return the most recent contiguous window for a single station."""
    group = add_station_features(df_station)
    group = group.sort_values("valid_time").dropna(subset=feature_cols)

    times = _hours(group["valid_time"])
    features = group[feature_cols].to_numpy(np.float32)
    last_anchor = None

    for anchor, _ in _valid_anchors(
        times,
        seq_len,
        HORIZON,
        require_target=False,
    ):
        last_anchor = anchor

    if last_anchor is None:
        raise ValueError("no contiguous window available")

    window = features[last_anchor - seq_len + 1 : last_anchor + 1]
    return window, group["valid_time"].iloc[last_anchor]
