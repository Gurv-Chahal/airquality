import ForecastChart from "./ForecastChart";

export default function Home() {
  return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>Prince George — PM2.5 Forecast (next 24h)</h1>
        <p style={{ color: "#666" }}>Seasonal-persistence baseline · reading from Supabase</p>
        <ForecastChart />
      </main>
  );
}
