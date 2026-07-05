import { pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";

export const forecast = pgTable("forecast", {
    stationId: text("station_id").notNull(),
    validTime: timestamp("valid_time", { withTimezone: true }).notNull(),
    issuedTime: timestamp("issued_time", { withTimezone: true }).notNull(),
    horizonHours: integer("horizon_hours").notNull(),
    predictedPm25: real("predicted_pm25"),
    exceedanceProb: real("exceedance_prob"),
    pm25AqiBand: text("pm25_aqi_band"),
    modelVersion: text("model_version"),
});

export const forecastEval = pgTable("forecast_eval", {
    stationId: text("station_id").notNull(),
    validTime: timestamp("valid_time", { withTimezone: true }).notNull(),
    issuedTime: timestamp("issued_time", { withTimezone: true }).notNull(),
    horizonHours: integer("horizon_hours").notNull(),
    modelVersion: text("model_version"),
    predictedPm25: real("predicted_pm25").notNull(),
    actualPm25: real("actual_pm25").notNull(),
    absError: real("abs_error").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
});