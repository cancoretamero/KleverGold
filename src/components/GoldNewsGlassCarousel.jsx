'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCcw,
  Info,
  TrendingUp,
  Gauge,
  Clock,
  X,
  Filter,
  BarChart3,
  Search,
} from 'lucide-react';
import { scoreNewsItems } from '../utils/newsMoE.js';
import { summarize } from '../utils/newsSummarizer.js';
import { classifyBias } from '../utils/newsBias.js';
import { classifySentiment, resolveSentiment } from '../utils/finSentiment.js';

const CACHE_KEY = 'klever_orion_v2_news_cache';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CIRCUIT_BREAK_MS = 60 * 1000;
const MAX_RETRIES = 2;
const FETCH_TIMEOUT_MS = 14_000;
const SENTIMENT_FILTERS = ['all', 'bullish', 'neutral', 'bearish'];
const BIAS_FILTERS = ['all', 'liberal', 'conservative', 'center', 'pro-market', 'anti-market'];
const SORT_OPTIONS = [
  { id: 'relevance', label: 'Ordenar por relevancia' },
  { id: 'date', label: 'Ordenar por fecha' },
];
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1593672715438-d88a70629abe?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1566943956303-74261c0f3760?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1530172991371-4b50ab9746c7?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1579722821273-0fdd166a8c8b?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1580657018950-4480b9360c7e?q=80&w=1600&auto=format&fit=crop',
];
const EXPERT_ORDER = ['macro', 'etf', 'usd', 'cb'];
const EXPERT_COLORS = {
  macro: '#6366F1',
  etf: '#22C55E',
  usd: '#0EA5E9',
  cb: '#F97316',
  mix: '#94A3B8',
};
const CANONICAL_SOURCE_LABELS = {
  newsapi: 'NewsAPI',
  'open-feed': 'Feed abierto',
  'open feed': 'Feed abierto',
  'u.s. treasury': 'U.S. Treasury',
  'us treasury': 'U.S. Treasury',
};

export default function GoldNewsGlassCarousel({ items, initialIndex = 0 }) {
  const [news, setNews] = useState(items ?? []);
  const [status, setStatus] = useState(items?.length ? 'ready' : 'idle');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState([]);
  const [trend, setTrend] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ sentiment: 'all', bias: 'all' });
  const [sortBy, setSortBy] = useState('relevance');
  const [searchTerm, setSearchTerm] = useState('');
  const [active, setActive] = useState(initialIndex);

  const wrapRef = useRef(null);
  const activeRef = useRef(initialIndex);
  const pipelineRef = useRef({ promise: null, controller: null, failureCount: 0, openUntil: 0 });
  const cacheRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const firstLoad = useRef(false);
  const scrollReleaseRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const programmaticScrollRef = useRef(false);
  const debouncedSearch = useDebouncedValue(searchTerm, 240);

  const hasData = news.length > 0;
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isEmpty = status === 'empty';

  const filteredItems = useMemo(() => {
    if (!news.length) return [];
    const sentimentFilter = filters.sentiment;
    const biasFilter = filters.bias;
    const term = debouncedSearch.trim().toLowerCase();

    const filtered = news.filter((item) => {
      if (sentimentFilter !== 'all' && item.sentiment !== sentimentFilter) return false;
      if (biasFilter !== 'all' && item.biasLabel !== biasFilter) return false;
      if (term) {
        const haystack = `${item.title} ${item.executiveBrief} ${item.source} ${item.sourceDomain}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    const sorted = filtered
      .slice()
      .sort((a, b) => {
        if (sortBy === 'date') {
          const byDate = (b.publishedAtMs || 0) - (a.publishedAtMs || 0);
          if (byDate !== 0) return byDate;
          const byRelevance = (b.relevance || 0) - (a.relevance || 0);
          if (byRelevance !== 0) return byRelevance;
        } else {
          const byRelevance = (b.relevance || 0) - (a.relevance || 0);
          if (byRelevance !== 0) return byRelevance;
          const byDate = (b.publishedAtMs || 0) - (a.publishedAtMs || 0);
          if (byDate !== 0) return byDate;
        }
        return a.id.localeCompare(b.id);
      });

    return sorted;
  }, [news, filters, debouncedSearch, sortBy]);

  const cardsToRender = isLoading && !hasData
    ? Array.from({ length: 6 }, (_, index) => ({ __skeleton: true, id: `skeleton-${index}` }))
    : filteredItems;

  const failureSources = useMemo(() => {
    if (!failures.length) return [];
    const seen = new Set();
    const list = [];
    for (const entry of failures) {
      const rawName = sanitizeText(entry?.name || entry?.source);
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(prettySourceLabel(rawName));
    }
    return list;
  }, [failures]);

  const loadFromCache = useCallback(() => {
    if (cacheRef.current) return cacheRef.current;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.expiresAt < Date.now()) return null;
      cacheRef.current = parsed;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const writeCache = useCallback((payload) => {
    cacheRef.current = payload;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, []);

  const fetchNews = useCallback(async () => {
    if (items && items.length) return;
    const now = Date.now();
    if (pipelineRef.current.openUntil > now) {
      setStatus('error');
      setError('Circuito temporalmente abierto por fallos consecutivos. Intenta más tarde.');
      return;
    }

    if (pipelineRef.current.promise) {
      return pipelineRef.current.promise;
    }

    const controller = new AbortController();
    pipelineRef.current.controller?.abort();
    pipelineRef.current.controller = controller;
    setStatus('loading');
    setRefreshing(true);
    setError('');

    const task = (async () => {
      try {
        const base = await fetchAndAggregate(controller.signal);
        const enriched = await orchestrateEnrichment(base.items, controller.signal, imageCacheRef.current);
        const { clusters, trend: newTrend } = postProcessNews(enriched);

        if (controller.signal.aborted) return;

        if (clusters.length === 0) {
          setNews([]);
          setTrend(newTrend);
          setFailures(base.failures);
          setStatus('empty');
          setActive(0);
          writeCache({ items: [], failures: base.failures, trend: newTrend, expiresAt: Date.now() + CACHE_TTL_MS });
          return;
        }

        const prepared = hydrateInitialItems(clusters);
        setNews(prepared);
        setTrend(newTrend ?? computeTrend(prepared));
        setFailures(base.failures);
        setStatus('ready');
        setActive((prev) => (prev < prepared.length ? prev : 0));
        writeCache({ items: prepared, failures: base.failures, trend: newTrend, expiresAt: Date.now() + CACHE_TTL_MS });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err?.message || 'No se pudo cargar el feed';
        setError(message);
        setStatus('error');
        setNews([]);
        setTrend(null);
        setFailures([]);
        pipelineRef.current.failureCount += 1;
        if (pipelineRef.current.failureCount >= 3) {
          pipelineRef.current.openUntil = Date.now() + CIRCUIT_BREAK_MS;
        }
      } finally {
        setRefreshing(false);
        pipelineRef.current.controller = null;
        pipelineRef.current.promise = null;
      }
    })();

    pipelineRef.current.promise = task;
    return task;
  }, [items, writeCache]);

  useEffect(() => {
    if (items && items.length) {
      const prepared = hydrateInitialItems(items);
      setStatus('ready');
      setNews(prepared);
      setFailures([]);
      setTrend(computeTrend(prepared));
      return;
    }

    if (!firstLoad.current) {
      firstLoad.current = true;
      const cached = loadFromCache();
      if (cached?.items?.length) {
        const prepared = hydrateInitialItems(cached.items);
        setNews(prepared);
        setTrend(cached.trend ?? computeTrend(prepared));
        setFailures(cached.failures ?? []);
        setStatus('ready');
        setTimeout(() => { fetchNews(); }, 200);
      } else {
        fetchNews();
      }
    }
  }, [items, fetchNews, loadFromCache]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const focusCard = useCallback(
    (index, { smooth = true } = {}) => {
      if (typeof window === 'undefined') return;
      const el = wrapRef.current;
      if (!el) return;
      const target = el.querySelector(`[data-card][data-idx="${index}"]`);
      if (!target) return;

      const cardWidth = target.getBoundingClientRect().width;
      const offset = target.offsetLeft;
      const left = Math.max(0, offset - Math.max(0, (el.clientWidth - cardWidth) / 2));

      programmaticScrollRef.current = true;
      if (scrollReleaseRef.current) {
        clearTimeout(scrollReleaseRef.current);
      }

      el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
      scrollReleaseRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, smooth ? 420 : 80);
    },
    [],
  );

  useEffect(() => {
    if (!filteredItems.length) {
      activeRef.current = 0;
      setActive(0);
      return;
    }
    const clamped = Math.min(activeRef.current, filteredItems.length - 1);
    activeRef.current = clamped;
    setActive(clamped);
    focusCard(clamped, { smooth: false });
  }, [filteredItems.length, focusCard]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (programmaticScrollRef.current) return;
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      scrollFrameRef.current = requestAnimationFrame(() => {
        const card = el.querySelector('[data-card]');
        if (!card || !filteredItems.length) return;
        const style = window.getComputedStyle(el);
        const gap = parseFloat(style.columnGap || style.gap || '24') || 24;
        const width = card.getBoundingClientRect().width;
        const approx = Math.round(el.scrollLeft / (width + gap));
        const clamped = Math.max(0, Math.min(approx, filteredItems.length - 1));
        if (clamped !== activeRef.current) {
          activeRef.current = clamped;
          setActive(clamped);
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [filteredItems.length]);

  useEffect(() => () => {
    if (scrollReleaseRef.current) {
      clearTimeout(scrollReleaseRef.current);
    }
    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    pipelineRef.current.controller?.abort();
  }, []);

  const scrollByCards = useCallback(
    (dir = 1) => {
      if (!filteredItems.length) return;
      setActive((prev) => {
        const next = Math.max(0, Math.min(prev + dir, filteredItems.length - 1));
        activeRef.current = next;
        if (next !== prev) {
          focusCard(next);
        }
        return next;
      });
    },
    [filteredItems.length, focusCard],
  );

  const onSelectItem = useCallback((item) => {
    setSelected(item);
  }, []);

  const onCloseModal = useCallback(() => {
    setSelected(null);
  }, []);

  const resetToFirstCard = useCallback(() => {
    activeRef.current = 0;
    setActive(0);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        focusCard(0, { smooth: false });
      });
    } else {
      focusCard(0, { smooth: false });
    }
  }, [focusCard]);

  const updateSentimentFilter = useCallback(
    (value) => {
      setFilters((prev) => ({ ...prev, sentiment: value }));
      resetToFirstCard();
    },
    [resetToFirstCard],
  );

  const updateBiasFilter = useCallback(
    (value) => {
      setFilters((prev) => ({ ...prev, bias: value }));
      resetToFirstCard();
    },
    [resetToFirstCard],
  );

  const handleSortChange = useCallback(
    (event) => {
      setSortBy(event.target.value);
      resetToFirstCard();
    },
    [resetToFirstCard],
  );

  const handleSearchChange = useCallback(
    (event) => {
      setSearchTerm(event.target.value);
      resetToFirstCard();
    },
    [resetToFirstCard],
  );

  return (
    <>
      <section className="relative rounded-3xl border border-black/5 bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
        <style>{`
          .news-scroll { -ms-overflow-style: none; scrollbar-width: none; overflow-y: visible; }
          .news-scroll::-webkit-scrollbar { display: none; height: 0; background: transparent; }
        `}</style>

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-amber-100 via-white to-amber-50 p-2 shadow-inner">
              <Sparkles className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-gray-900">Últimas que mueven el oro</h3>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400">IA 100% de Aisa Group CA · KleverOrion v.2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {refreshing && <span className="text-indigo-600">Actualizando…</span>}
            <button
              type="button"
              onClick={fetchNews}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:border-black/20 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Recargar
            </button>
          </div>
        </header>

        {trend && (
          <TrendBanner trend={trend} />
        )}

        <ControlsBar
          filters={filters}
          onSentimentChange={updateSentimentFilter}
          onBiasChange={updateBiasFilter}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
        />

        {failureSources.length > 0 && (
          <div className="mb-3 text-xs text-amber-600">
            Fuentes con incidencias temporales: {formatFailureSources(failureSources)}.
          </div>
        )}

        {isError && (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-8 text-center text-sm text-rose-700">
            <p className="mb-3 font-semibold">No pudimos actualizar el feed abierto.</p>
            <p className="mb-4 text-rose-600">{error}</p>
            <button
              type="button"
              onClick={fetchNews}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-500"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isError && (
          <div className="relative">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => scrollByCards(-1)}
              className="absolute left-[-18px] top-1/2 hidden -translate-y-1/2 rounded-full bg-white/95 p-2 text-gray-600 shadow transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => scrollByCards(1)}
              className="absolute right-[-18px] top-1/2 hidden -translate-y-1/2 rounded-full bg-white/95 p-2 text-gray-600 shadow transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent" />

            <div ref={wrapRef} className="news-scroll mt-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-12 pb-10">
              {cardsToRender.length === 0 && !isLoading && (
                <div className="min-h-[220px] w-full rounded-2xl border border-gray-200 bg-gray-50/60 p-6 text-center text-sm text-gray-500">
                  Sin titulares recientes. Intenta recargar en unos minutos.
                </div>
              )}

              {cardsToRender.map((item, idx) => {
                if (item.__skeleton) {
                  return <SkeletonCard key={item.id} />;
                }

                return (
                  <NewsCard
                    key={item.id}
                    item={item}
                    index={idx}
                    isActive={idx === active}
                    onSelect={onSelectItem}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!isError && hasData && (
          <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="Posición en carrusel">
            {filteredItems.map((_, index) => (
              <span
                key={index}
                role="tab"
                aria-selected={index === active}
                className={`h-1.5 rounded-full transition-all ${index === active ? 'w-6 bg-gray-800' : 'w-2 bg-gray-300'}`}
              />
            ))}
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="mt-4 text-center text-xs text-gray-500">El agregador no encontró titulares únicos en las últimas horas.</div>
        )}
      </section>

      {selected && (
        <InsightModal item={selected} onClose={onCloseModal} />
      )}
    </>
  );
}

function TrendBanner({ trend }) {
  return (
    <div className="mt-4 rounded-3xl border border-indigo-100 bg-indigo-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-white/70 p-2 shadow-inner">
            <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Tendencias de expertos</p>
            <p className="text-sm text-indigo-900">{trend.microCopy}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-indigo-600">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          {trend.keywords.length > 0 && (
            <span className="truncate">Palabras clave: {trend.keywords.slice(0, 4).join(', ')}</span>
          )}
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/60">
        {trend.sequence.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${(segment.share * 100).toFixed(0)}%`}
            style={{ width: `${Math.max(2, segment.share * 100)}%`, background: segment.background }}
            className="transition-all"
          />
        ))}
      </div>
    </div>
  );
}

function ControlsBar({ filters, onSentimentChange, onBiasChange, sortBy, onSortChange, searchTerm, onSearchChange }) {
  return (
    <div className="mt-4 grid gap-3 rounded-3xl border border-gray-100 bg-gray-50/80 p-4 text-xs text-gray-600 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        <span className="font-semibold uppercase tracking-[0.18em] text-gray-500">Impacto directo</span>
        <div className="flex flex-wrap gap-1">
          {SENTIMENT_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSentimentChange(option)}
              className={`rounded-full px-2.5 py-1 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${filters.sentiment === option ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600 hover:text-gray-800'}`}
            >
              {labelSent(option)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-[0.18em] text-gray-500">Sesgo</span>
        <div className="flex flex-wrap gap-1">
          {BIAS_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onBiasChange(option)}
              className={`rounded-full px-2.5 py-1 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${filters.bias === option ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:text-gray-800'}`}
            >
              {labelBias(option)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Buscar titulares o señales"
            aria-label="Buscar titulares"
            className="h-9 w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
        </div>
        <select
          value={sortBy}
          onChange={onSortChange}
          className="h-9 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 focus:border-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Ordenar titulares"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NewsCard({ item, index, isActive, onSelect }) {
  const confidenceAlpha = calcConfidenceAlpha(item.confidence, item.sentimentScore);
  const biasTone = item.biasLabel === 'pro-market' ? 'accent' : item.biasLabel === 'anti-market' ? 'danger' : 'secondary';
  const stackCount = item.stackSize > 1 ? item.stackSize : 0;
  return (
    <article
      key={item.id}
      data-card
      data-idx={index}
      role="button"
      tabIndex={0}
      aria-label={`Ampliar resumen de ${item.title}`}
      onClick={() => onSelect(item)}
      onKeyDown={(evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          onSelect(item);
        }
      }}
      className={`group min-w-[320px] max-w-[360px] snap-center outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 ${isActive ? 'scale-[1.02]' : ''}`}
    >
      <div className="relative px-2">
        <div className="pointer-events-none absolute inset-x-8 -bottom-2 h-6 rounded-full bg-black/10 blur-lg transition group-hover:blur-xl" />
        <div className="relative overflow-hidden rounded-3xl ring-1 ring-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 group-hover:shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
          <Thumb src={item.image} alt={item.imageAlt || item.title} seed={item.image || item.id || item.link || `${index}`} />
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            {item.sourceLogo && (
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/80 shadow-sm">
                <img
                  src={item.sourceLogo}
                  alt={`${item.source} logo`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </span>
            )}
            {item.sourceCategory && (
              <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {item.sourceCategory}
              </span>
            )}
          </div>
          {stackCount > 0 && (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow">{`+${stackCount - 1}`}</span>
          )}
        </div>
      </div>

      <div className="relative -mt-6 rounded-3xl border border-white/20 bg-white/75 px-4 pt-4 pb-5 shadow-[0_10px_22px_rgba(0,0,0,0.1)] backdrop-blur-xl transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_38px_rgba(15,23,42,0.22)]">
        <header className="mb-3 flex items-start justify-between gap-3 text-[11px] text-gray-500">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-indigo-600">{item.source}</span>
            <span className="text-[10px] text-gray-400">{item.relativeDate}</span>
          </div>
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-gray-600 transition hover:text-gray-800"
              onClick={(event) => event.stopPropagation()}
            >
              Leer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </header>

        <h4 className="mb-2 text-[17px] font-semibold leading-snug text-gray-900 line-clamp-2">{item.title}</h4>
        <p className="mb-2 text-sm text-gray-700 line-clamp-3">{item.executiveBrief}</p>
        {item.moeInsight?.recency && (
          <p className="mb-2 text-[11px] text-gray-500 line-clamp-2">{item.moeInsight.recency}</p>
        )}
        {item.moeInsight?.signals && (
          <p className="mb-3 text-[11px] text-gray-500">{item.moeInsight.signals}</p>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone={toneBySent(item.sentiment)} intensity={confidenceAlpha}>{labelSent(item.sentiment)}</Badge>
          <Badge tone={toneByImpact(item.impactLevel)}>{`Impacto ${labelImpact(item.impactLevel)}`}</Badge>
          <Badge tone={biasTone} intensity={Math.max(0.6, item.biasScore)}>{`Sesgo ${labelBias(item.biasLabel)}`}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Meter label="Relevancia" value={item.relevance} />
          <Meter label="Confianza" value={item.confidence} />
        </div>

        <div className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Ver resumen IA
        </div>
      </div>
    </article>
  );
}

function InsightModal({ item, onClose }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!item) return null;
  const experts = Array.isArray(item.experts) ? item.experts : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Detalle de ${item.title}`}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-gray-700 transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <div className="relative">
            <Thumb src={item.image} alt={item.imageAlt || item.title} seed={item.image || item.id || item.link || item.title} />
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
              {item.sourceLogo && (
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/80 shadow">
                  <img
                    src={item.sourceLogo}
                    alt={`${item.source} logo`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                </span>
              )}
              {item.sourceCategory && (
                <span className="rounded-full bg-black/65 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {item.sourceCategory}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 p-6 text-sm text-gray-700">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-gray-400">{item.sourceDomain || 'Fuente'}</span>
                <span className="text-base font-semibold text-gray-900">{item.source}</span>
                {item.moeInsight?.origin && (
                  <span className="text-xs text-gray-500">{item.moeInsight.origin}</span>
                )}
              </div>
              <Badge tone={toneBySent(item.sentiment)} intensity={calcConfidenceAlpha(item.confidence, item.sentimentScore)}>{labelSent(item.sentiment)}</Badge>
              <Badge tone={toneByImpact(item.impactLevel)}>{`Impacto ${labelImpact(item.impactLevel)}`}</Badge>
              <Badge tone={item.biasLabel === 'pro-market' ? 'accent' : item.biasLabel === 'anti-market' ? 'danger' : 'secondary'} intensity={Math.max(0.6, item.biasScore)}>
                {`Sesgo ${labelBias(item.biasLabel)}`}
              </Badge>
            </div>

            <h3 className="text-xl font-semibold leading-tight text-gray-900">{item.title}</h3>

            <InsightSection icon={Info} title="Resumen ejecutivo" text={item.executiveBrief} />
            <InsightSection icon={TrendingUp} title="Impacto sobre el oro" text={item.moeInsight?.effect} />
            <InsightSection icon={Sparkles} title="Por qué la IA la seleccionó" text={item.moeInsight?.why} />
            <InsightSection icon={Gauge} title="Señales cuantitativas" text={item.moeInsight?.signals} />
            <InsightSection icon={Clock} title="Recencia" text={item.moeInsight?.recency} />
            <InsightSection icon={Info} title="Por qué importa" text={item.whyMatters} />

            {item.keywords?.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 text-xs text-gray-600">
                <p className="mb-1 font-semibold text-gray-800">Palabras clave detectadas</p>
                <p>{item.keywords.slice(0, 8).join(', ')}</p>
              </div>
            )}

            {experts.length > 0 && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-800">
                <p className="mb-2 font-semibold text-indigo-900">Peso de expertos</p>
                <ul className="space-y-1">
                  {experts.map((expert) => (
                    <li key={expert.id} className="flex items-center justify-between gap-3">
                      <span>{expert.label}</span>
                      <span className="font-semibold">{Math.round((expert.alpha ?? 0) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {item.stack?.length > 1 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-800">
                <p className="mb-2 font-semibold text-amber-900">Variaciones equivalentes detectadas</p>
                <ul className="space-y-1">
                  {item.stack.slice(1).map((alt) => (
                    <li key={alt.id} className="flex items-center justify-between gap-3">
                      <span className="line-clamp-1">{alt.title}</span>
                      <a
                        href={alt.link}
                        className="inline-flex items-center gap-1 text-amber-700 underline transition hover:text-amber-900"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Leer <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Meter label="Relevancia" value={item.relevance} />
              <Meter label="Confianza" value={item.confidence} />
            </div>

            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500"
              >
                Ir a la fuente original <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightSection({ icon: Icon, title, text }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 text-sm text-gray-700">
      <div className="mb-1 flex items-center gap-2 text-gray-900">
        <Icon className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <span className="font-semibold">{title}</span>
      </div>
      <p>{text}</p>
    </div>
  );
}

function prettySourceLabel(name) {
  const normalized = sanitizeText(name);
  if (!normalized) return '';
  const lookup = CANONICAL_SOURCE_LABELS[normalized.toLowerCase()];
  if (lookup) return lookup;
  return normalized;
}

function formatFailureSources(sources) {
  if (!sources.length) return '';
  if (sources.length <= 4) return sources.join(', ');
  const visible = sources.slice(0, 4).join(', ');
  const remaining = sources.length - 4;
  return `${visible} y ${remaining} fuente${remaining === 1 ? '' : 's'} más`;
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

function Thumb({ src, alt, seed }) {
  const [okSrc, setOkSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const fallbackStepRef = useRef(0);

  useEffect(() => {
    fallbackStepRef.current = 0;
    setOkSrc(null);
    setLoading(true);
  }, [src, seed]);

  useEffect(() => {
    let alive = true;
    const candidate = (src || '').trim();
    if (!candidate) {
      setOkSrc(selectFallbackImage(seed, fallbackStepRef.current));
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (alive) {
        setOkSrc(candidate);
        setLoading(false);
      }
    };
    img.onerror = () => {
      if (alive) {
        fallbackStepRef.current += 1;
        setOkSrc(selectFallbackImage(seed, fallbackStepRef.current));
        setLoading(false);
      }
    };
    img.src = candidate;

    return () => {
      alive = false;
    };
  }, [src, seed]);

  const fallback = selectFallbackImage(seed, fallbackStepRef.current);

  return (
    <div className="relative aspect-[16/9] w-full bg-gray-100">
      {loading && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
      <img
        src={okSrc || fallback}
        alt={alt || 'thumbnail'}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoading(false)}
        onError={() => {
          fallbackStepRef.current += 1;
          setOkSrc(selectFallbackImage(seed, fallbackStepRef.current));
          setLoading(false);
        }}
      />
    </div>
  );
}

function selectFallbackImage(seed, step = 0) {
  const base = deterministicIndex(seed);
  const offset = (base + step) % FALLBACK_IMAGES.length;
  return FALLBACK_IMAGES[offset < 0 ? offset + FALLBACK_IMAGES.length : offset];
}

function deterministicIndex(seed) {
  if (seed == null) return 0;
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % FALLBACK_IMAGES.length;
}

function Badge({ tone = 'secondary', intensity = 1, children }) {
  const toneMap = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    danger: 'bg-rose-50 border-rose-200 text-rose-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    accent: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    secondary: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  const opacity = Math.min(1, Math.max(0.45, intensity));
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneMap[tone] || toneMap.secondary}`}
      style={{ opacity }}
    >
      {children}
    </span>
  );
}

function Meter({ label, value }) {
  const pct = Math.round((Number(value) || 0) * 100);
  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center justify-between text-gray-600">
        <span>{label}</span>
        <span className="font-semibold text-gray-800">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

async function fetchAndAggregate(signal) {
  const results = await Promise.allSettled([
    fetchWithBackoff('/api/news?q=gold%20price%20OR%20gold%20market', { signal }),
    fetchWithBackoff('/.netlify/functions/news-feed', { signal }),
  ]);

  const items = [];
  const failures = [];

  const [newsApiRes, openFeedRes] = results;

  if (newsApiRes.status === 'fulfilled' && newsApiRes.value?.items?.length) {
    for (const item of newsApiRes.value.items) {
      items.push({ ...item, origin: 'newsapi' });
    }
    if (Array.isArray(newsApiRes.value.failures)) failures.push(...newsApiRes.value.failures);
  } else if (newsApiRes.status === 'rejected') {
    failures.push({ source: 'newsapi', error: newsApiRes.reason?.message || String(newsApiRes.reason || 'Error NewsAPI') });
  }

  if (openFeedRes.status === 'fulfilled' && openFeedRes.value?.items?.length) {
    for (const item of openFeedRes.value.items) {
      items.push({ ...item, origin: 'open-feed' });
    }
    if (Array.isArray(openFeedRes.value.failures)) failures.push(...openFeedRes.value.failures);
  } else if (openFeedRes.status === 'rejected') {
    failures.push({ source: 'open-feed', error: openFeedRes.reason?.message || String(openFeedRes.reason || 'Error feed abierto') });
  }

  return { items, failures };
}

async function fetchWithBackoff(url, { signal, attempts = MAX_RETRIES + 1, baseDelay = 600 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await fetchWithTimeout(url, { signal });
      if (!response) return null;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const textType = response.headers.get('content-type') || '';
      if (response.status === 204) return null;
      if (textType.includes('application/json')) {
        return await response.json();
      }
      const raw = await response.text();
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
      if (attempt >= attempts - 1) break;
      const delay = baseDelay * (2 ** attempt);
      await wait(delay, signal);
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function fetchWithTimeout(url, { signal, timeout = FETCH_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const cleanup = [];
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    cleanup.push(() => signal.removeEventListener('abort', onAbort));
  }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
    cleanup.forEach((fn) => fn());
  }
}

function wait(ms, signal) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function orchestrateEnrichment(rawItems, signal, imageCache) {
  if (!Array.isArray(rawItems) || !rawItems.length) return [];
  const normalized = normalizeAndDedup(rawItems);
  if (!normalized.length) return [];

  const withSummaries = await runWithConcurrency(
    normalized,
    2,
    async (item) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const summary = await buildSummary(item);
      const keywords = extractKeywords(`${item.title || ''} ${summary}`);
      return {
        ...item,
        summaryHint: summary,
        executiveBrief: summary,
        keywords,
      };
    },
    signal,
  );

  const withBias = await runWithConcurrency(
    withSummaries,
    2,
    async (item) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let biasLabel = 'neutral';
      let biasScore = 0;
      try {
        const result = await classifyBias(`${item.title || ''}. ${item.summaryHint || ''}`);
        biasLabel = normalizeBiasLabel(result?.label);
        biasScore = result?.score ?? 0;
      } catch (error) {
        console.warn('[GoldNews] Bias classifier fallback', error);
      }
      return { ...item, biasLabel, biasScore };
    },
    signal,
  );

  const withSentiment = await runWithConcurrency(
    withBias,
    2,
    async (item) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let sentimentLabel = 'neutral';
      let sentimentScore = 0.5;
      let sentimentDistribution = null;
      try {
        const text = `${item.title || ''}. ${item.summaryHint || ''}`.trim();
        const predictions = await classifySentiment(text || item.title || '');
        const resolved = resolveSentiment(predictions);
        sentimentLabel = resolved.label;
        sentimentScore = resolved.score ?? sentimentScore;
        sentimentDistribution = resolved.distribution ?? null;
      } catch (error) {
        console.warn('[GoldNews] FinBERT fallback', error);
      }
      return { ...item, sentiment: sentimentLabel, sentimentScore, sentimentDistribution };
    },
    signal,
  );

  const scored = await scoreWithMoE(withSentiment, signal);
  const withImages = await enrichImages(scored, signal, imageCache);

  return withImages.map((item) => ({
    ...item,
    whyMatters: composeWhyMatters(item),
  }));
}

function normalizeAndDedup(items) {
  const map = new Map();
  for (const raw of items) {
    const normalized = normalizeArticle(raw);
    if (!normalized) continue;
    const key = normalized.dedupKey;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...normalized, stack: [normalized] });
    } else {
      existing.stack.push(normalized);
    }
  }
  return Array.from(map.values()).map((entry) => ({ ...entry, stack: entry.stack }));
}

function normalizeArticle(item) {
  const title = sanitizeText(item.title) || sanitizeText(item.headline);
  if (!title) return null;
  const link = sanitizeText(item.url || item.link || item.permalink);
  const description = sanitizeText(item.description || item.summary || item.content);
  const source = sanitizeText(item.source?.name || item.source || item.publisher || 'Fuente anónima');
  const sourceCategory = sanitizeText(item.sourceCategory || item.category || item.section);
  const sourceLogo = sanitizeText(item.sourceLogo || item.logo || null);
  const sourceSite = sanitizeText(item.sourceSite || item.site || null);
  const imageHint = sanitizeText(item.image || item.imageUrl || item.urlToImage || item.enclosure?.url || item.media?.url);
  const { ms: publishedAtMs, iso: publishedAtIso } = parsePublishedDate(item.publishedAtIso || item.publishedAt || item.pubDate || item.date);
  const dedupKey = stableHash(`${title.toLowerCase()}::${formatDomain(link || sourceSite || source)}`);

  return {
    id: stableHash(`${dedupKey}:${publishedAtMs || ''}`),
    dedupKey,
    title,
    description,
    content: sanitizeText(item.content),
    link: link || null,
    source,
    sourceCategory,
    sourceLogo,
    sourceSite,
    sourceDomain: formatDomain(link || sourceSite || source),
    imageHint,
    publishedAtIso,
    publishedAtMs,
    relativeDate: formatRelativeDate(publishedAtMs),
    origin: item.origin || 'unknown',
  };
}

function sanitizeText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parsePublishedDate(raw) {
  if (!raw) return { ms: null, iso: null };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { ms: null, iso: null };
  const date = new Date(ms);
  return { ms, iso: date.toISOString() };
}

function formatRelativeDate(timestamp) {
  if (!Number.isFinite(timestamp)) return 'Fecha no disponible';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'Programado para publicar';
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Hace instantes';
  if (diffMinutes < 60) return `Hace ${diffMinutes} minuto${diffMinutes === 1 ? '' : 's'}`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} hora${diffHours === 1 ? '' : 's'}`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays} día${diffDays === 1 ? '' : 's'}`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `Hace ${diffWeeks} semana${diffWeeks === 1 ? '' : 's'}`;
  const diffMonths = Math.floor(diffDays / 30);
  return `Hace ${diffMonths} mes${diffMonths === 1 ? '' : 'es'}`;
}

function stableHash(input) {
  const str = String(input || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `n${Math.abs(hash)}`;
}

function formatDomain(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

async function runWithConcurrency(items, limit, task, signal) {
  if (!items.length) return [];
  const results = new Array(items.length);
  const executing = [];
  for (let index = 0; index < items.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const promise = Promise.resolve().then(() => task(items[index], index));
    results[index] = promise;
    const wrapped = promise.then(
      (value) => {
        const pos = executing.indexOf(wrapped);
        if (pos >= 0) executing.splice(pos, 1);
        return value;
      },
      (error) => {
        const pos = executing.indexOf(wrapped);
        if (pos >= 0) executing.splice(pos, 1);
        throw error;
      },
    );
    executing.push(wrapped);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function buildSummary(item) {
  const baseText = sanitizeText(item.description || item.content);
  if (!baseText) {
    return sanitizeText(item.title);
  }
  const trimmed = baseText.length > 240 ? `${baseText.slice(0, 240)}…` : baseText;
  try {
    const summary = await summarize(trimmed, { maxLength: 120, minLength: 40 });
    return sanitizeText(summary) || trimmed;
  } catch (error) {
    console.warn('[GoldNews] Summarizer fallback', error);
    return trimmed;
  }
}

function normalizeBiasLabel(label) {
  if (!label) return 'neutral';
  const value = String(label).toLowerCase();
  if (value.includes('liberal')) return 'liberal';
  if (value.includes('conserv')) return 'conservative';
  if (value.includes('center') || value.includes('centrist')) return 'center';
  if (value.includes('pro-market') || value.includes('pro market')) return 'pro-market';
  if (value.includes('anti-market') || value.includes('anti market')) return 'anti-market';
  return 'neutral';
}

async function scoreWithMoE(items, signal) {
  if (!items.length) return [];
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const prepared = items.map((item) => ({
    id: item.id,
    title: item.title,
    summaryHint: item.summaryHint,
    link: item.link,
    source: item.source,
    sourceLogo: item.sourceLogo,
    sourceCategory: item.sourceCategory,
    publishedAt: item.publishedAtIso || item.publishedAt,
    publishedAtIso: item.publishedAtIso,
    publishedAtMs: item.publishedAtMs,
    imageHint: item.imageHint,
    description: item.description,
    stack: item.stack,
  }));
  const scored = await scoreNewsItems(prepared);
  const map = new Map();
  for (const entry of scored) {
    const key = entry.id || stableHash(`${entry.title || ''}${entry.link || ''}`);
    map.set(key, entry);
  }
  return items.map((item) => {
    const scoredItem = map.get(item.id) || {};
    const experts = Array.isArray(scoredItem.experts) ? scoredItem.experts : [];
    return {
      ...item,
      image: scoredItem.image || item.imageHint,
      moeInsight: scoredItem.insight || null,
      impactLevel: scoredItem.impact || 'medio',
      relevance: scoredItem.relevance ?? item.relevance ?? 0,
      confidence: scoredItem.confidence ?? item.confidence ?? 0,
      experts,
      expertTop: scoredItem.expertTop || experts[0]?.id || '',
      moeSentiment: scoredItem.sentiment || 'neutro',
      impactScore: scoredItem.impactScore ?? scoredItem.impact ?? 0,
      biasLevelModel: scoredItem.bias || 'medio',
      biasScoreModel: scoredItem.biasScore ?? 0,
    };
  });
}

async function enrichImages(items, signal, cache) {
  if (!items.length) return items;
  return runWithConcurrency(
    items,
    3,
    async (item) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const query = buildImageQuery(item);
      if (!query) return item;

      const now = Date.now();
      let cached = cache.get(query);
      if (cached && cached.expiresAt <= now) {
        cache.delete(query);
        cached = null;
      }

      if (cached && !Array.isArray(cached.results) && cached.url) {
        return mergeImageSelection(item, { url: cached.url, credit: cached.credit || null, alt: cached.alt || '' });
      }

      if (cached && !Array.isArray(cached.results)) {
        cache.delete(query);
        cached = null;
      }

      if (cached?.results?.length) {
        const selection = pickImageFromCache(query, cached, item);
        if (selection) {
          return mergeImageSelection(item, selection);
        }
      }

      try {
        const response = await fetchWithBackoff(`/api/images?q=${encodeURIComponent(query)}`, { signal, attempts: 1, baseDelay: 400 });
        const results = Array.isArray(response?.items)
          ? response.items.filter((entry) => entry?.url)
          : [];
        if (results.length) {
          const entry = {
            results: results.map((entry) => ({
              url: entry.url,
              credit: entry.credit || null,
              alt: entry.alt || '',
            })),
            expiresAt: now + CACHE_TTL_MS / 2,
            assignments: new Map(),
          };
          cache.set(query, entry);
          const selection = pickImageFromCache(query, entry, item);
          if (selection) {
            return mergeImageSelection(item, selection);
          }
        }
      } catch (error) {
        console.warn('[GoldNews] Unsplash fallback', error);
        if (!cached) {
          cache.set(query, { results: [], assignments: new Map(), expiresAt: now + 60_000 });
        }
      }

      if (cached?.results?.length) {
        const selection = pickImageFromCache(query, cached, item);
        if (selection) {
          return mergeImageSelection(item, selection);
        }
      }

      return item;
    },
    signal,
  );
}

function pickImageFromCache(query, entry, item) {
  if (!entry || !Array.isArray(entry.results) || entry.results.length === 0) return null;
  if (!(entry.assignments instanceof Map)) {
    entry.assignments = new Map();
  }
  const key = buildImageAssignmentKey(item);
  if (entry.assignments.has(key)) {
    const assigned = entry.assignments.get(key);
    return entry.results[assigned] || null;
  }
  const total = entry.results.length;
  const used = new Set(entry.assignments.values());
  let index = hashToIndex(`${query}:${key}`, total);
  for (let step = 0; step < total; step += 1) {
    const candidate = (index + step) % total;
    if (!used.has(candidate) && entry.results[candidate]) {
      entry.assignments.set(key, candidate);
      return entry.results[candidate];
    }
  }
  const fallbackIndex = hashToIndex(`${query}:${key}:fallback`, total);
  entry.assignments.set(key, fallbackIndex);
  return entry.results[fallbackIndex] || entry.results[0] || null;
}

function mergeImageSelection(item, selection) {
  if (!selection) return item;
  return {
    ...item,
    image: selection.url || item.image,
    imageAlt: selection.alt || item.imageAlt || item.title || null,
    imageAttribution: selection.credit || item.imageAttribution || null,
  };
}

function buildImageAssignmentKey(item) {
  return item?.id || item?.dedupKey || stableHash(`${item?.title || ''}${item?.link || ''}`);
}

function hashToIndex(seed, length) {
  if (!length) return 0;
  const str = String(seed || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
}

function hydrateInitialItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seenImages = new Map();
  const usedFallbacks = new Set();

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') return item;

    const id = item.id || stableHash(`${item.title || ''}${item.link || ''}${index}`);
    const biasLabel = normalizeBiasLabel(
      item.biasLabel || item.bias || item.biasLevelModel || item.biasLevel || item.bias?.label,
    );
    const biasScore = coerceScore(
      item.biasScore,
      item.biasScoreModel,
      item.bias?.score,
      item.biasConfidence,
    );
    const sentimentLabel = normalizeSentimentLabel(
      item.sentiment || item.sentimentLabel || item.sentimentTrend || item.moeSentiment || item.sentiment?.label,
    );
    const sentimentScore = coerceScore(
      item.sentimentScore,
      item.sentiment?.score,
      item.sentimentConfidence,
      item.sentimentProbability,
    );

    const rawImage = sanitizeUrl(
      item.image || item.imageUrl || item.urlToImage || item.mediaUrl || item.media?.url || item.enclosure?.url,
    );
    let image = rawImage;
    if (image) {
      const count = seenImages.get(image) || 0;
      seenImages.set(image, count + 1);
      if (count > 0) {
        image = '';
      }
    }

    let imageFromFallback = false;
    if (!image) {
      image = pickFallbackImageForItem(item, index, usedFallbacks);
      imageFromFallback = Boolean(image);
    }

    const providedAlt = sanitizeText(item.imageAlt || item.image_alt || item.imageDescription || '');
    const titleAlt = sanitizeText(item.title);
    const imageAlt = providedAlt || titleAlt || 'Noticia reciente del mercado del oro';
    const imageAttribution = sanitizeText(
      item.imageAttribution || item.imageCredit || item.image_credit || item.image_author || '',
    );

    const stackSize = Number.isFinite(item.stackSize)
      ? item.stackSize
      : Array.isArray(item.stack)
      ? item.stack.length
      : undefined;

    const next = {
      ...item,
      id,
      biasLabel,
      biasScore,
      sentiment: sentimentLabel,
      sentimentScore,
      image: image || null,
      imageAlt: imageAlt || null,
      imageAttribution: imageAttribution || null,
    };

    if (typeof stackSize === 'number') {
      next.stackSize = stackSize;
    }

    if (imageFromFallback) {
      usedFallbacks.add(image);
    }

    return next;
  });
}

function normalizeSentimentLabel(label) {
  if (!label) return 'neutral';
  const value = String(label).toLowerCase();
  if (value.includes('bull') || value.includes('alcist')) return 'bullish';
  if (value.includes('bear') || value.includes('bajist')) return 'bearish';
  if (value.includes('positivo')) return 'bullish';
  if (value.includes('negativo')) return 'bearish';
  return 'neutral';
}

function coerceScore(...values) {
  for (const value of values) {
    const number = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(number)) continue;
    if (number > 1 && number <= 100) {
      return Math.min(1, Math.max(0, number / 100));
    }
    return Math.min(1, Math.max(0, number));
  }
  return 0;
}

function sanitizeUrl(value) {
  if (!value) return '';
  return String(value).trim();
}

function pickFallbackImageForItem(item, index, usedFallbacks) {
  if (!FALLBACK_IMAGES.length) return '';
  const seed = `${item?.id || ''}:${item?.title || ''}:${index}`;
  const start = hashToIndex(seed, FALLBACK_IMAGES.length);
  for (let offset = 0; offset < FALLBACK_IMAGES.length; offset += 1) {
    const candidate = FALLBACK_IMAGES[(start + offset) % FALLBACK_IMAGES.length];
    if (!usedFallbacks.has(candidate)) {
      return candidate;
    }
  }
  return FALLBACK_IMAGES[start % FALLBACK_IMAGES.length];
}

function buildImageQuery(item) {
  if (item.keywords?.length) {
    return `${item.keywords.slice(0, 3).join(' ')} gold`;
  }
  if (item.expertTop === 'macro') return 'federal reserve interest rates gold';
  if (item.expertTop === 'etf') return 'gold etf flows bullion';
  if (item.expertTop === 'usd') return 'us dollar currency gold';
  if (item.expertTop === 'cb') return 'central bank gold reserves';
  return `${item.title || 'gold news'}`;
}

function postProcessNews(items) {
  if (!items.length) return { clusters: [], trend: null };
  const clusters = dedupeSemantic(items).sort((a, b) => {
    const relevanceDiff = (b.relevance || 0) - (a.relevance || 0);
    if (relevanceDiff !== 0) return relevanceDiff;
    const timeDiff = (b.publishedAtMs || 0) - (a.publishedAtMs || 0);
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
  const trend = computeTrend(items);
  return { clusters, trend };
}

function dedupeSemantic(items) {
  const groups = [];
  for (const item of items) {
    const vector = vectorFromExperts(item.experts);
    let matched = null;
    for (const group of groups) {
      const similarity = cosineSimilarity(vector, group.vector);
      const timeDelta = Math.abs((item.publishedAtMs || 0) - (group.primary.publishedAtMs || 0));
      if (similarity >= 0.97 && timeDelta <= 1000 * 60 * 240) {
        matched = group;
        break;
      }
    }
    if (matched) {
      matched.members.push(item);
      matched.vector = matched.vector.map((value, index) => (value + vector[index]) / 2);
      if ((item.relevance || 0) > (matched.primary.relevance || 0)) {
        matched.primary = item;
      }
      continue;
    }
    groups.push({ primary: item, vector, members: [item] });
  }

  return groups.map((group) => {
    const stackMap = new Map();
    for (const member of group.members) {
      const variations = Array.isArray(member.stack) ? member.stack : [member];
      for (const variation of variations) {
        const key = variation.id || stableHash(`${variation.title || ''}${variation.link || ''}`);
        if (!stackMap.has(key)) {
          stackMap.set(key, {
            ...variation,
            relevance: variation.relevance ?? member.relevance ?? 0,
            publishedAtMs: variation.publishedAtMs ?? member.publishedAtMs,
          });
        }
      }
    }
    const stack = Array.from(stackMap.values()).sort((a, b) => {
      const relevanceDiff = (b.relevance || 0) - (a.relevance || 0);
      if (relevanceDiff !== 0) return relevanceDiff;
      const timeDiff = (b.publishedAtMs || 0) - (a.publishedAtMs || 0);
      if (timeDiff !== 0) return timeDiff;
      return (a.id || '').localeCompare(b.id || '');
    });
    const primary = group.primary;
    return {
      ...primary,
      stack,
      stackSize: stack.length,
    };
  });
}

function vectorFromExperts(experts = []) {
  const vector = EXPERT_ORDER.map(() => 0);
  for (const expert of experts) {
    const index = EXPERT_ORDER.indexOf(expert.id);
    if (index >= 0) {
      vector[index] = expert.cos ?? expert.alpha ?? 0;
    }
  }
  return vector;
}

function cosineSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function computeTrend(items) {
  if (!items.length) return null;
  const totals = { macro: 0, etf: 0, usd: 0, cb: 0 };
  items.forEach((item) => {
    const relevanceWeight = (item.relevance || 0.4) + (item.confidence || 0.2);
    (item.experts || []).forEach((expert) => {
      if (totals[expert.id] !== undefined) {
        totals[expert.id] += (expert.alpha || 0) * relevanceWeight;
      }
    });
  });
  const entries = EXPERT_ORDER.map((id) => ({ id, label: labelForExpert(id), weight: totals[id] || 0 }));
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  const sorted = entries.filter((entry) => entry.weight > 0).sort((a, b) => b.weight - a.weight);
  const microParts = [];
  if (sorted[0]) microParts.push(`Predomina ${sorted[0].label} (${Math.round((sorted[0].weight / totalWeight) * 100)}%)`);
  if (sorted[1]) microParts.push(`seguido por ${sorted[1].label} (${Math.round((sorted[1].weight / totalWeight) * 100)}%)`);
  const keywordsSet = new Set();
  items.slice(0, 8).forEach((item) => {
    (item.keywords || []).slice(0, 2).forEach((keyword) => keywordsSet.add(keyword));
  });
  const sequenceBase = items
    .slice()
    .sort((a, b) => (a.publishedAtMs || 0) - (b.publishedAtMs || 0))
    .map((item, index) => {
      const top = (item.experts || [])[0];
      const share = Math.max(0.02, top?.alpha || 0.25);
      const id = top?.id || 'mix';
      return {
        key: `${index}-${id}`,
        label: labelForExpert(id),
        share,
        background: colorForExpert(id),
      };
    });
  const totalShare = sequenceBase.reduce((sum, segment) => sum + segment.share, 0) || 1;
  const sequence = sequenceBase.map((segment) => ({
    ...segment,
    share: segment.share / totalShare,
  }));

  return {
    microCopy: microParts.join(' · ') || 'Señal mixta entre expertos.',
    keywords: Array.from(keywordsSet),
    sequence,
  };
}

function labelForExpert(id) {
  switch (id) {
    case 'macro':
      return 'Macro / Fed';
    case 'etf':
      return 'ETF / Flujos';
    case 'usd':
      return 'USD / FX';
    case 'cb':
      return 'Bancos centrales';
    default:
      return 'Mixto';
  }
}

function colorForExpert(id) {
  return EXPERT_COLORS[id] || EXPERT_COLORS.mix;
}

function calcConfidenceAlpha(confidence = 0.5, sentimentScore = 0.5) {
  const base = Number.isFinite(confidence) ? confidence : 0.5;
  const tone = Number.isFinite(sentimentScore) ? sentimentScore : 0.5;
  const weighted = 0.45 + 0.4 * base + 0.25 * tone;
  return Math.min(1, Math.max(0.45, weighted));
}

function labelSent(value) {
  if (value === 'all') return 'Todos';
  if (value === 'bullish' || value === 'alcista') return 'Alcista';
  if (value === 'bearish' || value === 'bajista') return 'Bajista';
  return 'Neutral';
}

function toneBySent(value) {
  if (value === 'bullish' || value === 'alcista') return 'success';
  if (value === 'bearish' || value === 'bajista') return 'danger';
  return 'secondary';
}

function labelBias(value) {
  switch (value) {
    case 'liberal':
      return 'Liberal';
    case 'conservative':
      return 'Conservador';
    case 'center':
      return 'Centro';
    case 'pro-market':
      return 'Pro mercado';
    case 'anti-market':
      return 'Anti mercado';
    default:
      return 'Neutral';
  }
}

function labelImpact(value) {
  if (value === 'alto' || value === 'high') return 'Alto';
  if (value === 'medio' || value === 'medium') return 'Medio';
  return 'Bajo';
}

function toneByImpact(value) {
  if (value === 'alto' || value === 'high') return 'warning';
  if (value === 'medio' || value === 'medium') return 'accent';
  return 'secondary';
}

function composeWhyMatters(item) {
  const parts = [];
  if (item.moeInsight?.effect) parts.push(item.moeInsight.effect);
  if (item.keywords?.length) parts.push(`Claves: ${item.keywords.slice(0, 5).join(', ')}`);
  if (item.executiveBrief && parts.length > 0) parts.push(item.executiveBrief);
  return parts.join(' · ');
}

const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'will', 'into',
  'las', 'los', 'una', 'unos', 'unas', 'del', 'por', 'para', 'sobre', 'como',
  'cuando', 'ante', 'donde', 'entre', 'hacia', 'hace', 'pero', 'tras', 'cada',
  'gold', 'oro', 'price', 'prices', 'market', 'news', 'latest', 'update',
]);

function extractKeywords(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .split(/[^a-záéíóúñ0-9]+/)
    .filter((word) => word && word.length > 3 && !KEYWORD_STOPWORDS.has(word));
  if (!words.length) return [];
  const frequency = new Map();
  for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}
