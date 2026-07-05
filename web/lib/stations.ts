// Mirror of pipeline/common/stations.py — station ids must match the pipeline registry.
export const STATIONS = [
    { id: "prince_george", name: "Prince George (Plaza 400)", lat: 53.91472, lon: -122.74194 },
    { id: "vancouver", name: "Vancouver (Clark Drive)", lat: 49.26029, lon: -123.077811 },
    { id: "kelowna", name: "Kelowna (KLO Road)", lat: 49.862119, lon: -119.467461 },
];

// PM2.5 AQI bands (mirror of pipeline/common/aqi.py) -> display colors
export const BAND_COLORS: Record<string, string> = {
    "Good": "#22c55e",
    "Moderate": "#eab308",
    "Unhealthy for Sensitive Groups": "#f97316",
    "Unhealthy": "#ef4444",
    "Very Unhealthy": "#a855f7",
    "Hazardous": "#7f1d1d",
};

export const UNHEALTHY_THRESHOLD = 35.4; // µg/m³ — top of the "Moderate" band
