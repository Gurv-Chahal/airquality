"""Torch-free array prep shared by baselines (2c) and the LSTM (2d): the time-aware
split and the train-only feature scaler. Kept separate from the torch Dataset so a
process can use these without importing torch (which segfaults alongside xgboost on macOS)."""
import numpy as np
from sklearn.preprocessing import StandardScaler


def time_split(meta, val_frac=0.15, test_frac=0.15):
    """Split by TARGET time: train=past, val/test=future. Returns index arrays."""
    order = np.argsort(meta["valid_time"].to_numpy())      # earliest -> latest
    n = len(order); n_te = int(n * test_frac); n_va = int(n * val_frac)
    return order[:-(n_va + n_te)], order[-(n_va + n_te):-n_te], order[-n_te:]


def fit_feature_scaler(X_train):
    n, L, F = X_train.shape
    return StandardScaler().fit(X_train.reshape(-1, F))     # fit on TRAIN windows only


def apply_scaler(sc, X):
    n, L, F = X.shape
    return sc.transform(X.reshape(-1, F)).reshape(n, L, F).astype(np.float32)
