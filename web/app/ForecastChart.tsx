"use client";

import { useMemo } from "react";
import {
    ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
    ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { bandFor, UNHEALTHY_THRESHOLD } from "@/lib/stations";

// one row per hour; a row can carry any subset of the four series
export type ChartPoint = {
    t: number; // epoch ms, hourly
    actual?: number; // realized sensor reading
    past?: number; // model prediction, in hindsight
    future?: number; // model forecast for the next 24h
    naive?: number; // naive baseline: actual reading 24h earlier
};

const DAY_MS = 24 * 3600 * 1000;

const dayShort = (t: number) =>
    new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
const full = (t: number) =>
    new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric" });

const tickStyle = { fontSize: 10, fontWeight: 500, fill: "#98a6b8", fontFamily: "var(--font-plex-mono)" };

function DarkTooltip({ active, payload, showNaive }: {
    active?: boolean;
    payload?: { payload: ChartPoint }[];
    showNaive: boolean;
}) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    const model = p.past ?? p.future;
    const bandVal = p.actual ?? model;
    const band = bandVal != null ? bandFor(bandVal) : null;
    return (
        <div className="whitespace-nowrap rounded-lg bg-[#101828] px-[11px] py-2 font-mono text-[11px] font-medium text-white shadow-[0_8px_24px_rgba(16,24,40,.35)]">
            <div className="mb-[5px] text-[#98a6b8]">{full(p.t)}</div>
            {p.actual != null && (
                <div className="flex justify-between gap-3.5">
                    <span className="text-[#cbd5e1]">observed</span><b>{p.actual.toFixed(1)}</b>
                </div>
            )}
            {model != null && (
                <div className="flex justify-between gap-3.5">
                    <span className="text-[#8fb3ee]">model</span><b>{model.toFixed(1)}</b>
                </div>
            )}
            {showNaive && p.naive != null && (
                <div className="flex justify-between gap-3.5">
                    <span className="text-[#98a6b8]">naive</span><b>{p.naive.toFixed(1)}</b>
                </div>
            )}
            {band && (
                <div className="mt-1.5">
                    <span className="inline-block rounded-full px-2 py-px text-[10px] font-semibold"
                          style={{ background: band.color, color: band.fg }}>
                        {band.label}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function ForecastChart({ points, nowT, showNaive }: {
    points: ChartPoint[];
    nowT?: number;
    showNaive: boolean;
}) {
    // ticks on local midnights; every other day once the window passes ~9 days
    const ticks = useMemo(() => {
        if (points.length < 2) return [];
        const start = points[0].t, end = points[points.length - 1].t;
        const every = (end - start) / DAY_MS > 9 ? 2 : 1;
        const d = new Date(start);
        d.setHours(0, 0, 0, 0);
        const out: number[] = [];
        for (let t = d.getTime(), i = 0; t <= end; t += DAY_MS) {
            if (t < start) continue;
            if (i % every === 0) out.push(t);
            i += 1;
        }
        return out;
    }, [points]);

    if (points.length === 0) {
        return (
            <div className="flex h-[340px] items-center justify-center text-sm text-[#98a6b8]">
                no forecasts published for this station in the selected window yet
            </div>
        );
    }

    const end = points[points.length - 1].t;
    // a near-empty future line (e.g. a single forecast after an issuance gap)
    // would be invisible without dots
    const futureCount = points.filter((p) => p.future != null).length;

    return (
        <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e7ecf1" vertical={false} />
                {nowT != null && end > nowT && (
                    <ReferenceArea x1={nowT} x2={end} fill="#d97706" fillOpacity={0.055} />
                )}
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} ticks={ticks}
                       tickFormatter={dayShort} tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis domain={[0, "auto"]} width={40} tick={tickStyle} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip showNaive={showNaive} />}
                         cursor={{ stroke: "#64748b", strokeWidth: 1 }} isAnimationActive={false} />
                <ReferenceLine y={UNHEALTHY_THRESHOLD} stroke="#dc2626" strokeWidth={1.2}
                               strokeDasharray="5 4" ifOverflow="hidden"
                               label={{
                                   value: `unhealthy for sensitive groups · ${UNHEALTHY_THRESHOLD}`,
                                   position: "insideTopRight", fontSize: 10, fontWeight: 600,
                                   fill: "#dc2626", fontFamily: "var(--font-plex-mono)",
                               }} />
                {nowT != null && (
                    <ReferenceLine x={nowT} stroke="#98a6b8" strokeDasharray="2 4"
                                   label={{
                                       value: "now", position: "insideTopLeft", fontSize: 10,
                                       fontWeight: 600, fill: "#64748b", fontFamily: "var(--font-plex-mono)",
                                   }} />
                )}
                {showNaive && (
                    <Line type="monotone" dataKey="naive" stroke="#98a6b8" strokeWidth={1.4}
                          strokeDasharray="3 3" strokeOpacity={0.9} dot={false} activeDot={false}
                          connectNulls isAnimationActive={false} />
                )}
                <Line type="monotone" dataKey="actual" stroke="#334155" strokeWidth={2} dot={false}
                      activeDot={{ r: 4, fill: "#334155", stroke: "#fff", strokeWidth: 1.5 }}
                      connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="past" stroke="#2360c9" strokeWidth={1.6}
                      strokeDasharray="5 4" strokeOpacity={0.9} dot={false}
                      activeDot={{ r: 4, fill: "#2360c9", stroke: "#fff", strokeWidth: 1.5 }}
                      connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="future" stroke="#d97706" strokeWidth={2.4}
                      strokeDasharray="6 4"
                      dot={futureCount <= 2 ? { r: 3.5, fill: "#d97706", stroke: "#fff", strokeWidth: 1 } : false}
                      activeDot={{ r: 4, fill: "#d97706", stroke: "#fff", strokeWidth: 1.5 }}
                      connectNulls isAnimationActive={false} />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
