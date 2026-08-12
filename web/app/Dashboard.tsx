"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TopBar from "./components/TopBar";
import ForecastChart, { type ChartPoint } from "./ForecastChart";
import BenchmarkPanel, { type EvalRow, type MaeRow, type NaiveMae } from "./BenchmarkPanel";
import type { StationSummary } from "./StationMap";
import { bandByLabel, bandFor, STATIONS, type AqiBand } from "@/lib/stations";

// Leaflet touches `window`, so the map must never render on the server
const StationMap = dynamic(() => import("./StationMap"), {
    ssr: false,
    loading: () => (
        <div className="flex h-[296px] items-center justify-center rounded-[9px] border border-[#e3e8ee] bg-[#eef2f5] text-sm text-[#98a6b8]">
            loading map…
        </div>
    ),
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

type EvalPayload = { rows: EvalRow[]; mae: MaeRow[]; naive: NaiveMae | null; windowDays: number };

const HORIZON = 24; // the pipeline's single forecast horizon, hours
const HOUR_MS = 3600 * 1000;

const BAND_LEGEND = [
    { label: "Good", range: "0–12" },
    { label: "Moderate", range: "12–35.4" },
    { label: "Sensitive groups", range: "35.4–55.4" },
    { label: "Unhealthy", range: "55.4+" },
];

const fmtHm = (t: string | number) =>
    new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtFull = (t: string | number) =>
    new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric" });

function Eyebrow({ children }: { children: React.ReactNode }) {
    return (
        <div className="font-mono text-[10px] font-semibold tracking-[.14em] text-[#5b6b7f]">
            {children}
        </div>
    );
}

function BandChip({ band, large }: { band: AqiBand | null; large?: boolean }) {
    if (!band) return null;
    return (
        <span className={`inline-block whitespace-nowrap rounded-full font-semibold tracking-[.02em] ${
                  large ? "px-3 py-1 text-xs" : "px-[9px] py-0.5 text-[10.5px]"
              }`}
              style={{ background: band.color, color: band.fg }}>
            {band.label}
        </span>
    );
}

export default function Dashboard() {
    const [station, setStation] = useState(STATIONS[0].id);
    const [days, setDays] = useState<7 | 14>(7);
    const [showNaive, setShowNaive] = useState(false);
    const [stations, setStations] = useState<StationSummary[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
    const [evalData, setEvalData] = useState<EvalPayload>({ rows: [], mae: [], naive: null, windowDays: 7 });
    const [nowMs, setNowMs] = useState(0); // captured at fetch time — render must stay pure

    useEffect(() => {
        fetch("/api/stations")
            .then((r) => r.json())
            .then((d) => Array.isArray(d) && setStations(d))
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch(`/api/forecast?station=${station}`)
            .then((r) => r.json())
            .then((d) => {
                if (!Array.isArray(d)) return;
                setForecasts(d);
                setNowMs(Date.now());
            })
            .catch(() => {});
        fetch(`/api/eval?station=${station}`)
            .then((r) => r.json())
            .then((d) => {
                if (!Array.isArray(d?.rows)) return;
                setEvalData(d);
                setNowMs(Date.now());
            })
            .catch(() => {});
    }, [station]);

    // merge: observed actuals (eval rows) + model predictions split into past/future
    // at "now", plus the naive same-hour-yesterday series derived from actuals
    const { points, nowT } = useMemo(() => {
        if (!nowMs) return { points: [] as ChartPoint[], nowT: undefined };
        const cutoff = nowMs - days * 24 * HOUR_MS;
        const byTime = new Map<number, ChartPoint>();
        const at = (t: number) => {
            let p = byTime.get(t);
            if (!p) byTime.set(t, (p = { t }));
            return p;
        };

        const actualAt = new Map<number, number>();
        for (const r of evalData.rows) actualAt.set(Date.parse(r.validTime), r.actualPm25);
        for (const [t, v] of actualAt) if (t >= cutoff) at(t).actual = v;

        // forecasts arrive newest-issued-first; keep the newest per hour
        for (const f of forecasts) {
            if (f.horizonHours !== HORIZON || f.predictedPm25 == null) continue;
            const t = Date.parse(f.validTime);
            if (t < cutoff) continue;
            const p = at(t);
            if (t <= nowMs) p.past = p.past ?? f.predictedPm25;
            else p.future = p.future ?? f.predictedPm25;
        }

        // naive baseline: this hour's forecast = yesterday's realized reading
        for (const p of byTime.values()) {
            const prev = actualAt.get(p.t - 24 * HOUR_MS);
            if (prev != null) p.naive = prev;
        }

        const pts = [...byTime.values()].sort((a, b) => a.t - b.t);
        // join the past and future prediction lines at the boundary so they read as one
        // curve — but only when they are actually contiguous, not across issuance gaps
        const lastPast = [...pts].reverse().find((p) => p.past !== undefined);
        const firstFuture = pts.find((p) => p.future !== undefined);
        if (lastPast && firstFuture && firstFuture.t - lastPast.t <= 2 * HOUR_MS) {
            lastPast.future = lastPast.past;
        }
        return { points: pts, nowT: nowMs };
    }, [forecasts, evalData, days, nowMs]);

    const sel = stations.find((s) => s.id === station);
    const hero = sel?.latest ?? null;
    const heroBand = hero?.predictedPm25 != null
        ? bandByLabel(hero.pm25AqiBand) ?? bandFor(hero.predictedPm25)
        : null;

    const latestReading = evalData.rows[0] ?? null; // rows are newest-first
    const readingBand = latestReading ? bandFor(latestReading.actualPm25) : null;

    const lstmMae = evalData.mae.find((m) => m.model !== "skeleton") ?? null;
    const naive = evalData.naive;

    const modelVersion = forecasts[0]?.modelVersion ?? hero?.modelVersion ?? null;
    // "updated HH:MM" = newest forecast issue time across all stations
    const updatedAt = stations.reduce<string | null>((acc, s) => {
        const t = s.latest?.issuedTime;
        return t && (!acc || t > acc) ? t : acc;
    }, null);

    const evalTableRows = evalData.rows.filter((r) => r.modelVersion != null);

    return (
        <div className="min-h-screen bg-[#f4f6f8] text-[#101828]">
            <TopBar active="forecast"
                    pill={<>batch pipeline · updated {updatedAt ? fmtHm(updatedAt) : "—"}</>} />

            <div className="mx-auto max-w-[1280px] px-6 pb-[34px]">

                {/* controls row */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-0.5 pt-4">
                    <div className="inline-flex gap-0.5 rounded-[10px] bg-[#e7ebf0] p-[3px]">
                        {STATIONS.map((s) => (
                            <button key={s.id} type="button" onClick={() => setStation(s.id)}
                                    className={`rounded-lg px-[15px] py-[7px] text-[12.5px] font-semibold transition-all ${
                                        s.id === station
                                            ? "bg-white text-[#101828] shadow-[0_1px_3px_rgba(16,24,40,.14)]"
                                            : "text-[#5b6b7f]"
                                    }`}>
                                {s.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="rounded-[7px] bg-[#101828] px-[11px] py-1.5 font-mono text-[11.5px] font-semibold text-white">
                            t+24h
                        </span>
                        {([7, 14] as const).map((d) => (
                            <button key={d} type="button" onClick={() => setDays(d)}
                                    className={`rounded-[7px] border px-[11px] py-1.5 font-mono text-[11.5px] font-medium ${
                                        days === d
                                            ? "border-[#101828] bg-white text-[#101828]"
                                            : "border-[#dbe2ea] text-[#5b6b7f]"
                                    }`}>
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* hero stat grid */}
                <div className="grid gap-3.5 pt-3.5 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1.1fr]">
                    <div className="rounded-xl border border-[#e3e8ee] bg-white px-[18px] py-4">
                        <Eyebrow>FORECAST — 24 H AHEAD</Eyebrow>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-[46px] font-semibold leading-none tracking-[-.02em]">
                                {hero?.predictedPm25 != null ? hero.predictedPm25.toFixed(1) : "—"}
                            </span>
                            <span className="text-[13px] font-medium text-[#5b6b7f]">µg/m³</span>
                            <BandChip band={heroBand} large />
                        </div>
                        <div className="mt-[9px] text-[11.5px] text-[#5b6b7f]">
                            {hero ? <>for {fmtFull(hero.validTime)} · issued {fmtHm(hero.issuedTime)}</> : "no forecast yet"}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[#e3e8ee] bg-white px-[18px] py-4">
                        <Eyebrow>LATEST READING</Eyebrow>
                        <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-[28px] font-semibold leading-none">
                                {latestReading ? latestReading.actualPm25.toFixed(1) : "—"}
                            </span>
                            <BandChip band={readingBand} />
                        </div>
                        <div className="mt-[11px] text-[11px] text-[#5b6b7f]">
                            {latestReading
                                ? <>{fmtFull(latestReading.validTime)} · sensor {STATIONS.find((s) => s.id === station)?.sensorId}</>
                                : "no scored reading yet"}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[#e3e8ee] bg-white px-[18px] py-4">
                        <Eyebrow>LIVE ERROR — {evalData.windowDays} DAYS</Eyebrow>
                        <div className="mt-2.5 flex flex-wrap items-baseline gap-[7px]">
                            <span className="font-mono text-[28px] font-semibold leading-none">
                                {lstmMae ? lstmMae.mae.toFixed(2) : "—"}
                            </span>
                            <span className="text-xs font-medium text-[#5b6b7f]">µg/m³ MAE</span>
                        </div>
                        <div className="mt-[9px] text-[11px] text-[#98a6b8]">
                            {lstmMae ? `across ${lstmMae.n} realized forecasts` : "no realized forecasts yet"}
                        </div>
                    </div>

                    <div className="rounded-xl bg-[#101828] px-[18px] py-4 text-[#e8edf4]">
                        <div className="font-mono text-[10px] font-semibold tracking-[.14em] text-[#8b98ab]">MODEL</div>
                        <div className="mt-2 text-[17px] font-semibold">
                            LSTM · <span className="font-mono">{modelVersion ?? "—"}</span>
                        </div>
                        <div className="mt-1.5 text-[11px] leading-[1.6] text-[#aab6c6]">
                            48 h × 16 features → 64 hidden units.
                        </div>
                    </div>
                </div>

                {/* chart card */}
                <div className="mt-3.5 rounded-xl border border-[#e3e8ee] bg-white px-5 pb-3.5 pt-[18px]">
                    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-[13px] font-semibold">Observed vs predicted — PM2.5</div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#5b6b7f]">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-3.5 border-t-2 border-[#334155]" />observed
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-3.5 border-t-2 border-dashed border-[#2360c9]" />model, in hindsight
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-3.5 border-t-2 border-dashed border-[#d97706]" />next 24 h
                            </span>
                            <button type="button" onClick={() => setShowNaive((v) => !v)}
                                    className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium transition-colors ${
                                        showNaive
                                            ? "border-[#98a6b8] bg-[#eef2f6] text-[#334155]"
                                            : "border-[#dbe2ea] text-[#98a6b8]"
                                    }`}>
                                -- naive t−24h
                            </button>
                        </div>
                    </div>
                    <ForecastChart points={points} nowT={nowT} showNaive={showNaive} />
                    <div className="mt-2 flex flex-wrap gap-3.5 border-t border-[#eef2f6] pt-2.5 text-[10.5px] font-medium text-[#5b6b7f]">
                        {BAND_LEGEND.map(({ label, range }) => (
                            <span key={label} className="inline-flex items-center gap-[5px]">
                                <span className="h-[9px] w-[9px] rounded-full"
                                      style={{ background: bandByLabel(label === "Sensitive groups" ? "Unhealthy for Sensitive Groups" : label)?.color }} />
                                {label} {range}
                            </span>
                        ))}
                        <span className="ml-auto font-mono text-[10px]">
                            each point was predicted 24 h in advance from the prior 48 h
                        </span>
                    </div>
                </div>

                {/* map + realized accuracy */}
                <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[5fr_7fr]">
                    <div className="rounded-xl border border-[#e3e8ee] bg-white px-5 py-[18px]">
                        <div className="text-[13px] font-semibold">Monitoring stations</div>
                        <div className="mb-3 mt-[3px] text-[11px] text-[#5b6b7f]">
                            Colored by tomorrow&apos;s predicted band — click to select.
                        </div>
                        <StationMap stations={stations} selected={station} onSelect={setStation} />
                        <div className="mt-[7px] text-[9.5px] text-[#98a6b8]">
                            © OpenStreetMap · CARTO — government-grade sensors via OpenAQ: Prince George, Vancouver, Kelowna
                        </div>
                    </div>
                    <div className="rounded-xl border border-[#e3e8ee] bg-white px-5 py-[18px]">
                        <div className="text-[13px] font-semibold">Forecast accuracy — realized</div>
                        <div className="mb-3 mt-[3px] text-[11px] text-[#5b6b7f]">
                            Past forecasts joined against what the sensors actually measured, over the last {evalData.windowDays} days.
                        </div>
                        <BenchmarkPanel rows={evalTableRows} lstm={lstmMae} naive={naive} />
                    </div>
                </div>

                <div className="mt-[22px] text-center text-[10.5px] text-[#98a6b8]">
                    Data: OpenAQ (PM2.5) · Open-Meteo (weather) — forecasts precomputed hourly by the batch
                    pipeline and scored against real sensor readings as they arrive.
                </div>
            </div>
        </div>
    );
}
