import { NextResponse } from "next/server";
import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { forecast } from "@/db/schema";
import { STATIONS } from "@/lib/stations";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

export async function GET() {
    // newest issued first; walking-skeleton rows (NULL model_version) excluded
    const rows = await db.select().from(forecast)
        .where(isNotNull(forecast.modelVersion))
        .orderBy(desc(forecast.issuedTime));

    // latest forecast per station -> map markers
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.stationId)) latest.set(r.stationId, r);

    return NextResponse.json(STATIONS.map((s) => ({ ...s, latest: latest.get(s.id) ?? null })));
}
