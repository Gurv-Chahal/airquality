"""Torch datasets and sampling for PM2.5 sequence models."""

import numpy as np
import torch
from torch.utils.data import Dataset, WeightedRandomSampler


class SequenceDataset(Dataset):
    def __init__(self, X, y, current_pm25=None):
        self.X = torch.from_numpy(X).float()
        self.y = torch.from_numpy(y).float().unsqueeze(1)

        self.current_pm25 = (
            None
            if current_pm25 is None
            else torch.from_numpy(current_pm25).float().unsqueeze(1)
        )

    def __len__(self):
        return len(self.X)

    def __getitem__(self, index):
        if self.current_pm25 is None:
            return self.X[index], self.y[index]

        return (
            self.X[index],
            self.y[index],
            self.current_pm25[index],
        )


def smoke_sampler(y, current_pm25, seed=0):
    """Make rare smoke events appear more often during training."""

    y = np.asarray(y).ravel()
    current_pm25 = np.asarray(current_pm25).ravel()

    weights = np.ones(len(y), dtype=np.float64)

    weights[y > 12.0] = 1.5
    weights[y > 35.4] = 4.0
    weights[y > 55.4] = 6.0

    # Extra attention for smoke onsets.
    weights[(y - current_pm25) > 20.0] *= 1.5

    return WeightedRandomSampler(
        torch.as_tensor(weights, dtype=torch.double),
        num_samples=len(weights),
        replacement=True,
        generator=torch.Generator().manual_seed(seed),
    )
