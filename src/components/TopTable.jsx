import React from 'react'

export default function TopTable({ rows }) {
  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Fecha", "Open", "High", "Low", "Close", "Rango"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50/50"}>
              <td className="px-3 py-2">{r.date.toISOString().slice(0, 10)}</td>
              <td className="px-3 py-2">{r.open}</td>
              <td className="px-3 py-2">{r.high}</td>
              <td className="px-3 py-2">{r.low}</td>
              <td className="px-3 py-2">{r.close}</td>
              <td className="px-3 py-2 font-medium">{r.range}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
