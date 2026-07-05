"use client";

import {
    LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { UNHEALTHY_THRESHOLD } from "@/lib/stations";

// one row per hour; a row can carry any subset of the three series
export type ChartPoint = { time: string; actual?: number; past?: number; future?: number };

const day = (t: string) =>
    new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
const full = (t: string) =>
    new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" });

export default function ForecastChart({ points, nowTime }: { points: ChartPoint[]; nowTime?: string }) {
    return (
        <ResponsiveContainer width="100%" height={360}>
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tickFormatter={day} minTickGap={48} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={44}
                       label={{ value: "µg/m³", position: "insideTopLeft", offset: 4, fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                    labelFormatter={(t) => full(String(t))}
                    formatter={(v) => [`${Number(v).toFixed(1)} µg/m³`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={UNHEALTHY_THRESHOLD} stroke="#dc2626" strokeDasharray="4 4"
                               ifOverflow="extendDomain"
                               label={{ value: `unhealthy (${UNHEALTHY_THRESHOLD})`, fontSize: 11, fill: "#dc2626", position: "insideBottomRight" }} />
                {nowTime && (
                    <ReferenceLine x={nowTime} stroke="#94a3b8" strokeDasharray="2 4"
                                   label={{ value: "now", fontSize: 11, fill: "#64748b", position: "insideTopRight" }} />
                )}
                <Line type="monotone" dataKey="actual" name="observed PM2.5" stroke="#475569"
                      strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="past" name="model prediction (past)" stroke="#2563eb"
                      strokeDasharray="6 3" dot={false} />
                <Line type="monotone" dataKey="future" name="model forecast (next 24h)" stroke="#d97706"
                      strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}
