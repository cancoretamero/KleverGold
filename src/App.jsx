import React, { useEffect, useMemo, useState } from 'react'
import { CONFIG } from './config'
import { loadSeriesFromCsvUrl, apiForecast, apiRegime, apiRisk } from './services/epitomeApi'

export default function App() {
  const cfg = useMemo(() => CONFIG, [])
  const [series, setSeries] = useState(null)
  const [status, setStatus] = useState('Cargando CSV…')
  const [forecast, setForecast] = useState(null)
  const [regime, setRegime] = useState(null)
  const [risk, setRisk] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const url = cfg.CSV_URL || './data/xauusd_ohlc_clean.csv'
        const s = await loadSeriesFromCsvUrl(url)
        if (!alive) return
        setSeries(s)
        setStatus(`CSV listo (${s.length} filas)`)
      } catch (e) {
        setError(String(e))
        setStatus('Error cargando CSV')
      }
    })()
    return () => { alive = false }
  }, [cfg])

  async function runAll() {
    if (!series || !series.length) return
    setError(null)
    setForecast(null); setRegime(null); setRisk(null)
    setStatus('Llamando /forecast, /regime, /risk…')
    try {
      const [f, r, k] = await Promise.all([
        apiForecast(series, 24, 0.9),
        apiRegime(series, 1000),
        apiRisk(series, 500, 0.95)
      ])
      setForecast(f); setRegime(r); setRisk(k)
      setStatus('Listo ✅')
    } catch (e) {
      setError(String(e)); setStatus('Error en llamadas')
    }
  }

  return (
    <div className="min-h-screen p-6 bg-zinc-50 text-zinc-900">
      <header className="max-w-5xl mx-auto mb-6">
        <h1 className="text-2xl font-bold">KleverGold — Epitome v1</h1>
        <p className="text-sm text-zinc-600">
          EPITOME_ON: <b>{String(cfg.EPITOME_ON)}</b> · API: <code>{cfg.EPITOME_API || '—'}</code> · CSV: <code>{cfg.CSV_URL || '—'}</code>
        </p>
      </header>

      <main className="max-w-5xl mx-auto space-y-4">
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Estado</h2>
              <p className="text-sm text-zinc-600">{status}</p>
            </div>
            <button
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
              disabled={!series}
              onClick={runAll}
            >
              Ejecutar forecast + régimen + riesgo
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Forecast (q05–q95)</h3>
          <pre className="text-xs overflow-auto max-h-80">{forecast ? JSON.stringify(forecast, null, 2) : '—'}</pre>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Régimen (HMM)</h3>
          <pre className="text-xs overflow-auto max-h-80">{regime ? JSON.stringify(regime, null, 2) : '—'}</pre>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Riesgo (σ, VaR, ES)</h3>
          <pre className="text-xs overflow-auto max-h-80">{risk ? JSON.stringify(risk, null, 2) : '—'}</pre>
        </section>
      </main>
    </div>
  )
}
