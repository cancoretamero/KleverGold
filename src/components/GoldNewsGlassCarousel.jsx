'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

/**
 * GoldNewsGlassCarousel — v1.2
 * - Scrollbar oculto (sin deslizador gris)
 * - Sombra sutil por tarjeta (levita)
 * - Posición inicial fija (por defecto 2ª tarjeta centrada)
 * - Imágenes robustas (preload + skeleton + fallbacks)
 * - Demo estética (datos falsos)
 */
export default function GoldNewsGlassCarousel({ items, initialIndex = 1 }) {
  const data = useMemo(() => (items && items.length ? items : FAKE_NEWS), [items]);
  const wrapRef = useRef(null);
  const [active, setActive] = useState(initialIndex);

  // Centrar tarjeta inicial
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const card = el.querySelector('[data-card]');
    if (!card) return;
    const gap = 16;
    const w = card.getBoundingClientRect().width;
    const left = Math.max(0, initialIndex * (w + gap) - (el.clientWidth - w) / 2);
    el.scrollLeft = left; // instant
    setActive(initialIndex);
  }, [data, initialIndex]);

  // Track tarjeta visible
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries
        .filter(e => e.isIntersecting)
        .map(e => ({ idx: Number(e.target.getAttribute('data-idx')), ratio: e.intersectionRatio }))
        .sort((a, b) => b.ratio - a.ratio);
      if (vis[0]) setActive(vis[0].idx);
    }, { root: el, threshold: [0.6, 0.8, 1] });
    el.querySelectorAll('[data-card]').forEach(c => io.observe(c));
    return () => io.disconnect();
  }, [data]);

  function scrollByCards(dir = 1) {
    const el = wrapRef.current; if (!el) return;
    const card = el.querySelector('[data-card]'); const gap = 16;
    const w = card ? card.getBoundingClientRect().width : 340;
    el.scrollBy({ left: dir * (w + gap), behavior: 'smooth' });
  }

  return (
    <section className="relative rounded-3xl border border-black/5 bg-white p-4">
      {/* Oculta scrollbar para todos los navegadores */}
      <style>{`
        .news-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .news-scroll::-webkit-scrollbar { display: none; height: 0; background: transparent; }
      `}</style>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4" /></div>
          <h3 className="text-lg font-semibold tracking-tight">Titulares que mueven el oro</h3>
        </div>
        <div className="text-xs text-gray-500">Demo estética (datos falsos)</div>
      </div>

      <div className="relative">
        {/* Flechas */}
        <button
          aria-label="Anterior"
          onClick={() => scrollByCards(-1)}
          className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 ring-1 ring-black/5 shadow hover:bg-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          aria-label="Siguiente"
          onClick={() => scrollByCards(1)}
          className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 ring-1 ring-black/5 shadow hover:bg-white"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Fades laterales suaves */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent" />

        {/* Contenedor: oculta scrollbar (clase news-scroll) */}
        <div ref={wrapRef} className="news-scroll flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 px-16">
          {data.map((it, idx) => (
            <article key={idx} data-card data-idx={idx} className="group min-w-[320px] max-w-[360px] snap-center">
              {/* Imagen flotante */}
              <div className="relative px-2">
                <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg" />
                <div className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.10)] transition-shadow duration-300">
                  <Thumb src={it.image} alt={it.title} idx={idx} />
                </div>
              </div>

              {/* Tarjeta glass sutil */}
              <div className="relative -mt-6 rounded-3xl border border-white/20 bg-white/40 backdrop-blur-md shadow-[0_8px_20px_rgba(0,0,0,0.08)] px-4 pt-4 pb-5">
                <header className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-indigo-600">{it.source}</span>
                    <span>•</span>
                    <span>{it.publishedAt}</span>
                  </div>
                  <a href="#" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800">
                    Leer <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </header>

                <h4 className="text-[17px] leading-snug font-semibold text-gray-900 line-clamp-2 mb-2">{it.title}</h4>
                <p className="text-sm text-gray-700 line-clamp-3 mb-3">{it.reason}</p>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge tone={toneBySent(it.sentiment)}>{labelSent(it.sentiment)}</Badge>
                  <Badge tone={toneByImpact(it.impact)}>Impacto: {labelImpact(it.impact)}</Badge>
                  <Badge tone="secondary">Sesgo: {it.bias}</Badge>
                </div>

                {/* Barras de relevancia/confianza */}
                <div className="grid grid-cols-2 gap-3">
                  <Meter label="Relevancia" value={it.relevance} />
                  <Meter label="Confianza" value={it.confidence} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Bullets */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {data.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-gray-800' : 'w-2 bg-gray-300'}`} />
        ))}
      </div>
    </section>
  );
}

/* =============== Thumbnail robusto (preload + fallback) =============== */
function Thumb({ src, alt, idx = 0 }) {
  const [okSrc, setOkSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const candidate = src || '';
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { if (alive) { setOkSrc(candidate); setLoading(false); } };
    img.onerror = () => { if (alive) { setOkSrc(FALLBACKS[idx % FALLBACKS.length]); setLoading(false); } };
    if (candidate) img.src = candidate; else { setOkSrc(FALLBACKS[idx % FALLBACKS.length]); setLoading(false); }
    return () => { alive = false; };
  }, [src, idx]);

  return (
    <div className="aspect-[16/9] w-full bg-gray-100 relative">
      {loading && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={okSrc || FALLBACKS[idx % FALLBACKS.length]}
        alt={alt || 'thumbnail'}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoading(false)}
        onError={() => { setOkSrc(FALLBACKS[(idx + 1) % FALLBACKS.length]); setLoading(false); }}
      />
    </div>
  );
}

/* =================== Subcomponentes =================== */
function Badge({ tone='secondary', children }) {
  const map = {
    success:'bg-emerald-50 border-emerald-200 text-emerald-700',
    danger:'bg-rose-50 border-rose-200 text-rose-700',
    warning:'bg-amber-50 border-amber-200 text-amber-700',
    accent:'bg-indigo-50 border-indigo-200 text-indigo-700',
    secondary:'bg-gray-50 border-gray-200 text-gray-700'
  };
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${map[tone] || map.secondary}`}>{children}</span>;
}
function Meter({ label, value }) {
  const pct = Math.round((Number(value) || 0)*100);
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-1"><span className="text-gray-600">{label}</span><span className="font-semibold">{pct}%</span></div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* =================== Utils & Fallbacks =================== */
function labelSent(s){ const v=(s||'').toLowerCase(); if(['alcista','bullish'].includes(v)) return 'Alcista'; if(['bajista','bearish'].includes(v)) return 'Bajista'; return 'Neutro'; }
function toneBySent(s){ const v=(s||'').toLowerCase(); if(['alcista','bullish'].includes(v)) return 'success'; if(['bajista','bearish'].includes(v)) return 'danger'; return 'secondary'; }
function labelImpact(s){ const v=(s||'').toLowerCase(); if(v==='alto'||v==='high') return 'Alto'; if(v==='medio'||v==='medium') return 'Medio'; return 'Bajo'; }
function toneByImpact(s){ const v=(s||'').toLowerCase(); if(v==='alto'||v==='high') return 'warning'; if(v==='medio'||v==='medium') return 'accent'; return 'secondary'; }

const FALLBACKS = [
  'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1610375382125-1e131b6f2d87?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1603569283848-c6b0b4b2a941?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1607603750909-408e19386858?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=1600&auto=format&fit=crop'
];

/* =================== Datos falsos (demo) =================== */
const FAKE_NEWS = [
  { title:'La Fed sugiere pausa larga; rendimientos reales ceden', source:'DemoWire', publishedAt:'2025-09-11', sentiment:'alcista', impact:'alto', bias:'bajo', relevance:0.86, confidence:0.72, reason:'Menor coste de oportunidad favorece al oro; la renta fija pierde atractivo relativo.', image:FALLBACKS[0] },
  { title:'ETF de oro registran entradas por tercer día consecutivo', source:'DemoWire', publishedAt:'2025-09-10', sentiment:'alcista', impact:'medio', bias:'bajo', relevance:0.74, confidence:0.65, reason:'Flujos positivos suelen apoyar el precio si se mantienen.', image:FALLBACKS[1] },
  { title:'Dólar repunta tras sorpresas en empleo', source:'DemoWire', publishedAt:'2025-09-09', sentiment:'bajista', impact:'medio', bias:'medio', relevance:0.68, confidence:0.6, reason:'Un USD más fuerte suele presionar a XAUUSD en el corto plazo.', image:FALLBACKS[2] },
  { title:'Compras oficiales de oro superan expectativas', source:'DemoWire', publishedAt:'2025-09-08', sentiment:'alcista', impact:'alto', bias:'bajo', relevance:0.81, confidence:0.7, reason:'Demanda de bancos centrales añade soporte estructural.', image:FALLBACKS[3] },
  { title:'Inventarios mineros: caída temporal por huelga', source:'DemoWire', publishedAt:'2025-09-07', sentiment:'alcista', impact:'medio', bias:'medio', relevance:0.62, confidence:0.55, reason:'Riesgo de oferta puede tensar el mercado spot si se prolonga.', image:FALLBACKS[4] }
];
