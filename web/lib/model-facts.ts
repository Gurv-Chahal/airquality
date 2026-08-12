// Verified v3 facts. Sources in this repository:
//  - pipeline/modeling/05_verify_metrics.ipynb
//  - pipeline/modeling/artifacts/v3/baseline_metrics.csv
//  - pipeline/modeling/artifacts/v3/windows.npz
//
// The held-out test period starts on 2026-08-01. Neither v3 nor XGBoost saw
// those targets during evaluation training.

export type OfflineMetric = {
    model: string;
    mae: number;
    rmse: number;
    highMae: number;
    recall: number;
    note: string;
    ours?: boolean;
};

export const OFFLINE_METRICS: OfflineMetric[] = [
    {
        model: "Climatology",
        mae: 13.272,
        rmse: 25.117,
        highMae: 55.960,
        recall: 0,
        note: "historical average for station and hour",
    },
    {
        model: "24 h persistence",
        mae: 12.338,
        rmse: 23.004,
        highMae: 32.627,
        recall: 0.475,
        note: "same PM2.5 as this hour yesterday",
    },
    {
        model: "XGBoost",
        mae: 11.908,
        rmse: 20.738,
        highMae: 42.137,
        recall: 0.068,
        note: "boosted trees trained on the same development period",
    },
    {
        model: "Residual LSTM v3",
        mae: 12.625,
        rmse: 21.963,
        highMae: 30.138,
        recall: 0.458,
        note: "48 h × 16 features → 64 hidden units",
        ours: true,
    },
];

export const LSTM_OFFLINE = OFFLINE_METRICS.find((metric) => metric.ours)!;
export const PERSISTENCE_OFFLINE = OFFLINE_METRICS.find(
    (metric) => metric.model === "24 h persistence",
)!;
export const XGB_OFFLINE = OFFLINE_METRICS.find(
    (metric) => metric.model === "XGBoost",
)!;

export const highMaePctVsXgb =
    (1 - LSTM_OFFLINE.highMae / XGB_OFFLINE.highMae) * 100;

export const rmsePctVsPersistence =
    (1 - LSTM_OFFLINE.rmse / PERSISTENCE_OFFLINE.rmse) * 100;

export const FACTS = {
    stations: 3,
    windows: 64_916,
    developmentWindows: 64_148,
    testWindows: 768,
    highEvents: 118,
    severeEvents: 63,
    v3DetectedEvents: 54,
    xgbDetectedEvents: 8,
    rawRecords: 146_745,
    pm25Rows: 67_833,
    weatherRows: 78_912,
    featureRows: 68_509,
    duplicateNaturalKeys: 0,
    externalApis: 2,
    years: 3,
    nFeatures: 16,
    seqLen: 48,
    horizonHours: 24,
    hidden: 64,
    artifact: "pm25-lstm:v3",
    testStart: "2026-08-01",
};
