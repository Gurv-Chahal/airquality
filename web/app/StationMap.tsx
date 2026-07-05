"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { BAND_COLORS } from "@/lib/stations";

export type StationSummary = {
    id: string;
    name: string;
    lat: number;
    lon: number;
    latest: { predictedPm25: number | null; pm25AqiBand: string | null; validTime: string } | null;
};

export default function StationMap({ stations, selected, onSelect }: {
    stations: StationSummary[];
    selected: string;
    onSelect: (id: string) => void;
}) {
    return (
        <MapContainer center={[51.5, -121.5]} zoom={5}
                      style={{ height: 340, width: "100%", borderRadius: 8, zIndex: 0 }}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {stations.map((s) => (
                <CircleMarker
                    key={s.id}
                    center={[s.lat, s.lon]}
                    radius={s.id === selected ? 12 : 9}
                    pathOptions={{
                        color: s.id === selected ? "#111827" : "#ffffff",
                        weight: 2,
                        // marker color = predicted AQI band of the latest forecast (the plan's 4c)
                        fillColor: BAND_COLORS[s.latest?.pm25AqiBand ?? ""] ?? "#9ca3af",
                        fillOpacity: 0.9,
                    }}
                    eventHandlers={{ click: () => onSelect(s.id) }}
                >
                    <Popup>
                        <b>{s.name}</b>
                        <br />
                        {s.latest ? (
                            <>
                                t+24h: {s.latest.predictedPm25?.toFixed(1)} µg/m³ ({s.latest.pm25AqiBand})
                                <br />
                                for {new Date(s.latest.validTime).toLocaleString()}
                            </>
                        ) : (
                            "no forecast yet"
                        )}
                    </Popup>
                </CircleMarker>
            ))}
        </MapContainer>
    );
}
