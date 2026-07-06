// Mirror of pipeline/common/stations.py — station ids and sensor ids must match
// the pipeline registry.
export const STATIONS = [
    { id: "prince_george", name: "Prince George", sub: "Plaza 400", sensorId: 4098, lat: 53.91472, lon: -122.74194 },
    { id: "vancouver", name: "Vancouver", sub: "Clark Drive", sensorId: 9146190, lat: 49.26029, lon: -123.077811 },
    { id: "kelowna", name: "Kelowna", sub: "KLO Road", sensorId: 1325038, lat: 49.862119, lon: -119.467461 },
];

// PM2.5 AQI bands (mirror of pipeline/common/aqi.py) with display colors.
export type AqiBand = { max: number; label: string; color: string; fg: string };

export const BANDS: AqiBand[] = [
    { max: 12, label: "Good", color: "#22c55e", fg: "#052e16" },
    { max: 35.4, label: "Moderate", color: "#eab308", fg: "#422006" },
    { max: 55.4, label: "Unhealthy for Sensitive Groups", color: "#f97316", fg: "#ffffff" },
    { max: 150.4, label: "Unhealthy", color: "#ef4444", fg: "#ffffff" },
    { max: 250.4, label: "Very Unhealthy", color: "#a855f7", fg: "#ffffff" },
    { max: Infinity, label: "Hazardous", color: "#7f1d1d", fg: "#ffffff" },
];

export const bandFor = (pm25: number): AqiBand =>
    BANDS.find((b) => pm25 <= b.max) ?? BANDS[BANDS.length - 1];

export const bandByLabel = (label: string | null | undefined): AqiBand | null =>
    BANDS.find((b) => b.label === label) ?? null;

export const BAND_COLORS: Record<string, string> = Object.fromEntries(
    BANDS.map((b) => [b.label, b.color]),
);

export const UNHEALTHY_THRESHOLD = 35.4; // µg/m³ — top of the "Moderate" band
