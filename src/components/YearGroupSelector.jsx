import React, { useMemo, useState, useEffect } from 'react'
import { SlidersHorizontal, CheckCircle2 } from 'lucide-react'

/**
 * YearGroupSelector (compact)
 * - Tarjetas por década compactas con grid denso
 * - Scroll horizontal con snap
 * - Acciones rápidas en segmented control
 */
export default function YearGroupSelector({ years = [], selectedYears = [], onChange = () => {} }) {
  const [search, setSearch] = useState('')
  const [internal, setInternal] = useState(new Set(selectedYears))
  useEffect(() => { setInternal(new Set(selectedYears)) }, [selectedYears.join(',')])

  const decades = useMemo(() => {
    const y = [...years].filter(Boolean).sort((a,b) => a-b)
    const groups = new Map()
    for (const yr of y) {
      if (search && !String(yr).includes(search)) continue
      const d = Math.floor(yr/10)*10
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d).push(yr)
    }
    return Array.from(groups.entries()).map(([decade, ys]) => ({ decade, years: ys }))
  }, [years, search])

  function toggleYear(y) {
    const next = new Set(internal)
    next.has(y) ? next.delete(y) : next.add(y)
    setInternal(next)
    onChange(Array.from(next).sort((a,b)=>a-b))
  }

  function toggleDecade(decade) {
    const ys = decades.find(d => d.decade === decade)?.years || []
    const next = new Set(internal)
    const allIn = ys.every(y => next.has(y))
    if (allIn) ys.forEach(y => next.delete(y)); else ys.forEach(y => next.add(y))
    setInternal(next)
    onChange(Array.from(next).sort((a,b)=>a-b))
  }

  function setQuick(n) {
    const pick = [...years].sort((a,b)=>a-b).slice(-n)
    setInternal(new Set(pick))
    onChange(pick)
  }

  function setAll(){ const y=[...years].sort((a,b)=>a-b); setInternal(new Set(y)); onChange(y); }
  function clearAll(){ setInternal(new Set()); onChange([]); }

  const totalSel = internal.size

  return (
    <div className="space-y-3">
      {/* Barra superior compacta */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="w-4 h-4 text-gray-500" /> Años
        </div>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} className="px-2 py-1.5 text-sm border rounded-md" placeholder="Buscar año…" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{totalSel} seleccionados</span>
          <div className="inline-flex items-center rounded-full bg-gray-100 p-0.5 border">
            <button onClick={setAll} className="px-2 py-1 text-xs rounded-full">Todos</button>
            <button onClick={clearAll} className="px-2 py-1 text-xs rounded-full">Ninguno</button>
            <button onClick={()=>setQuick(5)} className="px-2 py-1 text-xs rounded-full">Últimos 5</button>
            <button onClick={()=>setQuick(10)} className="px-2 py-1 text-xs rounded-full">Últimos 10</button>
          </div>
        </div>
      </div>

      {/* Tarjetas de década compactas */}
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2" style={{scrollbarWidth:'thin'}}>
        {decades.map(({decade, years}) => {
          const allIn = years.every(y => internal.has(y))
          const someIn = !allIn && years.some(y => internal.has(y))
          return (
            <div key={decade} className="snap-start shrink-0 min-w-[380px] max-w-[460px] rounded-xl border bg-white/80 backdrop-blur shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="text-sm font-semibold">{decade}–{decade+9}</div>
                <button onClick={() => toggleDecade(decade)} className={\`px-2 py-1 text-[11px] rounded-md border flex items-center gap-1 \${allIn ? 'bg-indigo-600 text-white border-indigo-600' : someIn ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white hover:bg-gray-50'}\`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> {allIn ? 'Quitar' : someIn ? 'Completar' : 'Seleccionar'}
                </button>
              </div>
              <div className="p-2 grid grid-cols-6 gap-1.5">
                {years.map(y => (
                  <button key={y} onClick={() => toggleYear(y)} className={\`px-2 py-1 text-[11px] rounded-md border text-center transition \${internal.has(y) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50'}\`}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
