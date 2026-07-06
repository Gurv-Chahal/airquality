"use client";

export type EvalRow = {
    validTime: string;
    predictedPm25: number;
    actualPm25: number;
    absError: number;
    modelVersion: string | null;
};
export type MaeRow = { model: string; mae: number; n: number };
export type NaiveMae = { mae: number; n: number };

const fullTime = (t: string) =>
    new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric" });

// Realized-accuracy card body: LSTM vs naive MAE pills + latest scored forecasts.
export default function BenchmarkPanel({ rows, lstm, naive }: {
    rows: EvalRow[];
    lstm: MaeRow | null;
    naive: NaiveMae | null;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-[#5b6b7f]">
                No realized forecasts for this station yet — rows appear once forecasts mature
                (24h after issue) and the eval job has run.
            </p>
        );
    }
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#d4e0f5] bg-[#eaf0fb] px-[11px] py-[5px] font-mono text-[11px] font-medium text-[#1e4c9a]">
                    LSTM · MAE <b>{lstm ? lstm.mae.toFixed(2) : "—"}</b>{lstm ? ` · ${lstm.n} forecasts` : ""}
                </span>
                <span className="rounded-full border border-[#e3e8ee] bg-[#f1f4f7] px-[11px] py-[5px] font-mono text-[11px] font-medium text-[#5b6b7f]">
                    naive same-hour-yesterday · MAE <b>{naive ? naive.mae.toFixed(2) : "—"}</b>
                </span>
            </div>
            <table className="w-full border-collapse font-mono text-[11.5px]">
                <thead>
                    <tr className="text-right text-[#5b6b7f]">
                        <th className="border-b border-[#e3e8ee] px-2 py-[5px] text-left font-medium">valid time</th>
                        <th className="border-b border-[#e3e8ee] px-2 py-[5px] font-medium">predicted</th>
                        <th className="border-b border-[#e3e8ee] px-2 py-[5px] font-medium">actual</th>
                        <th className="border-b border-[#e3e8ee] px-2 py-[5px] font-medium">|error|</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 8).map((r) => (
                        <tr key={`${r.validTime}-${r.modelVersion}`} className="text-right">
                            <td className="border-b border-[#eef2f6] px-2 py-[5px] text-left text-[#3c4657]">
                                {fullTime(r.validTime)}
                            </td>
                            <td className="border-b border-[#eef2f6] px-2 py-[5px] text-[#1e4c9a]">{r.predictedPm25.toFixed(1)}</td>
                            <td className="border-b border-[#eef2f6] px-2 py-[5px]">{r.actualPm25.toFixed(1)}</td>
                            <td className="border-b border-[#eef2f6] px-2 py-[5px] text-[#5b6b7f]">{r.absError.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-[9px] text-[10.5px] text-[#98a6b8]">
                Latest 8 realized forecasts. Scored only against real sensor readings, never gap-filled values.
            </p>
        </div>
    );
}
