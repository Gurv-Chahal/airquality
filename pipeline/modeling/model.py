"""LSTM used by both training and inference."""

import torch
import torch.nn as nn


class LSTMRegressor(nn.Module):
    def __init__(
            self,
            n_features,
            hidden=64,
            layers=1,
            dropout=0.0,
            residual=False,
    ):
        super().__init__()

        self.residual = residual

        self.lstm = nn.LSTM(
            input_size=n_features,
            hidden_size=hidden,
            num_layers=layers,
            batch_first=True,
            dropout=dropout if layers > 1 else 0.0,
        )

        self.head = nn.Linear(hidden, 1)

        # A new residual model initially predicts:
        #
        #     forecast = current PM2.5 + 0
        #
        # Training then learns how much PM2.5 normally rises or falls.
        if residual:
            nn.init.zeros_(self.head.weight)
            nn.init.zeros_(self.head.bias)

    def forward(self, x, current_pm25=None):
        output, _ = self.lstm(x)
        model_output = self.head(output[:, -1])

        if not self.residual:
            return model_output

        if current_pm25 is None:
            raise ValueError("current_pm25 is required for a residual model")

        if current_pm25.ndim == 1:
            current_pm25 = current_pm25.unsqueeze(1)

        return torch.clamp(current_pm25 + model_output, min=0.0)
