import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { forecastEval } from "@/db/schema";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

const WINDOW_DAYS = 7; // rolling-MAE window, same as pipeline/inference/run_eval.py
const HISTORY_DAYS = 15; // rows returned for the chart: 14d view + 24h of naive lookback

const HOUR_MS = 3600 * 1000;

export async function GET(request: Request) {
    const station = new URL(request.url).searchParams.get("station");
    if (!station) return NextResponse.json({ error: "station query param required" }, { status: 400 });

    const since = new Date(Date.now() - HISTORY_DAYS * 24 * HOUR_MS);
    const rows = await db.select().from(forecastEval)
        .where(and(eq(forecastEval.stationId, station), gte(forecastEval.validTime, since)))
        .orderBy(desc(forecastEval.validTime));

    // rolling MAE per model over the window (the benchmark-panel headline)
    const maeSince = Date.now() - WINDOW_DAYS * 24 * HOUR_MS;
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
        if (r.validTime.getTime() < maeSince) continue;
        const key = r.modelVersion ?? "skeleton";
        const a = acc.get(key) ?? { sum: 0, n: 0 };
        a.sum += r.absError;
        a.n += 1;
        acc.set(key, a);
    }
    const mae = [...acc.entries()].map(([model, { sum, n }]) => ({ model, mae: sum / n, n }));

    // Naive same-hour-yesterday baseline over the same window, scored from the
    // realized sensor readings the eval loop already stored: the naive forecast
    // for hour t is the actual reading at t−24h. (forecast_eval has no baseline
    // rows — the pipeline only scores the model.)
    const actualAt = new Map<number, number>();
    for (const r of rows) actualAt.set(r.validTime.getTime(), r.actualPm25);
    let sum = 0, n = 0;
    for (const [t, actual] of actualAt) {
        if (t < maeSince) continue;
        const prev = actualAt.get(t - 24 * HOUR_MS);
        if (prev == null) continue;
        sum += Math.abs(actual - prev);
        n += 1;
    }
    const naive = n > 0 ? { mae: sum / n, n } : null;

    return NextResponse.json({ rows, mae, naive, windowDays: WINDOW_DAYS });
}
