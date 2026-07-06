import type { Metadata } from "next";
import ModelContent from "./ModelContent";

export const metadata: Metadata = {
    title: "Model & methods — BC AirCast",
    description:
        "How the BC AirCast PM2.5 forecast is made: benchmarks, pipeline, architecture, and leakage guards.",
};

export default function ModelPage() {
    return <ModelContent />;
}
