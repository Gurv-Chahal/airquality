


"""Turns a PM2.5 air pollution number into a plain-English health rating.
PM2.5 is fine particle pollution measured in µg/m³ — higher means dirtier,
more dangerous air.
"""

def pm25_to_aqi_band(pm25: float) -> str:
    # Each pair is a cutoff value and its health label, ordered from cleanest
    # to dirtiest air.
    for hi, label in [(12.0, "Good"), (35.4, "Moderate"),
                      (55.4, "Unhealthy for Sensitive Groups"), (150.4, "Unhealthy"),
                      (250.4, "Very Unhealthy"), (float("inf"), "Hazardous")]:
        # Return the label for the first cutoff the number falls under. The
        # last cutoff is infinity, so we always return something.
        if pm25 <= hi:
            return label