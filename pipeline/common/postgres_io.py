"""Shared PostgreSQL helpers for ingestion and feature reads."""

import os
from io import StringIO
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql


load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_connection():
    """Open an SSL connection through Supabase's session pooler."""
    return psycopg2.connect(
        host=os.environ["SUPABASE_DB_HOST"],
        port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
        dbname=os.environ.get("SUPABASE_DB_NAME", "postgres"),
        user=os.environ["SUPABASE_DB_USER"],
        password=os.environ["SUPABASE_DB_PASSWORD"],
        sslmode="require",
        connect_timeout=30,
        application_name="airquality-pipeline",
    )


def load_replace(
    df: pd.DataFrame,
    table: str,
    columns_ddl: str,
    schema: str = "raw",
) -> int:
    """Atomically replace a PostgreSQL table with a DataFrame."""
    if df.empty:
        raise ValueError(f"refusing to replace {schema}.{table} with an empty DataFrame")

    schema = schema.lower()
    table = table.lower()
    temp_table = f"stage_{table}"

    frame = df.copy()
    frame.columns = [column.lower() for column in frame.columns]
    column_identifiers = sql.SQL(", ").join(
        sql.Identifier(column) for column in frame.columns
    )

    buffer = StringIO()
    frame.to_csv(buffer, index=False, header=False, na_rep="")
    buffer.seek(0)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                        sql.Identifier(schema)
                    )
                )
                cur.execute(
                    sql.SQL("CREATE TABLE IF NOT EXISTS {}.{} ({})").format(
                        sql.Identifier(schema),
                        sql.Identifier(table),
                        sql.SQL(columns_ddl),
                    )
                )
                cur.execute(
                    sql.SQL(
                        "CREATE TEMP TABLE {} "
                        "(LIKE {}.{} INCLUDING DEFAULTS) ON COMMIT DROP"
                    ).format(
                        sql.Identifier(temp_table),
                        sql.Identifier(schema),
                        sql.Identifier(table),
                    )
                )
                copy_statement = sql.SQL(
                    "COPY {} ({}) FROM STDIN WITH (FORMAT CSV)"
                ).format(
                    sql.Identifier(temp_table),
                    column_identifiers,
                )
                cur.copy_expert(copy_statement.as_string(conn), buffer)

                # The truncate happens only after the full replacement has
                # loaded successfully, and the surrounding transaction makes
                # the swap rollback-safe.
                cur.execute(
                    sql.SQL("TRUNCATE TABLE {}.{}").format(
                        sql.Identifier(schema),
                        sql.Identifier(table),
                    )
                )
                cur.execute(
                    sql.SQL(
                        "INSERT INTO {}.{} ({}) "
                        "SELECT {} FROM {}"
                    ).format(
                        sql.Identifier(schema),
                        sql.Identifier(table),
                        column_identifiers,
                        column_identifiers,
                        sql.Identifier(temp_table),
                    )
                )
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
                        sql.Identifier(schema),
                        sql.Identifier(table),
                    )
                )
                return cur.fetchone()[0]
    finally:
        conn.close()


def fetch_df(query: str) -> pd.DataFrame:
    """Execute a read query and return the results as a DataFrame."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            columns = [description[0] for description in cur.description]
            return pd.DataFrame(cur.fetchall(), columns=columns)
    finally:
        conn.close()
