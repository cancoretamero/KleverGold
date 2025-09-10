// 'use client';
// This component implements a news carousel for gold-related headlines.
// It fetches news from a Netlify function endpoint and supports optional AI assessment
// via WebLLM running in the browser. If WebGPU is unavailable or disabled via
// environment, it falls back to heuristic classification.

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight, Brain, Loader2, Bookmark, Copy, X } from 'lucide-react';

/**
 * GoldNewsCarousel — v5 (fix clipboard + imagen, IA avanzada)
 * -----------------------------------------------------------
 * - FIX: Clipboard API bloqueada → `safeCopyText()` con fallback `execCommand` y
 *   modal manual. Nunca lanza NotAllowedError.
 * - Imagen 16:9 centrada, sin cortes; el card de texto se eleva (-mt-6) y
 *   el contenedor del carrusel permite overflowY visible.
 * - Tarjeta inteligente con acciones: IA (heurística local), Copiar, Guardar,
 *   Silenciar fuente (persistente en localStorage).
 */
export default function GoldNewsCarousel({ endpoint = '/api/gold-news', title = 'headlines', className = '' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(endpoint, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const arrRaw = Array.isArray(j) ? j : (j.items || []);
        const arr = arrRaw.map(normalizeItem).filter(Boolean).filter((it) => !isMuted(it.source));
        if (mounted) setItems(arr.length ? arr : DEMO_ITEMS.filter((d) => !isMuted(d.source)));
      } catch (e) {
        if (mounted) { setError(String(e?.message || e)); setItems(DEMO_ITEMS.filter((d) => !isMuted(d.source))); }
      } finally { if (mounted) setLoading(false); }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [endpoint]);

  // Snap + indicador activo
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).map(e => ({ idx: Number(e.target.getAttribute('data-idx')), ratio: e.intersectionRatio })).sort((a,b)=>b.ratio-a.ratio);
      if (visible[0]) setActive(visible[0].idx);
    }, { root: el, threshold: [0.6,0.8,1] });
    el.querySelectorAll('[data-card]').forEach(c => io.observe(c));
    return () => io.disconnect();
  }, [items, loading]);

  const data = useMemo(() => items.slice(0, 12), [items]);
  function scrollByCards(dir = 1) { const el = wrapRef.current; if (!el) return; const card = el.querySelector('[data-card]'); const gap = 16; const w = card ? card.getBoundingClientRect().width : 340; el.scrollBy({ left: dir * (w + gap), behavior: 'smooth' }); }

  return (
    <section className={`relative rounded-2xl bg-[#f7f7f8] p-5 ${className}`}>
      {/* Cabecera tipo ejemplo */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-[2px] w-10 bg-gray-300" />
        <h3 className="font-serif text-2xl tracking-tight text-gray-900">{title}</h3>
      </div>

      <div className="relative">
        {/* Flechas */}
        <button aria-label="Anterior" onClick={() => scrollByCards(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow hover:bg-white hidden sm:flex">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button aria-label="Siguiente" onClick={() => scrollByCards(1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow hover:bg-white hidden sm:flex">
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Fades laterales */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#f7f7f8] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#f7f7f8] to-transparent" />

        {/* Carrusel con overflow vertical visible para no cortar la imagen */}
        <div ref={wrapRef} style={{ overflowY: 'visible' }} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-thin px-16">
          {(loading ? SKELETON_ITEMS : data).map((it, idx) => (
            loading ? (
              <CardSkeleton key={idx} />
            ) : (
              <SmartCard key={idx} data-idx={idx} item={it} />
            )
          ))}
        </div>
      </div>

      {/* Bullets */}
      {!loading && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {data.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-gray-800' : 'w-2 bg-gray-300'}`} />
          ))}
        </div>
      )}
    </section>
  );
}

// ----------------- Tarjeta inteligente con IA -----------------
function SmartCard({ item, 'data-idx': dataIdx }) {
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(isSaved(item.url));
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState('');
  const [showCopy, setShowCopy] = useState(false);
  const [copyText, setCopyText] = useState('');
  if (hidden) return null;

  function toggleSave() {
    const next = !saved; setSaved(next);
    try { const k='gold_news_saved_v5'; const arr = JSON.parse(localStorage.getItem(k)||'[]'); const s = new Set(arr); if(next) s.add(item.url); else s.delete(item.url); localStorage.setItem(k, JSON.stringify(Array.from(s))); } catch {}
    fireToast(next ? 'Guardado' : 'Eliminado de guardados');
  }

  function fireToast(msg){ setToast(msg); setTimeout(()=>setToast(''), 1600); }

  async function onCopy() {
    const payload = buildCopyPayload(item);
    setCopyText(payload);
    const ok = await safeCopyText(payload);
    if (!ok) setShowCopy(true); else fireToast('Copiado');
  }

  function mute() {
    try { const k='gold_news_muted_sources_v5'; const src=(item.source||'').toLowerCase(); const arr = JSON.parse(localStorage.getItem(k)||'[]'); const s=new Set(arr); s.add(src); localStorage.setItem(k, JSON.stringify(Array.from(s))); } catch {}
    setHidden(true);
  }

  async function analyze() {
    if (busy) return;
    setBusy(true);
    try {
      let res = null;
      // Feature flag (por si quieres apagar IA sin tocar código):
      const enableWebLLM = (import.meta.env?.VITE_ENABLE_WEBLLM ?? '1') === '1';
      if (enableWebLLM && 'gpu' in navigator) {
        const { assessWithWebLLM } = await import('../lib/webllm.js');
        res = await assessWithWebLLM(item.title, item.summary).catch(()=>null);
      }
      setAi(res || assessLocal(item));
      fireToast('Analizado');
    } finally { setBusy(false); }
  }

  const topics = ai?.topics || extractTopicsLocal((item.title + ' ' + (item.summary||'')).toLowerCase());

  return (
    <article data-card data-idx={dataIdx} className="group relative min-w-[320px] max-w-[360px] snap-center">
      {/* IMAGEN */}
      <Thumb src={item.image} alt={item.title} fallbackIndex={dataIdx} />

      {/* CARD DE TEXTO */}
      <div className="relative -mt-6 rounded-3xl bg-white border border-black/5 shadow-sm px-4 pt-4 pb-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] tracking-wide uppercase text-gray-500">
            <span className="text-indigo-600 font-semibold">Gold</span>
            <span className="mx-1">•</span>
            <span>{formatDate(item.publishedAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleSave} className="p-1.5 rounded-full border bg-white border-gray-200 hover:bg-gray-50" title={saved ? 'Guardado' : 'Guardar'}>
              <Bookmark className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCopy} className="p-1.5 rounded-full border bg-white border-gray-200 hover:bg-gray-50" title="Copiar">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <h4 className="text-[17px] leading-snug font-semibold text-gray-900 line-clamp-2 mb-2">{item.title}</h4>
        {item.summary && <p className="text-sm text-gray-600 line-clamp-2 mb-2">{item.summary}</p>}

        {/* Chips de IA si disponibles */}
        {ai && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Chip tone={sentimentTone(ai.sentiment)}>{labelSentiment(ai.sentiment)}</Chip>
            <Chip tone={impactTone(ai.impact)}>Impacto: {labelImpact(ai.impact)}</Chip>
            <span className="text-xs text-gray-500">Confianza {Math.round((ai.confidence ?? 0.5)*100)}%</span>
          </div>
        )}

        {/* Temas */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {topics.slice(0,5).map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[10px] text-gray-700">{t}</span>)}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="truncate max-w-[50%]">{item.source || hostFromUrl(item.url)}</span>
          <button onClick={analyze} className="ml-auto inline-flex items-center gap-1 rounded-full bg-black text-white px-2.5 py-1 hover:bg-gray-800">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />} IA
          </button>
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-gray-700">Leer <ExternalLink className="w-3.5 h-3.5" /></a>
          <button onClick={mute} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border hover:bg-gray-50">Silenciar</button>
        </div>
      </div>

      {/* Toast simple */}
      {toast && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full text-xs bg-black text-white px-2 py-1 rounded-md shadow">{toast}</div>
      )}

      {/* Modal de copia manual (fallback) */}
      {showCopy && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-sm font-medium">Copiar titular</div>
              <button onClick={() => setShowCopy(false)} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3">
              <textarea value={copyText} readOnly className="w-full h-40 p-2 border rounded-lg text-sm" onFocus={(e)=>e.currentTarget.select()} />
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">No se pudo acceder al portapapeles automático. Selecciona y copia manualmente.</div>
                <div className="flex items-center gap-2">
                  <button onClick={async()=>{ const ok = await safeCopyText(copyText); if(ok) setShowCopy(false); }} className="px-2 py-1 rounded-md border bg-black text-white text-xs">Intentar copiar</button>
                  <button onClick={()=>{ const el=document.querySelector('#copy-area'); if(el) el.select(); }} className="hidden" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ----------------- Imagen flotante con fallback -----------------
function Thumb({ src, alt, fallbackIndex = 0 }) {
  const [okSrc, setOkSrc] = useState(null);
  useEffect(() => {
    let alive = true; const candidate = src || '';
    if (candidate) {
      const img = new Image();
      img.onload = () => alive && setOkSrc(candidate);
      img.onerror = () => alive && setOkSrc(FALLBACKS[fallbackIndex % FALLBACKS.length]);
      img.referrerPolicy = 'no-referrer';
      img.src = candidate;
    } else {
      setOkSrc(FALLBACKS[fallbackIndex % FALLBACKS.length]);
    }
    return () => { alive = false; };
  }, [src, fallbackIndex]);

  return (
    <div className="relative px-2">
      {/* sombra elíptica bajo la imagen → efecto "levitar" */}
      <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg" />
      <div className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 shadow-lg group-hover:shadow-2xl transition-transform duration-500 group-hover:-translate-y-0.5">
        <div className="aspect-[16/9] w-full bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={okSrc || FALLBACKS[fallbackIndex % FALLBACKS.length]}
            alt={alt || 'thumbnail'}
            className="h-full w-full object-cover object-center"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}

// ----------------- Skeleton -----------------
function CardSkeleton() {
  return (
    <div className="min-w-[320px] max-w-[360px] snap-center">
      <div className="px-2">
        <div className="h-40 w-full bg-gray-200 rounded-3xl mb-3 animate-pulse" />
      </div>
      <div className="relative -mt-6 rounded-3xl bg-white border border-black/5 shadow-sm p-4 animate-pulse">
        <div className="h-3.5 bg-gray-200 rounded w-28 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-full mb-1" />
        <div className="h-3 bg-gray-200 rounded w-4/5" />
      </div>
    </div>
  );
}

// ----------------- Utils + Clipboard -----------------
function normalizeItem(it) {
  if (!it) return null;
  const t = (it.title || it.headline || '').toString().trim();
  const url = it.url || it.link || '';
  if (!t || !url) return null;
  const summary = (it.summary || it.reason || it.description || '').toString();
  const publishedAt = it.publishedAt || it.date || it.time || new Date().toISOString();
  const source = it.source || it.publisher || '';
  const image = it.image || it.thumbnail || it.banner || it.image_url || null;
  return { title: t, url, summary, publishedAt, source, image };
}

function formatDate(d) { try { const dt=new Date(d); return dt.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}).toUpperCase().replace(',',''); } catch { return '—'; } }
function hostFromUrl(u){ try{ return new URL(u, typeof window!=='undefined'?window.location.href:undefined).hostname.replace(/^www\./,''); } catch{ return ''; } }

function buildCopyPayload(item){ const NL='\n'; return `${item.title}${NL}${item.summary||''}${NL}${item.url}`.trim(); }

// Safe copy with fallbacks; returns boolean always
async function safeCopyText(text){
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text); // may throw NotAllowedError
      return true;
    }
  } catch (_) { /* ignore and try fallback */ }
  // Fallback: execCommand within user gesture
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.top='-1000px'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
}

function labelSentiment(s){ const v=(s||'').toLowerCase(); if(['bullish','alcista','positivo','alza'].includes(v)) return 'Alcista'; if(['bearish','bajista','negativo','baja'].includes(v)) return 'Bajista'; return 'Neutro'; }
function sentimentTone(s){ const v=(s||'').toLowerCase(); if(['bullish','alcista','positivo','alza'].includes(v)) return 'success'; if(['bearish','bajista','negativo','baja'].includes(v)) return 'danger'; return 'secondary'; }
function labelImpact(s){ const v=(s||'').toLowerCase(); if(['alto','high'].includes(v)) return 'Alto'; if(['medio','medium','moderado'].includes(v)) return 'Medio'; return 'Bajo'; }
function impactTone(s){ const v=(s||'').toLowerCase(); if(['alto','high'].includes(v)) return 'warning'; if(['medio','medium','moderado'].includes(v)) return 'accent'; return 'secondary'; }
function Chip({ tone='secondary', children }){ const base='px-2 py-0.5 rounded-full border text-[10px] font-medium'; const map={ success:'bg-emerald-50 border-emerald-200 text-emerald-700', danger:'bg-rose-50 border-rose-200 text-rose-700', warning:'bg-amber-50 border-amber-200 text-amber-700', accent:'bg-indigo-50 border-indigo-200 text-indigo-700', secondary:'bg-gray-50 border-gray-200 text-gray-700' }; return <span className={`${base} ${map[tone]||map.secondary}`}>{children}</span>; }

function extractTopicsLocal(text){ const t=(text||'').toLowerCase(); const out=[]; if(/fed|fomc|tasa/.test(t)) out.push('Fed'); if(/cpi|inflaci.+|ipc/.test(t)) out.push('Inflación'); if(/yield|rendim|real/.test(t)) out.push('Rendimientos'); if(/usd|dólar|dolar/.test(t)) out.push('USD'); if(/etf/.test(t)) out.push('ETF Flows'); if(/banco central|reserva|compras oficiales/.test(t)) out.push('Bancos Centrales'); if(/mina|mineri|huelga/.test(t)) out.push('Oferta Minera'); if(/china|india/.test(t)) out.push('Demanda Asia'); if(/guerra|conflicto|geopol/.test(t)) out.push('Geopolítica'); return out; }
function assessLocal(item){ const txt=(item.title+' '+(item.summary||'')).toLowerCase(); let sentiment='neutro', impact='medio'; if(/usd\s+(cae|debil|déb\u00EDl)|dólar\s+(cae|débil)/.test(txt)) sentiment='alcista'; if(/usd\s+(fuerte|sube|alza)|dólar\s+(fuerte|sube)/.test(txt)) sentiment='bajista'; if(/fed|fomc|cpi|ipc|rendim|yield|banco\s+central|etf/.test(txt)) impact='alto'; const reason='Heurístico: USD, rendimientos, Fed/CPI, ETF, bancos centrales.'; return { impact, sentiment, reason, confidence:0.45, topics: extractTopicsLocal(txt) }; }

// Mute helpers
function isMuted(source){ try{ const s=(source||'').toLowerCase(); const arr=JSON.parse(localStorage.getItem('gold_news_muted_sources_v5')||'[]'); return new Set(arr).has(s); }catch{return false;} }

const SKELETON_ITEMS = new Array(4).fill(null);

const FALLBACKS = [
  'https://images.unsplash.com/photo-1610375229736-6ccd73fd9c47?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1610375382125-1e131b6f2d87?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1603569283848-c6b0b4b2a941?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1607603750909-408e19386858?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop'
];

const DEMO_ITEMS = [
  { title: 'La Fed insinúa pausa; bajan rendimientos reales', url: '#', source: 'DemoWire', publishedAt: new Date().toISOString(), summary: 'Menor coste de oportunidad apoya al oro.', image: FALLBACKS[0] },
  { title: 'ETF de oro registran salidas moderadas', url: '#', source: 'DemoWire', publishedAt: new Date(Date.now()-3*3600*1000).toISOString(), summary: 'Si persiste, añade presión al spot.', image: FALLBACKS[1] },
  { title: 'Compras de bancos centrales sorprenden al alza', url: '#', source: 'DemoWire', publishedAt: new Date(Date.now()-6*3600*1000).toISOString(), summary: 'Demanda oficial da soporte estructural.', image: FALLBACKS[2] },
  { title: 'Dólar repunta tras NFP; pesa en metales', url: '#', source: 'DemoWire', publishedAt: new Date(Date.now()-10*3600*1000).toISOString(), summary: 'USD fuerte suele presionar XAUUSD.', image: FALLBACKS[3] },
];

// ----------------- Mini tests (dev-only) -----------------
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.groupCollapsed('[GoldNewsCarousel tests]');
  // buildCopyPayload
  const tmpItem = { title: 'T', summary: 'S', url: 'U' };
  console.assert(buildCopyPayload(tmpItem).includes('\nU'), 'buildCopyPayload format');
  // assessLocal polarity
  console.assert(assessLocal({ title:'USD cae', summary:'' }).sentiment === 'alcista', 'Bullish when USD weak');
  console.assert(assessLocal({ title:'USD sube', summary:'' }).sentiment === 'bajista', 'Bearish when USD strong');
  console.groupEnd();
}