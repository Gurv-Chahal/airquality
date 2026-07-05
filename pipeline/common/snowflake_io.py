"""
Shared helpers for talking to Snowflake data warehouse.

Every ingest script uses load_replace() to save data. fetch_df() is the read side —
it runs a query and hands back the results as a pandas DataFrame.
"""


import os
from pathlib import Path

import pandas as pd
import snowflake.connector
from dotenv import load_dotenv
from snowflake.connector.pandas_tools import write_pandas

# load the .env file by its full path so the Snowflake credentials are found
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# The database and schema where all raw data lands.
DATABASE = "AIRQUALITY"
SCHEMA = "RAW"


# open a snowflake connection
def get_connection() -> snowflake.connector.SnowflakeConnection:
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        role=os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
    )


# clear raw table and reload with fresh data
def load_replace(df: pd.DataFrame, table: str, columns_ddl: str) -> int:
    """
    df          : the rows to load
    table       : target table name
    columns_ddl : the column definitions, e.g. "STATION_ID STRING, VALID_TIME STRING, PM25 FLOAT"
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        # Make sure the warehouse, database, schema, and table all exist before
        # we use them, creating any that don't.
        cur.execute(f"USE WAREHOUSE {os.environ.get('SNOWFLAKE_WAREHOUSE', 'COMPUTE_WH')}")
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {DATABASE}")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {DATABASE}.{SCHEMA}")
        cur.execute(f"USE SCHEMA {DATABASE}.{SCHEMA}")
        cur.execute(f"CREATE TABLE IF NOT EXISTS {DATABASE}.{SCHEMA}.{table} ({columns_ddl})")

        # Empty the table, then write in this run's rows. Clearing first is what
        # keeps re-runs from piling up duplicates.
        cur.execute(f"TRUNCATE TABLE {DATABASE}.{SCHEMA}.{table}")
        write_pandas(conn, df, table, auto_create_table=False, overwrite=False,
                     database=DATABASE, schema=SCHEMA)

        # Count the rows now in the table and return that number.
        cur.execute(f"SELECT COUNT(*) FROM {DATABASE}.{SCHEMA}.{table}")
        return cur.fetchone()[0]
    finally:
        # Always close the connection, even if something above fails.
        conn.close()

def fetch_df(sql: str) -> pd.DataFrame:
    """Run a read query and return the results as a DataFrame."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql)
        return cur.fetch_pandas_all()   # needs pyarrow (already installed)
    finally:
        conn.close()