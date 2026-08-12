"""Residual LSTM for PM2.5 forecasting."""

import torch.nn as nn


class ResidualLSTMRegressor(nn.Module):
    """
    Predicts the change from current PM2.5 rather than absolute PM2.5.

    Final prediction is calculated outside the model:

        predicted_pm25 = current_pm25 + predicted_change
    """

    def __init__(
            self,
            n_features: int,
            hidden: int = 64,
            layers: int = 1,
            dropout: float = 0.0,
    ):
        super().__init__()

        self.lstm = nn.LSTM(
            input_size=n_features,
            hidden_size=hidden,
            num_layers=layers,
            batch_first=True,
            dropout=dropout if layers > 1 else 0.0,
        )

        self.head = nn.Linear(hidden, 1)

    def forward(self, x):
        output, _ = self.lstm(x)
        return self.head(output[:, -1]).squeeze(-1)