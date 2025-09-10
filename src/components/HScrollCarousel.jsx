import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * HScrollCarousel
 * - Carrusel horizontal con scroll nativo + botones
 * - Usa scroll-snap para alinear tarjetas
 */
export default function HScrollCarousel({ children, itemWidth = 320, itemGap = 12, ariaLabel = 'Carrusel' }) {
  const ref = useRef(null)
  function scrollByDir(dir=1) {
    const el = ref.current
    if (!el) return
    const delta = (itemWidth + itemGap) * Math.max(1, Math.floor(el.clientWidth / (itemWidth + itemGap)))
    el.scrollBy({ left: dir * delta, behavior: 'smooth' })
  }
  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex overflow-x-auto gap-3 scroll-smooth snap-x snap-mandatory pb-2"
        style={{scrollbarWidth:'thin'}}
        aria-label={ariaLabel}
      >
        {React.Children.map(children, (child, i) => (
          <div className="snap-start shrink-0" style={{ width: itemWidth }}>
            {child}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-1">
        <button
          type="button"
          onClick={() => scrollByDir(-1)}
          className="pointer-events-auto rounded-full border bg-white p-2 shadow-sm"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
        <button
          type="button"
          onClick={() => scrollByDir(1)}
          className="pointer-events-auto rounded-full border bg-white p-2 shadow-sm"
          aria-label="Siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
