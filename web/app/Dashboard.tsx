"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ForecastChart, { type ChartPoint } from "./ForecastChart";
import BenchmarkPanel, { type EvalRow, type MaeRow } from "./BenchmarkPanel";
import type { StationSummary } from "./StationMap";
import { BAND_COLORS, STATIONS } from "@/lib/stations";

// Leaflet touches `window`, so the map must never render on the server
const StationMap = dynamic(() => import("./StationMap"), {
    ssr: false,
    loading: () => <p className="text-sm text-slate-500">loading map…</p>,
});

type ForecastRow = {
    stationId: string;
    validTime: string;
    issuedTime: string;
    horizonHours: number;
    predictedPm25: number | null;
    pm25AqiBand: string | null;
    modelVersion: string | null;
};

type EvalPayload = { rows: EvalRow[]; mae: MaeRow[]; windowDays: number };

const PAST_DAYS = 7; // how much history the chart shows

const BAND_LEGEND = [
    { band: "Good", range: "0–12" },
    { band: "Moderate", range: "12–35.4" },
    { band: "Unhealthy for Sensitive Groups", range: "35.4–55.4" },
    { band: "Unhealthy", range: "55.4+" },
];

function Card({ title, subtitle, children }: {
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            {children}
        </section>
    );
}

export default function Dashboard() {
    const [station, setStation] = useState(STATIONS[0].id);
    const [horizon, setHorizon] = useState(24);
    const [stations, setStations] = useState<StationSummary[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
    const [evalData, setEvalData] = useState<EvalPayload>({ rows: [], mae: [], windowDays: 7 });

    useEffect(() => {
        fetch("/api/stations").then((r) => r.json()).then(setStations);
    }, []);

    useEffect(() => {
        fetch(`/api/forecast?station=${station}`).then((r) => r.json()).then(setForecasts);
        fetch(`/api/eval?station=${station}`).then((r) => r.json()).then(setEvalData);
    }, [station]);

    // horizon options come from the data (single-horizon MVP -> just [24] for now)
    const horizons = useMemo(() => {
        const hs = [...new Set(forecasts.map((f) => f.horizonHours))].sort((a, b) => a - b);
        return hs.length ? hs : [24];
    }, [forecasts]);

    // merge: observed actuals (eval table) + model predictions split into past/future at "now"
    const { points, nowTime } = useMemo(() => {
        const nowIso = new Date().toISOString();
        const cutoff = new Date(Date.now() - PAST_DAYS * 24 * 3600 * 1000).toISOString();
        const byTime = new Map<string, ChartPoint>();

        [...evalData.rows].reverse().forEach((r) => {
            if (r.validTime >= cutoff) byTime.set(r.validTime, { time: r.validTime, actual: r.actualPm25 });
        });
        for (const f of forecasts) {
            if (f.horizonHours !== horizon || f.predictedPm25 == null || f.validTime < cutoff) continue;
            const p = byTime.get(f.validTime) ?? { time: f.validTime };
            if (f.validTime <= nowIso) p.past = p.past ?? f.predictedPm25;
            else p.future = p.future ?? f.predictedPm25;
            byTime.set(f.validTime, p);
        }

        const pts = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
        // join the past and future prediction lines at the boundary so they read as one curve
        const lastPast = [...pts].reverse().find((p) => p.past !== undefined);
        const firstFuture = pts.find((p) => p.future !== undefined);
        if (lastPast && firstFuture) lastPast.future = lastPast.past;
        return { points: pts, nowTime: firstFuture?.time };
    }, [forecasts, evalData, horizon]);

    const hero = stations.find((s) => s.id === station)?.latest ?? null;
    const heroBand = hero?.pm25AqiBand ?? "";
    const lstmMae = evalData.mae.find((m) => m.model !== "skeleton");

    return (
        <div className="flex flex-col gap-4">
            {/* controls */}
            <div className="flex flex-wrap items-center gap-2">
                <select value={station} onChange={(e) => setStation(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm">
                    {STATIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                {horizons.map((h) => (
                    <button key={h} onClick={() => setHorizon(h)}
                            className={`rounded-lg border px-3 py-1.5 text-sm shadow-sm ${
                                h === horizon
                                    ? "border-blue-600 bg-blue-600 font-medium text-white"
                                    : "border-slate-300 bg-white text-slate-600"
                            }`}>
                        t+{h}h
                    </button>
                ))}
            </div>

            {/* hero stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                    <p className="text-xs text-slate-500">Forecast — 24h ahead</p>
                    <p className="mt-1 text-3xl font-bold">
                        {hero?.predictedPm25 != null ? hero.predictedPm25.toFixed(1) : "—"}
                        <span className="ml-1 text-sm font-normal text-slate-500">µg/m³</span>
                    </p>
                    {hero && (
                        <span className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                  backgroundColor: BAND_COLORS[heroBand] ?? "#9ca3af",
                                  color: heroBand === "Good" || heroBand === "Moderate" ? "#1e293b" : "#fff",
                              }}>
                            {heroBand}
                        </span>
                    )}
                </Card>
                <Card>
                    <p className="text-xs text-slate-500">Model accuracy — last {evalData.windowDays} days</p>
                    <p className="mt-1 text-3xl font-bold">
                        {lstmMae ? lstmMae.mae.toFixed(2) : "—"}
                        <span className="ml-1 text-sm font-normal text-slate-500">µg/m³ MAE</span>
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                        {lstmMae ? `across ${lstmMae.n} realized forecasts` : "no realized forecasts yet"}
                    </p>
                </Card>
                <Card>
                    <p className="text-xs text-slate-500">Forecast for</p>
                    <p className="mt-1 text-lg font-semibold leading-8">
                        {hero ? new Date(hero.validTime).toLocaleString([], {
                            weekday: "short", month: "short", day: "numeric", hour: "numeric",
                        }) : "—"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                        model {forecasts[0]?.modelVersion ?? "…"} · refreshed by the batch pipeline
                    </p>
                </Card>
            </div>

            {/* chart */}
            <Card title="PM2.5 — observed vs model"
                  subtitle="Each prediction was made 24 hours in advance from the previous 48h of sensor + weather data. Amber = the next 24 hours.">
                <ForecastChart points={points} nowTime={nowTime} />
                <div className="mt-2 flex flex-wrap gap-2">
                    {BAND_LEGEND.map(({ band, range }) => (
                        <span key={band} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAND_COLORS[band] }} />
                            {band} ({range})
                        </span>
                    ))}
                </div>
            </Card>

            {/* map + accuracy */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Stations" subtitle="Colored by latest predicted AQI band — click a station to select it.">
                    <StationMap stations={stations} selected={station} onSelect={setStation} />
                </Card>
                <Card title="Forecast accuracy (realized)"
                      subtitle="Past forecasts joined against what the sensors actually measured.">
                    <BenchmarkPanel rows={evalData.rows} mae={evalData.mae} windowDays={evalData.windowDays} />
                </Card>
            </div>
        </div>
    );
}
