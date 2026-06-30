"""
Shared Snowflake helpers for ingestion.

load_replace() is the idempotent loader every ingest script uses: it ensures the
typed table exists, TRUNCATEs it, then loads the DataFrame. Re-running can't create
duplicates because the table is cleared first (full-window reload).
"""
import os
from pathlib import Path

import pandas as pd
import snowflake.connector
from dotenv import load_dotenv
from snowflake.connector.pandas_tools import write_pandas

# Load pipeline/.env by absolute path so the SNOWFLAKE_* vars are available no matter
# the current working directory or how the script is invoked.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE = "AIRQUALITY"
SCHEMA = "RAW"


def get_connection() -> snowflake.connector.SnowflakeConnection:
    """Open a Snowflake connection from the SNOWFLAKE_* env vars."""
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        role=os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
    )


def load_replace(df: pd.DataFrame, table: str, columns_ddl: str) -> int:
    """
    Idempotent load into AIRQUALITY.RAW.<table>.

    df          : the rows to load (column names must match columns_ddl, UPPERCASE)
    table       : target table name, e.g. "PM25_OBSERVATIONS"
    columns_ddl : the column definitions, e.g. "STATION_ID STRING, VALID_TIME STRING, PM25 FLOAT"

    Returns the row count in the table after loading.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        # make sure the warehouse + storage objects exist and are the session context
        cur.execute(f"USE WAREHOUSE {os.environ.get('SNOWFLAKE_WAREHOUSE', 'COMPUTE_WH')}")
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {DATABASE}")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {DATABASE}.{SCHEMA}")
        cur.execute(f"USE SCHEMA {DATABASE}.{SCHEMA}")
        cur.execute(f"CREATE TABLE IF NOT EXISTS {DATABASE}.{SCHEMA}.{table} ({columns_ddl})")

        # idempotent: clear, then append this run's rows into the typed table
        cur.execute(f"TRUNCATE TABLE {DATABASE}.{SCHEMA}.{table}")
        write_pandas(conn, df, table, auto_create_table=False, overwrite=False,
                     database=DATABASE, schema=SCHEMA)

        cur.execute(f"SELECT COUNT(*) FROM {DATABASE}.{SCHEMA}.{table}")
        return cur.fetchone()[0]
    finally:
        conn.close()