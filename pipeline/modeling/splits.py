"""Torch-free array prep shared by baselines (2c) and the LSTM (2d): the time-aware
split and the train-only feature scaler. Kept separate from the torch Dataset so a
process can use these without importing torch (which segfaults alongside xgboost on macOS)."""
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


def time_split(
        meta,
        val_frac=0.15,
        test_frac=0.15,
        validation_start=None,
        test_start=None,
):
    """
    Split by target time.

    Explicit dates are used for v3. Fraction-based splitting remains available
    for the older notebooks.
    """

    if validation_start is not None or test_start is not None:
        if validation_start is None or test_start is None:
            raise ValueError(
                "validation_start and test_start must be provided together"
            )

        target_time = pd.to_datetime(meta["valid_time"], utc=True)

        validation_start = pd.Timestamp(validation_start)
        test_start = pd.Timestamp(test_start)

        validation_start = (
            validation_start.tz_localize("UTC")
            if validation_start.tzinfo is None
            else validation_start.tz_convert("UTC")
        )

        test_start = (
            test_start.tz_localize("UTC")
            if test_start.tzinfo is None
            else test_start.tz_convert("UTC")
        )

        train = np.flatnonzero(
            np.asarray(target_time < validation_start)
        )

        validation = np.flatnonzero(
            np.asarray(
                (target_time >= validation_start)
                & (target_time < test_start)
            )
        )

        test = np.flatnonzero(
            np.asarray(target_time >= test_start)
        )

        return train, validation, test

    order = np.argsort(meta["valid_time"].to_numpy())
    n = len(order)
    n_test = int(n * test_frac)
    n_validation = int(n * val_frac)

    return (
        order[: -(n_validation + n_test)],
        order[-(n_validation + n_test) : -n_test],
        order[-n_test:],
    )


def fit_feature_scaler(X_train):
    n, L, F = X_train.shape
    return StandardScaler().fit(X_train.reshape(-1, F))     # fit on TRAIN windows only


def apply_scaler(sc, X):
    n, L, F = X.shape
    return sc.transform(X.reshape(-1, F)).reshape(n, L, F).astype(np.float32)
