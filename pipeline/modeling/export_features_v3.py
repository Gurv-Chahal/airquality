"""Export the current Supabase feature table for v3 training."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd

from common.postgres_io import fetch_df


OUTPUT = ROOT / "modeling" / "feat_airquality_v3.parquet"


def main():
    df = fetch_df(
        """
        SELECT *
        FROM analytics.feat_airquality
        ORDER BY station_id, valid_time
        """
    )

    df["valid_time"] = pd.to_datetime(df["valid_time"], utc=True)
    df.to_parquet(OUTPUT, index=False)

    print(f"saved {len(df):,} rows to {OUTPUT}")
    print(f"range: {df.valid_time.min()} -> {df.valid_time.max()}")
    print(df.groupby("station_id").size())


if __name__ == "__main__":
    main()