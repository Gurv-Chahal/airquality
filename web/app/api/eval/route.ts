import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { forecastEval } from "@/db/schema";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

const WINDOW_DAYS = 7; // rolling-MAE window, same as pipeline/inference/run_eval.py

export async function GET(request: Request) {
    const station = new URL(request.url).searchParams.get("station");
    if (!station) return NextResponse.json({ error: "station query param required" }, { status: 400 });

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
    const rows = await db.select().from(forecastEval)
        .where(and(eq(forecastEval.stationId, station), gte(forecastEval.validTime, since)))
        .orderBy(desc(forecastEval.validTime));

    // rolling MAE per model over the window (the benchmark-panel headline)
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
        const key = r.modelVersion ?? "skeleton";
        const a = acc.get(key) ?? { sum: 0, n: 0 };
        a.sum += r.absError;
        a.n += 1;
        acc.set(key, a);
    }
    const mae = [...acc.entries()].map(([model, { sum, n }]) => ({ model, mae: sum / n, n }));

    return NextResponse.json({ rows, mae, windowDays: WINDOW_DAYS });
}
