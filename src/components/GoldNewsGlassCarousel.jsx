'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight, Sparkles, Brain, TrendingUp } from 'lucide-react';

/**
 * GoldNewsGlassCarousel — v1 (demo estética)
 * ---------------------------------------------------------
 * - Carrusel horizontal con efecto "liquid glass"
 * - Tarjetas flotantes con: sesgo, relevancia, impacto, sentimiento, razón breve
 * - Datos falsos (FAKE_NEWS) para previsualizar diseño
 * - Scroll-snap + flechas + bullets
 */

export default function GoldNewsGlassCarousel({ items }) {
  const data = useMemo(() => (items && items.length ? items : FAKE_NEWS), [items]);
  const wrapRef = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e=>e.isIntersecting)
        .map(e=>({ idx: Number(e.target.getAttribute('data-idx')), ratio: e.intersectionRatio }))
        .sort((a,b)=> b.ratio - a.ratio);
      if (vis[0]) setActive(vis[0].idx);
    }, { root: el, threshold: [0.6,0.8,1] });
    el.querySelectorAll('[data-card]').forEach(c => io.observe(c));
    return () => io.disconnect();
  }, [data]);

  function scrollByCards(dir=1) {
    const el = wrapRef.current; if (!el) return;
    const card = el.querySelector('[data-card]'); const gap=16;
    const w = card ? card.getBoundingClientRect().width : 340;
    el.scrollBy({ left: dir*(w+gap), behavior: 'smooth' });
  }

  return (
    <section className="relative rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4" /></div>
          <h3 className="text-lg font-semibold tracking-tight">Titulares que mueven el oro</h3>
        </div>
        <div className="text-xs text-gray-500">Demo estética (datos falsos)</div>
      </div>

      <div className="relative">
        {/* Flechas */}
        <button aria-label="Anterior" onClick={()=>scrollByCards(-1)}
          className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow hover:bg-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button aria-label="Siguiente" onClick={()=>scrollByCards(1)}
          className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow hover:bg-white">
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Fades lados */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent" />

        <div ref={wrapRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 px-16">
          {data.map((it, idx) => (
            <article key={idx} data-card data-idx={idx}
              className="group min-w-[320px] max-w-[360px] snap-center">
              {/* Imagen flotante */}
              <div className="relative px-2">
                <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg" />
                <div className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-lg group-hover:shadow-2xl transition-transform duration-500 group-hover:-translate-y-0.5">
                  <div className="aspect-[16/9] w-full bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image} alt="" className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>

              {/* Tarjeta glass */}
              <div className="relative -mt-6 rounded-3xl border border-white/30 bg-white/10 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] px-4 pt-4 pb-5">
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
                  <Meter label="Confianza"  value={it.confidence} />
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

/* =================== Utils =================== */
function labelSent(s){ const v=(s||'').toLowerCase(); if(['alcista','bullish'].includes(v)) return 'Alcista'; if(['bajista','bearish'].includes(v)) return 'Bajista'; return 'Neutro'; }
function toneBySent(s){ const v=(s||'').toLowerCase(); if(['alcista','bullish'].includes(v)) return 'success'; if(['bajista','bearish'].includes(v)) return 'danger'; return 'secondary'; }
function labelImpact(s){ const v=(s||'').toLowerCase(); if(v==='alto'||v==='high') return 'Alto'; if(v==='medio'||v==='medium') return 'Medio'; return 'Bajo'; }
function toneByImpact(s){ const v=(s||'').toLowerCase(); if(v==='alto'||v==='high') return 'warning'; if(v==='medio'||v==='medium') return 'accent'; return 'secondary'; }

/* =================== Datos falsos (demo) =================== */
const FAKE_NEWS = [
  {
    title: 'La Fed sugiere pausa larga; rendimientos reales ceden',
    source: 'DemoWire', publishedAt: '2025-09-11',
    sentiment: 'alcista', impact: 'alto', bias: 'bajo',
    relevance: 0.86, confidence: 0.72,
    reason: 'Menor coste de oportunidad favorece al oro; la renta fija pierde atractivo relativo.',
    image: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop'
  },
  {
    title: 'ETF de oro registran entradas por tercer día consecutivo',
    source: 'DemoWire', publishedAt: '2025-09-10',
    sentiment: 'alcista', impact: 'medio', bias: 'bajo',
    relevance: 0.74, confidence: 0.65,
    reason: 'Flujos positivos suelen apoyar el precio si se mantienen.',
    image: 'https://images.unsplash.com/photo-1610375382125-1e131b6f2d87?q=80&w=1600&auto=format&fit=crop'
  },
  {
    title: 'Dólar repunta tras sorpresas en empleo',
    source: 'DemoWire', publishedAt: '2025-09-09',
    sentiment: 'bajista', impact: 'medio', bias: 'medio',
    relevance: 0.68, confidence: 0.6,
    reason: 'Un USD más fuerte suele presionar a XAUUSD en el corto plazo.',
    image: 'https://images.unsplash.com/photo-1603569283848-c6b0b4b2a941?q=80&w=1600&auto=format&fit=crop'
  },
  {
    title: 'Compras oficiales de oro superan expectativas',
    source: 'DemoWire', publishedAt: '2025-09-08',
    sentiment: 'alcista', impact: 'alto', bias: 'bajo',
    relevance: 0.81, confidence: 0.7,
    reason: 'Demanda de bancos centrales añade soporte estructural.',
    image: 'https://images.unsplash.com/photo-1607603750909-408e19386858?q=80&w=1600&auto=format&fit=crop'
  },
  {
    title: 'Inventarios mineros: caída temporal por huelga',
    source: 'DemoWire', publishedAt: '2025-09-07',
    sentiment: 'alcista', impact: 'medio', bias: 'medio',
    relevance: 0.62, confidence: 0.55,
    reason: 'Riesgo de oferta puede tensar el mercado spot si se prolonga.',
    image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=1600&auto=format&fit=crop'
  }
];
