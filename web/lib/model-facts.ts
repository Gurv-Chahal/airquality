// Published facts about the trained model — static because they describe the
// (offline) training run, not live state. Sources in this repo:
//  - pipeline/modeling/artifacts/baseline_metrics.csv        (baseline metrics, exact)
//  - pipeline/modeling/wandb/run-20260701_185521-gwi71yr6    (LSTM test_mae 2.7899 / test_rmse 4.1383,
//    config: 60 epochs, batch 64, lr 1e-3, hidden 64, 1 layer, seq_len 48, horizon 24)
//  - pipeline/modeling/artifacts/windows.npz                 (44,760 / 9,591 / 9,591 = 63,942 windows, 70/15/15)
//  - pipeline/modeling/feat_airquality.parquet               (67,536 hourly rows, 13 features)

export type OfflineMetric = {
    model: string;
    mae: number;
    rmse: number;
    note: string;
    ours?: boolean;
};

// Held-out future test period, identical for all four models.
export const OFFLINE_METRICS: OfflineMetric[] = [
    { model: "Climatology", mae: 4.094, rmse: 5.294, note: "typical value for this hour of day" },
    { model: "Seasonal persistence", mae: 2.879, rmse: 5.019, note: "same as this hour yesterday" },
    { model: "XGBoost (tuned)", mae: 2.847, rmse: 4.276, note: "gradient-boosted trees on the flattened window" },
    { model: "LSTM — ours", mae: 2.79, rmse: 4.138, note: "48 h × 13 features → 64 hidden units", ours: true },
];

export const LSTM_OFFLINE = OFFLINE_METRICS.find((m) => m.ours)!;
export const PERSISTENCE_OFFLINE = OFFLINE_METRICS.find((m) => m.model === "Seasonal persistence")!;
export const XGB_OFFLINE = OFFLINE_METRICS.find((m) => m.model.startsWith("XGBoost"))!;

export const rmsePctVsPersistence = (1 - LSTM_OFFLINE.rmse / PERSISTENCE_OFFLINE.rmse) * 100; // ≈ 17.6
export const rmsePctVsXgb = (1 - LSTM_OFFLINE.rmse / XGB_OFFLINE.rmse) * 100; // ≈ 3.2

export const FACTS = {
    windows: 63_942,
    featureRows: 67_536,
    nFeatures: 13,
    seqLen: 48,
    horizonHours: 24,
    epochs: 60,
    hidden: 64,
    layers: 1,
    batch: 64,
    lr: "1e-3",
    artifact: "pm25-lstm:v1",
    split: "70 / 15 / 15",
};
