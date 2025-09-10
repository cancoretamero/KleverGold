import React from 'react'
import Papa from 'papaparse'
import { Upload } from 'lucide-react'
import { parseNumber, toDate, sanitizeOhlc } from '../utils.js'

export default function CsvLoader({ onData }) {
  function handle(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data
          .map((r) => {
            const date = toDate(r.date || r.Date || r.timestamp || r.time);
            const open = parseNumber(r.open ?? r.Open);
            const high = parseNumber(r.high ?? r.High);
            const low = parseNumber(r.low ?? r.Low);
            const close = parseNumber(r.close ?? r.Close);
            if (!date || open == null || high == null || low == null || close == null) return null;
            return sanitizeOhlc({ date, open, high, low, close, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
          })
          .filter(Boolean)
          .sort((a, b) => +a.date - +b.date);
        onData(rows);
      },
      error: () => alert("No se pudo leer el CSV. Formato: date, open, high, low, close"),
    });
  }
  return (
    <div className="border-2 border-dashed rounded-2xl p-6 text-center">
      <div className="text-sm text-gray-700 mb-2">Arrastra tu CSV aquí o selecciónalo</div>
      <label className="px-2 py-1 rounded-md bg-indigo-600 text-white cursor-pointer inline-flex items-center gap-2">
        <Upload className="w-4 h-4" />
        <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        Cargar CSV
      </label>
    </div>
  );
}
