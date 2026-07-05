import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { forecast } from "@/db/schema";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

export async function GET(request: Request) {
    const station = new URL(request.url).searchParams.get("station");
    if (!station) return NextResponse.json({ error: "station query param required" }, { status: 400 });

    // newest issued first; walking-skeleton rows (NULL model_version) excluded
    const rows = await db.select().from(forecast)
        .where(and(eq(forecast.stationId, station), isNotNull(forecast.modelVersion)))
        .orderBy(desc(forecast.issuedTime));
    return NextResponse.json(rows);
}
