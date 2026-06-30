"""
Station registry — the single source of truth for which stations we ingest.

Each station carries both ids it needs downstream:
  - sensor_id : OpenAQ PM2.5 sensor (for the air-quality pull)
  - lat / lon : coordinates (for the Open-Meteo weather pull)
Verified live + reference-grade in Phase 1a (see DATA_VERIFICATION.md).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Station:
    station_id: str   # our human-friendly label, used as the key everywhere downstream
    sensor_id: int    # OpenAQ PM2.5 sensor id
    lat: float
    lon: float


STATIONS: list[Station] = [
    Station("prince_george", sensor_id=4098,    lat=53.91472, lon=-122.74194),  # PRG Plaza 400
    Station("vancouver",     sensor_id=9146190, lat=49.26029, lon=-123.077811), # Vancouver-Clark Drive
    Station("kelowna",       sensor_id=1325038, lat=49.862119, lon=-119.467461), # Kelowna KLO Road
]