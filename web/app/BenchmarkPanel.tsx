"use client";

export type EvalRow = {
    validTime: string;
    predictedPm25: number;
    actualPm25: number;
    absError: number;
    modelVersion: string | null;
};
export type MaeRow = { model: string; mae: number; n: number };

export default function BenchmarkPanel({ rows, mae, windowDays }: {
    rows: EvalRow[];
    mae: MaeRow[];
    windowDays: number;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-slate-500">
                No realized forecasts for this station yet — rows appear once forecasts mature
                (24h after issue) and the eval job has run.
            </p>
        );
    }
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-2">
                {mae.map((m) => (
                    <span key={m.model}
                          className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs">
                        <b>{m.model === "skeleton" ? "persistence baseline" : m.model}</b>
                        {" · "}MAE <b>{m.mae.toFixed(2)}</b> µg/m³ · {m.n} forecasts
                    </span>
                ))}
            </div>
            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr className="text-slate-500">
                        <th className="border-b border-slate-200 px-2 py-1.5 text-left font-medium">valid time</th>
                        <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">predicted</th>
                        <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">actual</th>
                        <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">|error|</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 10).map((r) => (
                        <tr key={`${r.validTime}-${r.modelVersion}`}>
                            <td className="border-b border-slate-100 px-2 py-1.5">
                                {new Date(r.validTime).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" })}
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right">{r.predictedPm25.toFixed(1)}</td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right">{r.actualPm25.toFixed(1)}</td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right">{r.absError.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">
                Latest 10 of {rows.length} realized forecasts (last {windowDays} days). MAE = mean absolute
                error vs sensor readings; the persistence baseline predicts &ldquo;same as this hour yesterday.&rdquo;
            </p>
        </div>
    );
}
