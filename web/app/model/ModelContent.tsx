"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "../components/TopBar";
import { STATIONS } from "@/lib/stations";
import {
    FACTS, LSTM_OFFLINE, OFFLINE_METRICS, PERSISTENCE_OFFLINE, XGB_OFFLINE,
    rmsePctVsPersistence, rmsePctVsXgb,
} from "@/lib/model-facts";

type Metric = "rmse" | "mae";
type LiveStat = {
    id: string;
    lstm: { mae: number; n: number } | null;
    naive: { mae: number; n: number } | null;
};

const TECH = ["PyTorch", "Snowflake", "dbt", "Weights & Biases", "Postgres", "OpenAQ", "Open-Meteo"];

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return (
        <div className={`rounded-xl border border-[#e3e8ee] bg-white ${className}`}>{children}</div>
    );
}

function Arrow() {
    return (
        <div className="flex items-center justify-center px-[7px] font-mono text-[13px] font-semibold text-[#98a6b8] max-md:rotate-90 max-md:py-1">
            →
        </div>
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

    const liveMaes = live.map((l) => l.lstm?.mae).filter((v): v is number => v != null);
    const liveRange = liveMaes.length
        ? `${Math.min(...liveMaes).toFixed(2)}–${Math.max(...liveMaes).toFixed(2)}`
        : "—";
    const liveNaives = live.map((l) => l.naive?.mae).filter((v): v is number => v != null);
    const liveNaiveBest = liveNaives.length ? Math.max(...liveNaives) : null;

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
                            One number, 24 hours early — and the receipts to back it.
                        </h1>
                        <p className="mt-4 max-w-[560px] text-sm leading-[1.7] text-[#3c4657]">
                            A PyTorch LSTM reads the last 48 hours of sensor and weather data and predicts PM2.5
                            one full day ahead, for three BC monitoring stations. It had to beat three baselines
                            on identical held-out data to ship — including a tuned XGBoost — and it keeps scoring
                            itself against reality every hour in production.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-[#101828] px-[18px] py-4 text-white">
                            <div className="font-mono text-[26px] font-semibold">
                                {LSTM_OFFLINE.mae.toFixed(3)} <span className="text-xs font-medium text-[#8b98ab]">MAE</span>
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#aab6c6]">
                                held-out future test, µg/m³ — best of all four models
                                (RMSE {LSTM_OFFLINE.rmse.toFixed(3)}, also best)
                            </div>
                        </div>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold text-[#166534]">
                                −{rmsePctVsPersistence.toFixed(1)}%
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                RMSE vs the naive same-hour-yesterday forecast
                            </div>
                        </Card>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold text-[#166534]">
                                −{rmsePctVsXgb.toFixed(1)}%
                            </div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                RMSE vs a tuned XGBoost trained on the same windows
                            </div>
                        </Card>
                        <Card className="px-[18px] py-4">
                            <div className="font-mono text-[26px] font-semibold">{liveRange}</div>
                            <div className="mt-1.5 text-[11px] leading-[1.55] text-[#5b6b7f]">
                                live rolling 7-day MAE across stations
                                {liveNaiveBest != null && <> — vs {liveNaiveBest.toFixed(2)} for the naive baseline</>}
                            </div>
                        </Card>
                    </div>
                </div>

                {/* benchmarks + live */}
                <div className="mt-6 grid gap-3.5 lg:grid-cols-[7fr_5fr]">
                    <Card className="px-[22px] py-5">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div>
                                <div className="text-sm font-semibold">Four models, same exam</div>
                                <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                                    All scored on the same held-out future test period. Lower is better.
                                </div>
                            </div>
                            <div className="inline-flex gap-0.5 rounded-[9px] bg-[#e7ebf0] p-[3px]">
                                {(["rmse", "mae"] as const).map((m) => (
                                    <button key={m} type="button" onClick={() => setMetric(m)}
                                            className={`rounded-[7px] px-3.5 py-1.5 font-mono text-[11.5px] font-semibold transition-all ${
                                                metric === m
                                                    ? "bg-white text-[#101828] shadow-[0_1px_3px_rgba(16,24,40,.14)]"
                                                    : "text-[#5b6b7f]"
                                            }`}>
                                        {m.toUpperCase()}
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
                                        {m[metric].toFixed(3)} {metric.toUpperCase()}{" "}
                                        <span className="text-[10px] font-normal text-[#98a6b8]">
                                            {metric === "rmse"
                                                ? `${m.mae.toFixed(3)} MAE`
                                                : `${m.rmse.toFixed(3)} RMSE`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-[18px] flex flex-wrap gap-2">
                            <span className="rounded-full bg-[#166534] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-white">
                                −{rmsePctVsPersistence.toFixed(1)}% RMSE vs naive
                            </span>
                            <span className="rounded-full border border-[#cfe7d6] bg-[#e9f5ec] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-[#166534]">
                                −{rmsePctVsXgb.toFixed(1)}% RMSE vs tuned XGBoost
                            </span>
                            <span className="rounded-full border border-[#d4e0f5] bg-[#eaf0fb] px-[11px] py-1 font-mono text-[10.5px] font-semibold text-[#1e4c9a]">
                                best MAE and best RMSE
                            </span>
                        </div>
                        <p className="mt-4 text-xs leading-[1.7] text-[#3c4657]">
                            How to read this: persistence has decent MAE but the worst RMSE of the serious
                            models — copying yesterday is <i>catastrophically</i> wrong exactly when conditions
                            change, which is when a forecast matters. The LSTM&apos;s RMSE margin comes from
                            handling those volatile hours, not from shaving decimals on calm days.
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
                                The naive baseline&apos;s live MAE
                                {liveNaiveBest != null && <> ({liveNaiveBest.toFixed(2)})</>} can be compared
                                directly with its offline test value ({PERSISTENCE_OFFLINE.mae.toFixed(2)}) —
                                the closer they track, the stronger the evidence that the offline evaluation
                                reflects production reality rather than fooling itself.
                            </div>
                        </div>
                        <p className="mt-3 text-[10.5px] italic leading-[1.65] text-[#98a6b8]">
                            Honest caveat: a calm, clean-air live window is easier than the test split, which
                            includes the 2023 wildfire season. The gap over baselines is expected to widen
                            during smoke events, which the eval table will demonstrate over time.
                        </p>
                    </Card>
                </div>

                {/* pipeline diagram */}
                <Card className="mt-3.5 p-[22px]">
                    <div className="text-sm font-semibold">How a forecast is made</div>
                    <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                        Two loops, deliberately separated: training happens occasionally and offline; inference
                        runs hourly and never depends on training data volume.
                    </div>

                    <div className="mt-[18px] flex items-stretch max-md:flex-col">
                        <div className="flex-[1.2] rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-3.5 py-3">
                            <div className="font-mono text-[11px] font-semibold">OpenAQ + Open-Meteo</div>
                            <div className="mt-[3px] text-[10px] leading-[1.5] text-[#5b6b7f]">
                                PM2.5 ground truth + weather — same sources for train &amp; serve, no skew
                            </div>
                        </div>
                        <Arrow />
                        <div className="flex-1 rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-3.5 py-3">
                            <div className="font-mono text-[11px] font-semibold">Python ingest</div>
                            <div className="mt-[3px] text-[10px] leading-[1.5] text-[#5b6b7f]">
                                ~3 years hourly, chunked + retried, idempotent reloads
                            </div>
                        </div>
                        <Arrow />
                        <div className="flex-1 rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-3.5 py-3">
                            <div className="font-mono text-[11px] font-semibold">Snowflake RAW</div>
                            <div className="mt-[3px] text-[10px] leading-[1.5] text-[#5b6b7f]">
                                warehouse landing zone
                            </div>
                        </div>
                        <Arrow />
                        <div className="flex-[1.1] rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-3.5 py-3">
                            <div className="font-mono text-[11px] font-semibold">dbt transform</div>
                            <div className="mt-[3px] text-[10px] leading-[1.5] text-[#5b6b7f]">
                                staging → gap-fill → features, with build-failing tests
                            </div>
                        </div>
                        <Arrow />
                        <div className="flex-[1.2] rounded-[10px] border border-[#d4e0f5] bg-[#eaf0fb] px-3.5 py-3">
                            <div className="font-mono text-[11px] font-semibold text-[#1e4c9a]">feat_airquality</div>
                            <div className="mt-[3px] text-[10px] leading-[1.5] text-[#3c4657]">
                                13 features / station / hour — the <b>single</b> feature source both loops read
                            </div>
                        </div>
                    </div>

                    <div className="hidden justify-center gap-[340px] py-1.5 font-mono text-[13px] font-semibold text-[#98a6b8] md:flex">
                        <span>↓</span><span>↓</span>
                    </div>
                    <div className="flex justify-center py-1.5 font-mono text-[13px] font-semibold text-[#98a6b8] md:hidden">
                        <span>↓</span>
                    </div>

                    <div className="grid gap-3.5 md:grid-cols-2">
                        <div className="rounded-[10px] border border-[#e3e8ee] px-[18px] py-4">
                            <div className="flex items-center justify-between">
                                <div className="font-mono text-[11px] font-semibold tracking-[.12em]">TRAINING LOOP</div>
                                <span className="rounded-full bg-[#f1f4f7] px-[9px] py-[3px] font-mono text-[10px] font-medium text-[#5b6b7f]">
                                    occasional · offline
                                </span>
                            </div>
                            <div className="mt-2.5 text-[11.5px] leading-[1.75] text-[#3c4657]">
                                Notebooks: EDA → windowing → baselines → LSTM. Reads full feature history, slices{" "}
                                {FACTS.windows.toLocaleString()} supervised windows, splits 70/15/15 <b>by time</b>,
                                keeps the epoch with best validation MAE.
                            </div>
                            <div className="mt-3 rounded-[9px] bg-[#101828] px-3.5 py-[11px] text-[#e8edf4]">
                                <div className="font-mono text-[11px] font-semibold">
                                    W&amp;B artifact — {FACTS.artifact}
                                </div>
                                <div className="mt-[3px] text-[10px] text-[#aab6c6]">
                                    model.pt + preprocess.joblib + model_config.json — everything inference needs, versioned
                                </div>
                            </div>
                        </div>
                        <div className="rounded-[10px] border border-[#e3e8ee] px-[18px] py-4">
                            <div className="flex items-center justify-between">
                                <div className="font-mono text-[11px] font-semibold tracking-[.12em]">INFERENCE LOOP</div>
                                <span className="rounded-full bg-[#e9f5ec] px-[9px] py-[3px] font-mono text-[10px] font-medium text-[#3f6f4f]">
                                    recurring · batch
                                </span>
                            </div>
                            <div className="mt-2.5 text-[11.5px] leading-[1.75] text-[#3c4657]">
                                Latest contiguous 48 h window per station → <b>pinned</b> artifact version → one
                                forward pass → clamp ≥ 0, bucket into EPA band → idempotent upsert into Postgres.
                                The model never runs on a page load.
                            </div>
                            <div className="mt-3 rounded-[9px] border border-[#e3e8ee] bg-[#f7f9fb] px-3.5 py-[11px]">
                                <div className="font-mono text-[11px] font-semibold">eval loop closes it</div>
                                <div className="mt-[3px] text-[10px] text-[#5b6b7f]">
                                    forecasts joined vs realized sensor readings → rolling MAE → public accuracy
                                    display <b>and</b> the retraining trigger
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 text-center font-mono text-[10.5px] font-medium text-[#98a6b8]">
                        <span className="text-[#5b6b7f]">↺</span>
                        when live error degrades past the offline benchmark → retrain → new artifact version →
                        explicit, reversible deploy
                    </div>
                </Card>

                {/* inside the model + dataset */}
                <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[7fr_5fr]">
                    <Card className="px-[22px] py-5">
                        <div className="text-sm font-semibold">Inside the model</div>
                        <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                            Intentionally small — an architecture the data volume can support.
                        </div>
                        <div className="mt-4 flex items-stretch max-md:flex-col">
                            <div className="flex-[1.3] rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-[13px] py-[11px] text-center">
                                <div className="font-mono text-[11px] font-semibold">
                                    {FACTS.seqLen} h × {FACTS.nFeatures} features
                                </div>
                                <div className="mt-0.5 text-[9.5px] text-[#5b6b7f]">input window</div>
                            </div>
                            <Arrow />
                            <div className="flex-[1.3] rounded-[10px] border border-[#d4e0f5] bg-[#eaf0fb] px-[13px] py-[11px] text-center">
                                <div className="font-mono text-[11px] font-semibold text-[#1e4c9a]">
                                    LSTM · {FACTS.hidden} units
                                </div>
                                <div className="mt-0.5 text-[9.5px] text-[#5b6b7f]">
                                    {FACTS.layers} layer, reads hours in order
                                </div>
                            </div>
                            <Arrow />
                            <div className="flex-1 rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-[13px] py-[11px] text-center">
                                <div className="font-mono text-[11px] font-semibold">Linear {FACTS.hidden}→1</div>
                                <div className="mt-0.5 text-[9.5px] text-[#5b6b7f]">last hidden state</div>
                            </div>
                            <Arrow />
                            <div className="flex-[1.1] rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-[13px] py-[11px] text-center">
                                <div className="font-mono text-[11px] font-semibold">PM2.5 @ t+{FACTS.horizonHours}h</div>
                                <div className="mt-0.5 text-[9.5px] text-[#5b6b7f]">then bucketed to EPA band</div>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-[7px]">
                            {[
                                `Adam · lr ${FACTS.lr}`,
                                "MSE loss — punishes spikes",
                                `${FACTS.epochs} epochs · batch ${FACTS.batch}`,
                                "checkpoint by best val MAE",
                                "target unscaled — errors in real µg/m³",
                            ].map((chip) => (
                                <span key={chip}
                                      className="rounded-full border border-[#e3e8ee] bg-[#f1f4f7] px-2.5 py-1 font-mono text-[10.5px] font-medium text-[#3c4657]">
                                    {chip}
                                </span>
                            ))}
                        </div>
                        <p className="mt-4 text-xs leading-[1.7] text-[#3c4657]">
                            Features (built in dbt, in SQL — one implementation for both training and serving):
                            current PM2.5 and lags (1 h / 24 h / 48 h), trailing 24 h rolling mean &amp; max,
                            temperature, wind speed &amp; direction, precipitation, local hour-of-day and
                            day-of-week, and a <span className="font-mono text-[11px]">was_imputed</span> flag
                            so the model can trust gap-filled values less.
                        </p>
                    </Card>

                    <Card className="px-[22px] py-5">
                        <div className="text-sm font-semibold">The dataset</div>
                        <div className="mt-3.5 grid grid-cols-2 gap-3">
                            {[
                                { big: FACTS.windows.toLocaleString(), note: "supervised windows — none straddling a sensor gap" },
                                { big: `~${Math.round(FACTS.featureRows / 1000)},000`, note: "hourly feature rows, mid-2023 → present" },
                                { big: FACTS.split, note: "train / val / test — split by time, never shuffled" },
                                { big: "2023", note: "wildfire season included — a model that has never seen smoke can't predict smoke" },
                            ].map((tile) => (
                                <div key={tile.note} className="rounded-[10px] border border-[#e3e8ee] px-3.5 py-3">
                                    <div className="font-mono text-xl font-semibold">{tile.big}</div>
                                    <div className="mt-[3px] text-[10.5px] leading-[1.5] text-[#5b6b7f]">{tile.note}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 rounded-[10px] border border-[#e3e8ee] bg-[#f7f9fb] px-[15px] py-3">
                            <div className="text-[11px] font-semibold">Missing data, handled honestly</div>
                            <div className="mt-1 text-[11px] leading-[1.7] text-[#5b6b7f]">
                                Gaps up to 6 h are forward-filled and flagged; longer gaps are dropped entirely —
                                a 2-day-old reading pretending to be current would be misinformation, not data.
                            </div>
                        </div>
                    </Card>
                </div>

                {/* leakage guards */}
                <Card className="mt-3.5 px-[22px] py-5">
                    <div className="text-sm font-semibold">Leakage guards — why the offline numbers can be trusted</div>
                    <div className="mt-[3px] text-[11.5px] text-[#5b6b7f]">
                        A forecasting model trained on information from the future scores brilliantly offline
                        and fails in production. Five guards prevent that here.
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                        {[
                            {
                                title: "Trailing-only rolling features",
                                body: <>Windows end at the current row, never centered. A dbt test recomputes them independently and <b>fails the build</b> if they ever disagree.</>,
                            },
                            {
                                title: "Time-based split",
                                body: <>Validation and test are strictly later in time than training — mimicking real deployment, never a random shuffle.</>,
                            },
                            {
                                title: "Scaler fit on train only",
                                body: <>Saved with the model so inference applies the identical transform — the test period never contaminates the inputs.</>,
                            },
                            {
                                title: "One windowing implementation",
                                body: <>Training and production share the same unit-tested slicing code — an off-by-one bug can&apos;t exist in only one place.</>,
                            },
                            {
                                title: "Eval vs real readings only",
                                body: <>Live accuracy is never scored against gap-filled values — the model can&apos;t grade its own homework.</>,
                            },
                        ].map((g) => (
                            <div key={g.title} className="rounded-[10px] border border-[#e3e8ee] px-[15px] py-[13px]">
                                <div className="text-[11.5px] font-semibold">{g.title}</div>
                                <div className="mt-[5px] text-[10.5px] leading-[1.6] text-[#5b6b7f]">{g.body}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* why an LSTM */}
                <Card className="mt-3.5 px-[22px] py-5">
                    <div className="text-sm font-semibold">Why an LSTM — and not &ldquo;just regression&rdquo; or trees</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[10px] border border-[#e3e8ee] px-4 py-3.5">
                            <div className="font-mono text-[11px] font-semibold tracking-[.1em] text-[#98a6b8]">
                                VS LINEAR REGRESSION
                            </div>
                            <div className="mt-2 text-[11.5px] leading-[1.7] text-[#3c4657]">
                                Air quality isn&apos;t a weighted sum. What &ldquo;wind picked up&rdquo; means depends
                                on whether PM2.5 has been rising, the wind&apos;s direction, and the time of day —
                                interactions a linear model can&apos;t express without hand-crafting every combination.
                            </div>
                        </div>
                        <div className="rounded-[10px] border border-[#e3e8ee] px-4 py-3.5">
                            <div className="font-mono text-[11px] font-semibold tracking-[.1em] text-[#98a6b8]">
                                VS XGBOOST
                            </div>
                            <div className="mt-2 text-[11.5px] leading-[1.7] text-[#3c4657]">
                                Trees see the window as a flat bag of {FACTS.seqLen * FACTS.nFeatures} numbers with
                                no concept of order — &ldquo;rose steadily for 6 hours&rdquo; and the same values
                                shuffled look structurally identical. The LSTM reads hours <i>as a sequence</i>, so
                                trend, momentum and duration come naturally. It won on both metrics anyway.
                            </div>
                        </div>
                        <div className="rounded-[10px] border border-[#e3e8ee] px-4 py-3.5">
                            <div className="font-mono text-[11px] font-semibold tracking-[.1em] text-[#98a6b8]">
                                THE GROWTH PATH
                            </div>
                            <div className="mt-2 text-[11.5px] leading-[1.7] text-[#3c4657]">
                                Next step is multi-horizon forecasting (24/48/72 h) via a seq2seq decoder that
                                consumes <i>known future weather</i> — forecasts exist for tomorrow&apos;s wind.
                                Trees have no clean equivalent; autoregression was rejected because errors compound.
                            </div>
                        </div>
                    </div>
                    <p className="mt-3.5 text-[11.5px] italic leading-[1.7] text-[#5b6b7f]">
                        Kept honest: the margin over XGBoost is real but modest ({LSTM_OFFLINE.mae.toFixed(2)} vs{" "}
                        {XGB_OFFLINE.mae.toFixed(2)} MAE) — the expected picture at this data volume. XGBoost stays in the results table
                        on purpose: a benchmark you can&apos;t show is a benchmark you didn&apos;t beat.
                    </p>
                </Card>

                {/* metric guide */}
                <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
                    <div className="rounded-xl border border-[#e3e8ee] bg-[#f7f9fb] px-5 py-[18px]">
                        <div className="font-mono text-xs font-semibold">MAE — mean absolute error</div>
                        <div className="mt-[7px] text-[11.5px] leading-[1.7] text-[#3c4657]">
                            Take every forecast, measure how far off it was, average. &ldquo;Our forecasts are off
                            by 2.8 µg/m³ on average.&rdquo; The most interpretable metric — same unit as PM2.5
                            itself. For scale: a clean day is ~2–10, &ldquo;unhealthy for sensitive groups&rdquo;
                            starts at 35.4, severe wildfire smoke exceeds 150.
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
