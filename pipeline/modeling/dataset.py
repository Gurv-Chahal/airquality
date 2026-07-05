"""Torch Dataset for the sequence model (2d). Split/scaler helpers live in splits.py
so non-torch code (the xgboost baseline) can import them without loading torch."""
import torch
from torch.utils.data import Dataset


class SequenceDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.from_numpy(X).float()
        self.y = torch.from_numpy(y).float().unsqueeze(1)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, i):
        return self.X[i], self.y[i]
