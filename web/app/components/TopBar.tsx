import Link from "next/link";

// Shared full-bleed header: logo block, nav pills, green live pill.
export default function TopBar({ active, pill }: {
    active: "forecast" | "model";
    pill: React.ReactNode;
}) {
    return (
        <div className="border-b border-[#e3e8ee] bg-white">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                <div className="flex items-center gap-[11px]">
                    <div className="h-[13px] w-[13px] rounded-[3px] bg-[#2360c9]" />
                    <div>
                        <div className="font-mono text-sm font-semibold tracking-[.12em]">BC AIRCAST</div>
                        <div className="mt-px font-mono text-[10px] font-medium tracking-[.16em] text-[#5b6b7f]">
                            PM2.5 · 24 H AHEAD
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {active === "forecast" ? (
                        <>
                            <span className="rounded-lg bg-[#101828] px-3.5 py-[7px] text-xs font-semibold text-white">
                                Forecast
                            </span>
                            <Link href="/model"
                                  className="rounded-lg border border-transparent px-3.5 py-[7px] text-xs font-medium text-[#5b6b7f] transition-colors hover:border-[#e3e8ee] hover:bg-[#f1f5f9] hover:text-[#101828]">
                                Model &amp; methods →
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/"
                                  className="rounded-lg border border-transparent px-3.5 py-[7px] text-xs font-medium text-[#5b6b7f] transition-colors hover:border-[#e3e8ee] hover:bg-[#f1f5f9] hover:text-[#101828]">
                                ← Forecast
                            </Link>
                            <span className="rounded-lg bg-[#101828] px-3.5 py-[7px] text-xs font-semibold text-white">
                                Model &amp; methods
                            </span>
                        </>
                    )}
                    <span className="ml-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#cfe7d6] bg-[#e9f5ec] px-[11px] py-1.5 font-mono text-[11px] font-medium text-[#3f6f4f]">
                        <span className="h-[7px] w-[7px] rounded-full bg-[#2fa45a] [animation:aqPulse_2.2s_infinite]" />
                        {pill}
                    </span>
                </div>
            </div>
        </div>
    );
}
