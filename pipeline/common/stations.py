"""
The list of which monitoring stations we pull data for.

This is the one place that defines our stations, so every other script reads
from here instead of hardcoding its own copy. Each station stores two kinds of
ids because our data comes from two sources:
  - sensor_id : identifies the PM2.5 sensor over at OpenAQ (the air-quality data)
  - lat / lon : the station's location, used to pull matching weather from Open-Meteo
"""
from dataclasses import dataclass


#"frozen=True" means once a Station is created its
# values can't be changed, which keeps this registry from being edited by accident.
@dataclass(frozen=True)
class Station:
    station_id: str   # our own simple name for the station, used as its key everywhere else
    sensor_id: int    # the PM2.5 sensor id used to request air-quality data from OpenAQ
    lat: float
    lon: float


# The three stations we forecast for. The trailing comment on each line is the
# real-world name of that station's location.
STATIONS: list[Station] = [
    Station("prince_george", sensor_id=4098,    lat=53.91472, lon=-122.74194),  # PRG Plaza 400
    Station("vancouver",     sensor_id=9146190, lat=49.26029, lon=-123.077811), # Vancouver-Clark Drive
    Station("kelowna",       sensor_id=1325038, lat=49.862119, lon=-119.467461), # Kelowna KLO Road
]