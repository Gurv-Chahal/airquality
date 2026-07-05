import sys; from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # -> modeling/
import numpy as np, pandas as pd
from windowing import build_supervised, latest_window

def _series(n, gap_at=None):
    t = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    if gap_at is not None:
        keep = np.r_[0:gap_at, gap_at+6:n]; t = t[keep]          # remove a 6h gap
    df = pd.DataFrame({"station_id": "s", "valid_time": t})
    df["pm25"] = np.arange(len(t), dtype=float); df["f1"] = np.arange(len(t), dtype=float)  # value == hour offset
    return df

def test_offbyone():
    X, y, meta = build_supervised(_series(100), ["pm25","f1"], seq_len=4, horizon=24)
    assert X.shape[1:] == (4, 2)
    np.testing.assert_array_equal(X[0,:,0], [0,1,2,3])           # window = rows i-3..i
    assert y[0] == 27                                            # target = row i + 24  (exact)
    assert (meta["valid_time"][0] - meta["anchor_time"][0]) == pd.Timedelta(hours=24)

def test_no_gap_straddle():
    X, *_ = build_supervised(_series(100, gap_at=50), ["pm25","f1"], 4, 24)
    full, *_ = build_supervised(_series(100), ["pm25","f1"], 4, 24)
    assert len(X) < len(full) and not np.isnan(X).any()          # windows near the gap rejected

def test_latest_window():
    w, _ = latest_window(_series(60), ["pm25","f1"], seq_len=4)
    np.testing.assert_array_equal(w[:,0], [56,57,58,59])         # exactly the last 4 rows

if __name__ == "__main__":
    test_offbyone(); test_no_gap_straddle(); test_latest_window()
    print("all windowing tests passed ✅")