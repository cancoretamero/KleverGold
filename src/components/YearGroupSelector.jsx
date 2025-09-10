import React, { useMemo, useState, useEffect } from 'react'

/**
 * YearGroupSelector
 * - Agrupa años por década
 * - UI moderna: tarjetas por década en scroll horizontal con scroll-snap
 * - Chips de año seleccionables
 * - Acciones rápidas: Todos / Ninguno / Últimos 5 / Últimos 10
 */
export default function YearGroupSelector({ years = [], selectedYears = [], onChange = () => {}, latestHint = 5 }) {
  const [search, setSearch] = useState('')
  const [internal, setInternal] = useState(new Set(selectedYears))

  useEffect(() => { setInternal(new Set(selectedYears)) }, [selectedYears.join(',')])

  const decades = useMemo(() => {
    const y = [...years].filter(Boolean).sort((a,b) => a-b)
    const groups = new Map() // decade -> years[]
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
    if (next.has(y)) next.delete(y); else next.add(y)
    setInternal(next)
    onChange(Array.from(next).sort((a,b)=>a-b))
  }

  function toggleDecade(decade) {
    const ys = decades.find(d => d.decade === decade)?.years || []
    const next = new Set(internal)
    const allIn = ys.every(y => next.has(y))
    if (allIn) { ys.forEach(y => next.delete(y)) } else { ys.forEach(y => next.add(y)) }
    setInternal(next)
    onChange(Array.from(next).sort((a,b)=>a-b))
  }

  function setQuick(n) {
    // selecciona últimos n años disponibles
    const y = [...years].filter(Boolean).sort((a,b)=>a-b)
    const pick = y.slice(-n)
    const next = new Set(pick)
    setInternal(next)
    onChange(pick)
  }

  function setAll() {
    const y = [...years].filter(Boolean).sort((a,b)=>a-b)
    setInternal(new Set(y))
    onChange(y)
  }

  function clearAll() {
    setInternal(new Set())
    onChange([])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Años</span>
        <input
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          className="px-2 py-1.5 text-sm border rounded-md"
          placeholder="Buscar año…"
          aria-label="Buscar año"
        />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={setAll} className="px-2 py-1 text-xs border rounded-md bg-white hover:bg-gray-50">Todos</button>
          <button onClick={clearAll} className="px-2 py-1 text-xs border rounded-md bg-white hover:bg-gray-50">Ninguno</button>
          <button onClick={()=>setQuick(5)} className="px-2 py-1 text-xs border rounded-md bg-white hover:bg-gray-50">Últimos 5</button>
          <button onClick={()=>setQuick(10)} className="px-2 py-1 text-xs border rounded-md bg-white hover:bg-gray-50">Últimos 10</button>
        </div>
      </div>

      <div className="relative">
        {/* Scroll horizontal de tarjetas por década */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2" style={{scrollbarWidth:'thin'}}>
          {decades.map(({decade, years}) => {
            const allIn = years.every(y => internal.has(y))
            const someIn = !allIn && years.some(y => internal.has(y))
            return (
              <div key={decade} className="snap-start shrink-0 w-[520px] rounded-2xl border bg-white">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <div className="text-sm font-semibold">{decade}–{decade+9}</div>
                  <button
                    onClick={() => toggleDecade(decade)}
                    className={`px-2 py-1 text-xs rounded-md border ${allIn ? 'bg-indigo-600 text-white border-indigo-600' : someIn ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white hover:bg-gray-50'}`}
                  >
                    {allIn ? 'Quitar década' : someIn ? 'Completar década' : 'Seleccionar década'}
                  </button>
                </div>
                <div className="p-3 grid grid-cols-8 gap-2">
                  {years.map(y => (
                    <button
                      key={y}
                      onClick={() => toggleYear(y)}
                      className={`px-2 py-1 text-xs rounded-md border text-center ${internal.has(y) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50'}`}
                      aria-pressed={internal.has(y)}
                      title={String(y)}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
