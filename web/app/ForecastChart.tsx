"use client";

import { useEffect, useState } from "react";
import {
    LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts";

type ForecastRow = { validTime: string; predictedPm25: number; pm25AqiBand: string };

export default function ForecastChart() {
    const [data, setData] = useState<ForecastRow[]>([]);

    useEffect(() => {
        fetch("/api/forecast")
            .then((r) => r.json())
            .then(setData);
    }, []);

    const chartData = data.map((d) => ({
        time: new Date(d.validTime).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" }),
        pm25: d.predictedPm25,
    }));

    return (
        <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 70 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" angle={-45} textAnchor="end" height={90} tick={{ fontSize: 11 }} />
                <YAxis label={{ value: "PM2.5 (µg/m³)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                {/* the "unhealthy" threshold line from the plan */}
                <ReferenceLine y={35.4} stroke="red" strokeDasharray="4 4" label="Unhealthy (35.4)" />
                <Line type="monotone" dataKey="pm25" stroke="#2563eb" dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}