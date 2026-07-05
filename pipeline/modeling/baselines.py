"""Phase 2c baselines — the bar the LSTM has to beat.

Seasonal-persistence (t-24), per-(station, hour-of-day) climatology, and XGBoost on
flattened windows. All three predict the same t+24h target and are scored with MAE/RMSE
on the same test split, so they're directly comparable to the LSTM later.
"""
import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from windowing import FEATURE_COLS

PM25_IDX = FEATURE_COLS.index("pm25")        # pm25 at the window's last hour = value at time t
HOUR_IDX = FEATURE_COLS.index("hour_local")  # local hour at time t (== target hour, +24h is same clock hour)


def mae(pred, y):  return float(np.abs(pred - y).mean())
def rmse(pred, y): return float(np.sqrt(((pred - y) ** 2).mean()))


def persistence(X):
    """Seasonal persistence: predict pm25(t+24) = pm25(t), the last hour of the window."""
    return X[:, -1, PM25_IDX]


def climatology(X_train, y_train, meta_train, X_eval, meta_eval):
    """Per-(station, hour-of-day) mean PM2.5 learned on train, applied to eval.
    (DST can shift the target hour by 1h twice a year — negligible for a baseline.)"""
    train = pd.DataFrame({"station": meta_train["station_id"].to_numpy(),
                          "hour": X_train[:, -1, HOUR_IDX].astype(int),
                          "y": y_train})
    table = (train.groupby(["station", "hour"], as_index=False).y.mean()
                  .rename(columns={"y": "pred"}))
    ev = pd.DataFrame({"station": meta_eval["station_id"].to_numpy(),
                       "hour": X_eval[:, -1, HOUR_IDX].astype(int)})
    return (ev.merge(table, on=["station", "hour"], how="left")["pred"]
              .fillna(y_train.mean()).to_numpy())


def xgb_baseline(X_train, y_train, X_eval):
    """XGBoost on flattened windows. Trees are scale-invariant, so raw features are fine."""
    model = XGBRegressor(n_estimators=300, max_depth=6, learning_rate=0.05,
                         subsample=0.8, colsample_bytree=0.8, random_state=0)
    model.fit(X_train.reshape(len(X_train), -1), y_train)
    return model.predict(X_eval.reshape(len(X_eval), -1))
