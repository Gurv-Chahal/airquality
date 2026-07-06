"use client";

import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { bandByLabel } from "@/lib/stations";

export type StationSummary = {
    id: string;
    name: string;
    sub: string;
    sensorId: number;
    lat: number;
    lon: number;
    latest: {
        predictedPm25: number | null;
        pm25AqiBand: string | null;
        validTime: string;
        issuedTime: string;
        modelVersion: string | null;
    } | null;
};

export default function StationMap({ stations, selected, onSelect }: {
    stations: StationSummary[];
    selected: string;
    onSelect: (id: string) => void;
}) {
    const [tileErrors, setTileErrors] = useState(0);
    const dead = tileErrors >= 3; // tiles unreachable -> graceful station list

    return (
        <div className="relative h-[296px] overflow-hidden rounded-[9px] border border-[#e3e8ee]">
            <MapContainer center={[51.55, -121.9]} zoom={5}
                          zoomControl={false} attributionControl={false}
                          dragging={false} scrollWheelZoom={false} doubleClickZoom={false}
                          boxZoom={false} keyboard={false} touchZoom={false}
                          style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <TileLayer url="https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png" maxZoom={12}
                           eventHandlers={{ tileerror: () => setTileErrors((e) => e + 1) }} />
                {stations.map((s) => {
                    const band = bandByLabel(s.latest?.pm25AqiBand);
                    const sel = s.id === selected;
                    return (
                        <CircleMarker
                            key={s.id}
                            center={[s.lat, s.lon]}
                            radius={sel ? 11 : 8}
                            pathOptions={{
                                color: sel ? "#101828" : "#ffffff",
                                weight: sel ? 2.5 : 1.5,
                                // marker color = predicted AQI band of the latest forecast
                                fillColor: band?.color ?? "#9ca3af",
                                fillOpacity: 1,
                            }}
                            eventHandlers={{ click: () => onSelect(s.id) }}
                        >
                            <Tooltip direction="top" offset={[0, -6]}>
                                {s.name}
                                {s.latest?.predictedPm25 != null &&
                                    ` · t+24h ${s.latest.predictedPm25.toFixed(1)} µg/m³`}
                            </Tooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
            {dead && (
                <div className="absolute inset-0 z-[500] flex flex-col gap-2 bg-[#eef2f5] p-4">
                    <div className="font-mono text-[10.5px] font-medium text-[#98a6b8]">
                        MAP TILES UNAVAILABLE — STATION LIST
                    </div>
                    {stations.map((s) => {
                        const band = bandByLabel(s.latest?.pm25AqiBand);
                        return (
                            <button key={s.id} type="button" onClick={() => onSelect(s.id)}
                                    className={`flex w-full items-center gap-2.5 rounded-[9px] border bg-white px-[13px] py-[11px] text-left text-xs font-medium text-[#101828] ${
                                        s.id === selected ? "border-[#2360c9]" : "border-[#dbe2ea]"
                                    }`}>
                                <span className="h-2.5 w-2.5 flex-none rounded-full"
                                      style={{ background: band?.color ?? "#9ca3af" }} />
                                <span className="flex-1">
                                    {s.name} <span className="font-normal text-[#5b6b7f]">· {s.sub}</span>
                                </span>
                                <b>{s.latest?.predictedPm25 != null ? s.latest.predictedPm25.toFixed(1) : "—"}</b>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
