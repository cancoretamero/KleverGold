'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight, Sparkles, RefreshCcw } from 'lucide-react';
import { scoreNewsItems } from '../utils/newsMoE.js';

/**
 * GoldNewsGlassCarousel — agregador premium con IA libre.
 * - Feed abierto vía Netlify Function con tolerancia a fallos.
 * - Escoring Mixture-of-Experts local con @xenova/transformers.
 * - Carrusel glassmorphism con sombras individuales y scroll-snap.
 * - Imágenes robustas (preload + skeleton + fallbacks temáticos) sin barra visible.
 */
export default function GoldNewsGlassCarousel({ items, initialIndex = 1 }) {
  const [news, setNews] = useState(items ?? []);
  const [status, setStatus] = useState(items?.length ? 'ready' : 'idle');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState([]);
  const wrapRef = useRef(null);
  const firstLoad = useRef(false);
  const [active, setActive] = useState(initialIndex);

  const displayItems = useMemo(() => {
    if (items && items.length) return items;
    return news;
  }, [items, news]);

  const hasData = displayItems.length > 0;
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isEmpty = status === 'empty';

  const fetchNews = useCallback(async () => {
    setStatus('loading');
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/news-feed', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (!payload?.ok || !Array.isArray(payload.items)) throw new Error('Respuesta inválida del feed');
      const scored = await scoreNewsItems(payload.items);
      setNews(scored);
      setFailures(Array.isArray(payload.failures) ? payload.failures : []);
      setStatus(scored.length ? 'ready' : 'empty');
      setActive(scored.length > initialIndex ? initialIndex : 0);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el feed.');
      setNews([]);
      setFailures([]);
      setStatus('error');
      setActive(0);
    } finally {
      setRefreshing(false);
    }
  }, [initialIndex]);

  useEffect(() => {
    if (items && items.length) {
      setStatus('ready');
      setNews(items);
      setFailures([]);
      return;
    }
    if (!firstLoad.current) {
      firstLoad.current = true;
      fetchNews();
    }
  }, [items, fetchNews]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !hasData) return;
    const handle = requestAnimationFrame(() => {
      const card = el.querySelector('[data-card]');
      if (!card) return;
      const gap = 24;
      const width = card.getBoundingClientRect().width;
      const idx = initialIndex < displayItems.length ? initialIndex : 0;
      const left = Math.max(0, idx * (width + gap) - (el.clientWidth - width) / 2);
      el.scrollLeft = left;
      setActive(idx);
    });
    return () => cancelAnimationFrame(handle);
  }, [displayItems, hasData, initialIndex]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !hasData) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => ({
          idx: Number(entry.target.getAttribute('data-idx')),
          ratio: entry.intersectionRatio,
        }))
        .sort((a, b) => b.ratio - a.ratio);
      if (vis[0]) setActive(vis[0].idx);
    }, { root: el, threshold: [0.55, 0.75, 0.95] });
    el.querySelectorAll('[data-card]').forEach((card) => io.observe(card));
    return () => io.disconnect();
  }, [displayItems, hasData]);

  const scrollByCards = useCallback((dir = 1) => {
    const el = wrapRef.current;
    if (!el) return;
    const card = el.querySelector('[data-card]');
    const gap = 24;
    const width = card ? card.getBoundingClientRect().width : 340;
    el.scrollBy({ left: dir * (width + gap), behavior: 'smooth' });
  }, []);

  const cardsToRender = !hasData && isLoading ? Array.from({ length: 5 }, (_, i) => ({ __skeleton: true, id: `skeleton-${i}` })) : displayItems;

  return (
    <section className="relative rounded-3xl border border-black/5 bg-white p-4">
      <style>{`
        .news-scroll { -ms-overflow-style: none; scrollbar-width: none; overflow-y: visible; }
        .news-scroll::-webkit-scrollbar { display: none; height: 0; background: transparent; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4" /></div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Últimas que mueven el oro</h3>
            <p className="text-xs text-gray-500">IA 100% libre · Xenova all-MiniLM-L6-v2</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {refreshing && <span className="text-indigo-600">Actualizando…</span>}
          <button
            type="button"
            onClick={fetchNews}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-black/20 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Recargar
          </button>
        </div>
      </div>

      {failures.length > 0 && (
        <div className="mb-3 text-xs text-amber-600">
          Fuentes con incidencias: {failures.map((f) => f.source).join(', ')}.
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700">
          <p className="mb-3 font-medium">No pudimos actualizar el feed abierto.</p>
          <p className="mb-4 text-rose-600">{error}</p>
          <button
            type="button"
            onClick={fetchNews}
            className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-4 py-2 text-white shadow hover:bg-rose-500"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isError && (
        <div className="relative">
          <button
            aria-label="Anterior"
            onClick={() => scrollByCards(-1)}
            className="hidden sm:flex absolute left-[-18px] top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/95 ring-1 ring-black/5 shadow hover:bg-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            aria-label="Siguiente"
            onClick={() => scrollByCards(1)}
            className="hidden sm:flex absolute right-[-18px] top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/95 ring-1 ring-black/5 shadow hover:bg-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-white to-transparent" />

          <div ref={wrapRef} className="news-scroll flex gap-6 overflow-x-auto snap-x snap-mandatory pb-8 px-16">
            {cardsToRender.length === 0 && !isLoading && (
              <div className="min-h-[200px] flex items-center justify-center text-sm text-gray-500">
                Sin titulares recientes. Intenta recargar en unos minutos.
              </div>
            )}
            {cardsToRender.map((it, idx) => (
              it.__skeleton ? (
                <SkeletonCard key={it.id} />
              ) : (
                <article key={it.id || idx} data-card data-idx={idx} className="group min-w-[320px] max-w-[360px] snap-center">
                  <div className="relative px-2">
                    <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg transition group-hover:blur-xl" />
                    <div className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.12)] transition-all duration-300">
                      <Thumb src={it.image} alt={it.title} idx={idx} />
                    </div>
                  </div>

                  <div className="relative -mt-6 rounded-3xl border border-white/20 bg-white/60 backdrop-blur-xl px-4 pt-4 pb-5 shadow-[0_10px_22px_rgba(0,0,0,0.08)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_38px_rgba(0,0,0,0.14)]">
                    <header className="mb-2 flex items-center justify-between text-[11px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-indigo-600">{it.source}</span>
                        <span>•</span>
                        <span>{it.publishedAt}</span>
                      </div>
                      {it.link && (
                        <a
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800"
                        >
                          Leer <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </header>

                    <h4 className="mb-2 text-[17px] font-semibold leading-snug text-gray-900 line-clamp-2">{it.title}</h4>
                    <p className="mb-3 text-sm text-gray-700 line-clamp-3">{it.reason}</p>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <Badge tone={toneBySent(it.sentiment)}>{labelSent(it.sentiment)}</Badge>
                      <Badge tone={toneByImpact(it.impact)}>Impacto: {labelImpact(it.impact)}</Badge>
                      <Badge tone="secondary">Sesgo: {it.bias}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Meter label="Relevancia" value={it.relevance} />
                      <Meter label="Confianza" value={it.confidence} />
                    </div>
                  </div>
                </article>
              )
            ))}
          </div>
        </div>
      )}

      {!isError && hasData && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {displayItems.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-gray-800' : 'w-2 bg-gray-300'}`}
            />
          ))}
        </div>
      )}

      {isEmpty && !isLoading && (
        <div className="mt-4 text-center text-xs text-gray-500">El agregador no encontró titulares únicos en las últimas horas.</div>
      )}
    </section>
  );
}

function SkeletonCard() {
  return (
    <article className="min-w-[320px] max-w-[360px] snap-center">
      <div className="relative px-2">
        <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg" />
        <div className="relative h-44 w-full overflow-hidden rounded-3xl bg-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200" />
        </div>
      </div>
      <div className="relative -mt-6 rounded-3xl border border-white/30 bg-white/60 px-4 pt-4 pb-5 shadow-[0_10px_22px_rgba(0,0,0,0.08)]">
        <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-16 rounded-full bg-gray-200" />
            <span className="inline-block h-3 w-2 rounded-full bg-gray-200" />
            <span className="inline-block h-3 w-12 rounded-full bg-gray-200" />
          </div>
          <span className="inline-block h-3 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="mb-3 space-y-2">
          <div className="h-4 w-11/12 rounded-full bg-gray-200" />
          <div className="h-4 w-4/5 rounded-full bg-gray-200" />
        </div>
        <div className="mb-3 space-y-2">
          <div className="h-3 w-full rounded-full bg-gray-100" />
          <div className="h-3 w-5/6 rounded-full bg-gray-100" />
          <div className="h-3 w-2/3 rounded-full bg-gray-100" />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="h-5 w-16 rounded-full bg-gray-100" />
          <span className="h-5 w-20 rounded-full bg-gray-100" />
          <span className="h-5 w-20 rounded-full bg-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="h-3 w-full rounded-full bg-gray-100" />
            <div className="h-2 rounded-full bg-gray-200" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded-full bg-gray-100" />
            <div className="h-2 rounded-full bg-gray-200" />
          </div>
        </div>
      </div>
    </article>
  );
}

/* =============== Thumbnail robusto (preload + skeleton + fallback) =============== */
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

/* Fallbacks visualmente coherentes y de alta disponibilidad */
const FALLBACKS = [
  // Fed / tipos / macro
  'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop',
  // ETF / mercados
  'https://images.unsplash.com/photo-1593672715438-d88a70629abe?q=80&w=1600&auto=format&fit=crop',
  // USD / dólar fuerte
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1600&auto=format&fit=crop',
  // Bancos centrales / lingotes
  'https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1600&auto=format&fit=crop',
  // Minería / oferta
  'https://images.unsplash.com/photo-1566943956303-74261c0f3760?q=80&w=1600&auto=format&fit=crop'
];

