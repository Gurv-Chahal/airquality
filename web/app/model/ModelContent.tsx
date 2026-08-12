"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "../components/TopBar";
import { STATIONS } from "@/lib/stations";
import {
    FACTS, LSTM_OFFLINE, OFFLINE_METRICS,
    highMaePctVsXgb, rmsePctVsPersistence,
} from "@/lib/model-facts";

type Metric = "rmse" | "highMae";
type LiveStat = {
    id: string;
    lstm: { mae: number; n: number } | null;
    naive: { mae: number; n: number } | null;
};

const TECH = ["PyTorch", "Snowflake", "dbt", "Weights & Biases", "OpenAQ", "Open-Meteo"];

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return (
        <div className={`rounded-xl border border-[#e3e8ee] bg-white ${className}`}>{children}</div>
    );
}

export default function ModelContent() {
    const [metric, setMetric] = useState<Metric>("rmse");
    const [live, setLive] = useState<LiveStat[]>([]);

    // real rolling 7-day accuracy per station, from the same eval API the dashboard uses
    useEffect(() => {
        Promise.all(
            STATIONS.map(async (s): Promise<LiveStat> => {
                try {
                    const d = await fetch(`/api/eval?station=${s.id}`).then((r) => r.json());
                    const rows: { model: string; mae: number; n: number }[] = Array.isArray(d?.mae) ? d.mae : [];
                    const lstm = rows.filter((m) => m.model !== "skeleton").sort((a, b) => b.n - a.n)[0] ?? null;
                    return { id: s.id, lstm, naive: d?.naive ?? null };
                } catch {
                    return { id: s.id, lstm: null, naive: null };
                }
            }),
        ).then(setLive);
    }, []);

    const maxMetric = Math.max(...OFFLINE_METRICS.map((m) => m[metric]));

    return (
        <div className="min-h-screen bg-[#f4f6f8] text-[#101828]">
            <TopBar active="model" pill="eval loop · live scoring" />

            <div className="mx-auto max-w-[1280px] px-6 pb-10">

                {/* hero */}
                <div className="grid items-center gap-7 pb-2.5 pt-[38px] lg:grid-cols-[1.1fr_1fr]">
                    <div>
                        <div className="font-mono text-[11px] font-semibold tracking-[.18em] text-[#2360c9]">
                            MODEL &amp; METHODS
                        </div>
                        <h1 className="mt-3 text-[38px] font-bold leading-[1.15] tracking-[-.02em]">
                            How the smoke-aware forecast works.
                        </h1>
                        <p className="mt-4 max-w-[560px] text-sm leading-[1.7] text-[#3c4657]">
                            A residual PyTorch LSTM reads the last 48 hours of sensor and weather data and predicts
                            PM2.5 one full day ahead for three BC monitoring stations.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-[#101828] px-[18px] py-4 text-white">
                            <div className="font-mono text-[26px] font-semibold">
                                {FACTS.horizonHours} h <span className="text-xs font-medium text-[#8b98ab]">ahead</span>
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#aab6c6]">
                                batch-scored forecasts across {FACTS.stations} BC monitoring stations
                            </div>
                        </div>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold text-[#166534]">
                                {FACTS.windows.toLocaleString()}
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                gap-safe 48-hour sensor and weather sequences
                            </div>
                        </Card>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold text-[#166534]">
                                −{highMaePctVsXgb.toFixed(1)}%
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                high-PM2.5 MAE versus XGBoost on the held-out smoke test
                            </div>
                        </Card>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold">
                                {(LSTM_OFFLINE.recall * 100).toFixed(1)}%
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                high events detected ({FACTS.v3DetectedEvents}/{FACTS.highEvents}), versus{" "}
                                {(OFFLINE_METRICS.find((m) => m.model === "XGBoost")!.recall * 100).toFixed(1)}% for XGBoost
                            </div>
                        </Card>
                    </div>
                </div>

                {/* benchmarks + live */}
                <div className="mt-6 grid gap-3.5 lg:grid-cols-[7fr_5fr]">
                    <Card className="px-[22px] py-5">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div>
                                <div className="text-sm font-semibold">Four models, same smoke test</div>
                                <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                                    {FACTS.testWindows} August forecasts, including {FACTS.highEvents} high and{" "}
                                    {FACTS.severeEvents} severe readings. Lower is better.
                                </div>
                            </div>
                            <div className="inline-flex gap-0.5 rounded-[9px] bg-[#e7ebf0] p-[3px]">
                                {(["rmse", "highMae"] as const).map((m) => (
                                    <button key={m} type="button" onClick={() => setMetric(m)}
                                            className={`rounded-[7px] px-3.5 py-1.5 font-mono text-[11.5px] font-semibold transition-all ${
                                                metric === m
                                                    ? "bg-white text-[#101828] shadow-[0_1px_3px_rgba(16,24,40,.14)]"
                                                    : "text-[#5b6b7f]"
                                            }`}>
                                        {m === "highMae" ? "HIGH MAE" : "RMSE"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-5 flex flex-col gap-3.5">
                            {OFFLINE_METRICS.map((m) => (
                                <div key={m.model}
                                     className="grid items-center gap-3.5 md:grid-cols-[168px_1fr_130px]">
                                    <div>
                                        <div className={`text-xs font-semibold ${m.ours ? "text-[#1e4c9a]" : ""}`}>
                                            {m.model}
                                        </div>
                                        <div className="mt-px text-[10px] text-[#98a6b8]">{m.note}</div>
                                    </div>
                                    <div className="relative h-3 rounded-md bg-[#eef2f6]">
                                        <div className={`absolute left-0 top-0 h-3 rounded-md transition-[width] duration-[350ms] ease-out ${
                                                 m.ours ? "bg-gradient-to-r from-[#1e4c9a] to-[#2360c9]" : "bg-[#b9c4d0]"
                                             }`}
                                             style={{ width: `${(m[metric] / maxMetric) * 100}%` }} />
                                    </div>
                                    <div className="text-right font-mono text-[13px] font-semibold">
                                        {m[metric].toFixed(3)} {metric === "highMae" ? "HIGH MAE" : "RMSE"}{" "}
                                        <span className="text-[10px] font-normal text-[#98a6b8]">
                                            {metric === "rmse"
                                                ? `${m.mae.toFixed(3)} overall MAE`
                                                : `${(m.recall * 100).toFixed(1)}% recall`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-[18px] flex flex-wrap gap-2">
                            <span className="rounded-full bg-[#166534] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-white">
                                −{highMaePctVsXgb.toFixed(1)}% high-event MAE vs XGBoost
                            </span>
                            <span className="rounded-full border border-[#cfe7d6] bg-[#e9f5ec] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-[#166534]">
                                −{rmsePctVsPersistence.toFixed(1)}% RMSE vs 24 h persistence
                            </span>
                            <span className="rounded-full border border-[#d4e0f5] bg-[#eaf0fb] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-[#1e4c9a]">
                                {FACTS.v3DetectedEvents}/{FACTS.highEvents} high events detected
                            </span>
                        </div>
                        <p className="mt-4 text-xs leading-[1.7] text-[#3c4657]">
                            XGBoost has the lowest overall error, but it detected only {FACTS.xgbDetectedEvents} of{" "}
                            {FACTS.highEvents} high-PM2.5 events. V3 detected {FACTS.v3DetectedEvents} and reduced
                            high-event MAE from 42.14 to 30.14 µg/m³. The smoke-specific improvement is reported
                            separately so it is not confused with overall accuracy.
                        </p>
                    </Card>

                    <Card className="px-[22px] py-5">
                        <div className="text-sm font-semibold">Live, in production</div>
                        <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                            Rolling 7-day MAE from the eval loop — no split, no lab conditions.
                        </div>
                        <div className="mt-4 flex flex-col gap-[9px]">
                            {STATIONS.map((s) => {
                                const stat = live.find((l) => l.id === s.id);
                                return (
                                    <div key={s.id}
                                         className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e3e8ee] px-[15px] py-3">
                                        <div>
                                            <div className="text-[12.5px] font-semibold">{s.name}</div>
                                            <div className="mt-0.5 font-mono text-[10px] uppercase text-[#98a6b8]">
                                                {s.sub} · sensor {s.sensorId}
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-[18px]">
                                            <div className="text-right">
                                                <div className="font-mono text-[19px] font-semibold text-[#1e4c9a]">
                                                    {stat?.lstm ? stat.lstm.mae.toFixed(2) : "—"}
                                                </div>
                                                <div className="text-[9.5px] text-[#98a6b8]">LSTM</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono text-[19px] font-medium text-[#98a6b8]">
                                                    {stat?.naive ? stat.naive.mae.toFixed(2) : "—"}
                                                </div>
                                                <div className="text-[9.5px] text-[#98a6b8]">naive</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-3 rounded-[10px] border border-[#d4e0f5] bg-[#eaf0fb] px-[15px] py-3">
                            <div className="text-[11px] font-semibold text-[#1e4c9a]">The methodology check</div>
                            <div className="mt-1 text-[11.5px] leading-[1.65] text-[#3c4657]">
                                Every mature forecast is joined to the real, non-imputed sensor reading for the
                                same station and hour. The dashboard then reports rolling model MAE alongside a
                                same-hour previous-day baseline.
                            </div>
                        </div>

                    </Card>
                </div>

                {/* verified pipeline scale */}
                <Card className="mt-3.5 px-[22px] py-5">
                    <div className="text-sm font-semibold">End-to-end pipeline, measured</div>
                    <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                        Three years of hourly OpenAQ and Open-Meteo data, loaded into Snowflake and transformed with dbt.
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                            [FACTS.years, "years of history"],
                            [FACTS.externalApis, "external APIs"],
                            [FACTS.rawRecords.toLocaleString(), "raw records loaded"],
                            [FACTS.duplicateNaturalKeys, "duplicate natural keys"],
                            [FACTS.featureRows.toLocaleString(), "model-ready feature rows"],
                        ].map(([value, label]) => (
                            <div key={label} className="rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-[15px] py-3">
                                <div className="font-mono text-xl font-semibold text-[#1e4c9a]">{value}</div>
                                <div className="mt-1 text-[10.5px] text-[#5b6b7f]">{label}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* metric guide */}
                <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
                    <div className="rounded-xl border border-[#e3e8ee] bg-[#f7f9fb] px-5 py-[18px]">
                        <div className="font-mono text-xs font-semibold">MAE — mean absolute error</div>
                        <div className="mt-[7px] text-[11.5px] leading-[1.7] text-[#3c4657]">
                            Take every forecast, measure how far off it was, and average. V3&apos;s overall held-out
                            MAE is {LSTM_OFFLINE.mae.toFixed(2)} µg/m³; on the {FACTS.highEvents} high-PM2.5
                            events it is {LSTM_OFFLINE.highMae.toFixed(2)}. High here means above 35.4 µg/m³.
                        </div>
                    </div>
                    <div className="rounded-xl border border-[#e3e8ee] bg-[#f7f9fb] px-5 py-[18px]">
                        <div className="font-mono text-xs font-semibold">RMSE — root mean squared error</div>
                        <div className="mt-[7px] text-[11.5px] leading-[1.7] text-[#3c4657]">
                            Squares errors before averaging, so being wrong by 10 counts 100× more than being
                            wrong by 1. The gap between RMSE and MAE reveals spikes — and for wildfire smoke, the
                            spike days are exactly the days that matter for health. That&apos;s why both are reported.
                        </div>
                    </div>
                </div>

                {/* footer */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-5 rounded-xl bg-[#101828] px-5 py-[15px]">
                    <div className="flex flex-wrap gap-[7px]">
                        {TECH.map((t) => (
                            <span key={t}
                                  className="rounded-full border border-[#2a3546] px-2.5 py-1 font-mono text-[10.5px] font-medium text-[#aab6c6]">
                                {t}
                            </span>
                        ))}
                    </div>
                    <Link href="/" className="whitespace-nowrap text-xs font-semibold text-[#7fb0f4]">
                        ← Back to the live forecast
                    </Link>
                </div>
            </div>
        </div>
    );
}
