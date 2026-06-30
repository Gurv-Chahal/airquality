import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { forecast } from "@/db/schema";

export const dynamic = "force-dynamic"; // always read fresh from Postgres, don't cache

export async function GET() {
    const rows = await db.select().from(forecast).orderBy(asc(forecast.validTime));
    return NextResponse.json(rows);
}