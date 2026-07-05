import Dashboard from "./Dashboard";

export default function Home() {
    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-900">
            <main className="mx-auto max-w-5xl px-5 py-8">
                <header className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight">
                        BC Air Quality <span className="text-blue-600">— PM2.5 Forecast</span>
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Machine-learning forecasts of fine-particulate pollution, 24 hours ahead, for
                        British Columbia monitoring stations.
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                        OpenAQ sensors + Open-Meteo weather → Snowflake / dbt features → PyTorch LSTM →
                        precomputed hourly into Postgres
                    </p>
                </header>
                <Dashboard />
            </main>
        </div>
    );
}
