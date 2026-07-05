"""Sequence model (Phase 2d). Single-horizon scalar: last hidden state -> Linear(1).
Shared with inference (Phase 3b loads this same class)."""
import torch.nn as nn

class LSTMRegressor(nn.Module):
    def __init__(self, n_features, hidden=64, layers=1, dropout=0.0):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden, num_layers=layers, batch_first=True,
                            dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x):                 # x: (B, seq_len, n_features)
        out, _ = self.lstm(x)             # (B, seq_len, hidden)
        return self.head(out[:, -1])      # last timestep -> (B, 1)