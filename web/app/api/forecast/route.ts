import { NextResponse } from "next/server";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { forecast } from "@/db/schema";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

const HISTORY_DAYS = 15; // bound the payload to what the 14d chart view can show

export async function GET(request: Request) {
    const station = new URL(request.url).searchParams.get("station");
    if (!station) return NextResponse.json({ error: "station query param required" }, { status: 400 });

    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3600 * 1000);
    // newest issued first; walking-skeleton rows (NULL model_version) excluded
    const rows = await db.select().from(forecast)
        .where(and(
            eq(forecast.stationId, station),
            isNotNull(forecast.modelVersion),
            gte(forecast.validTime, since),
        ))
        .orderBy(desc(forecast.issuedTime));
    return NextResponse.json(rows);
}
