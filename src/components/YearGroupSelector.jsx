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
 
      {/* Barra superior compacta */}
 
 
 Años
 
 setSearch(e.target.value)}
           className="px-2 py-1.5 text-sm border rounded-md"
           placeholder="Buscar año…"
         />
 
 {totalSel} seleccionados 
 
 Todos 
 Ninguno 
 setQuick(5)} className="px-2 py-1 text-xs rounded-full">Últimos 5 
 setQuick(10)} className="px-2 py-1 text-xs rounded-full">Últimos 10 
 
 
 
 
       {/* Tarjetas de década compactas */}
 
         {decades.map(({decade, years}) => {
           const allIn = years.every(y => internal.has(y))
           const someIn = !allIn && years.some(y => internal.has(y))
           return (
 
 
 {decade}–{decade+9} 
 toggleDecade(decade)}
                   className={`px-2 py-1 text-[11px] rounded-md border flex items-center gap-1 ${
                     allIn
                       ? 'bg-indigo-600 text-white border-indigo-600'
                       : someIn
                       ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                       : 'bg-white border-indigo-600'
                   }`}
                 >
 {allIn ? 'Quitar' : someIn ? 'Completar' : 'Seleccionar'}
                 
 
 
                 {years.map(y => (
 toggleYear(y)}
                     className={`px-2 py-1 text-[11px] rounded-md border text-center transition ${
                       internal.has(y)
                         ? 'bg-indigo-600 text-white border-indigo-600'
                         : 'bg-white border-indigo-600'
                     }`}
                   >
                     {y}
                   
                 ))}
 
 
           )
         })}
 
     
   )
}
