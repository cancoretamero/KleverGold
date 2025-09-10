import React from 'react'

export default function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <div className="p-4 rounded-2xl shadow-sm bg-white border flex items-center gap-3">
      <div className="p-2 rounded-xl bg-gray-100">{Icon ? <Icon className="w-5 h-5" /> : null}</div>
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-gray-400">{hint}</div>}
      </div>
    </div>
  );
}
