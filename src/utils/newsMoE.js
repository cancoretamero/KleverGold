// src/utils/newsMoE.js
// Motor Mixture-of-Experts (MoE) para puntuar titulares sobre XAU/USD en el navegador.
// Usa @xenova/transformers (Apache-2.0) y pesos MIT opcionales en weights.news.json.

const STOPWORDS = new Set([
  'the','and','for','that','with','from','this','have','will','into','sobre','cuando','pero','tras','ante','como','porque',
  'para','por','de','del','los','las','una','unas','unos','este','esta','estas','estos','donde','entre','sobre','hacia',
  'a','al','en','la','el','un','una','que','se','su','sus','y','or','are','was','were','has','had','been','more','less','than',
  'after','before','amid','into','blog','news','press','release','data','update','sobre','por','del','las','los','son','usa',
  'pero','como','segun','según','dijo','dice','they','them','their','its','new','says','say','gov','bank','world','federal',
  'reserve','treasury','bureau','labor','statistics','analysis','imf','world','bank'
]);

const EXPERTS = [
  {
    id: 'macro',
    label: 'Macro / Fed',
    prompt: 'Federal Reserve FOMC interest rates CPI PPI real yields monetary policy inflation growth slowdown',
    rationale: 'Macro condiciona el coste de oportunidad y los rendimientos reales.',
    fallback: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'etf',
    label: 'ETF / Flujos',
    prompt: 'gold ETF flows holdings demand bullion inflows GLD world gold council exchange traded funds',
    rationale: 'Los flujos en ETF reflejan demanda de inversión en oro físico.',
    fallback: 'https://images.unsplash.com/photo-1593672715438-d88a70629abe?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'usd',
    label: 'USD / FX',
    prompt: 'US dollar DXY treasury yields USD strength currency foreign exchange real rates',
    rationale: 'El dólar fuerte o débil altera el precio relativo del oro.',
    fallback: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'cb',
    label: 'Bancos centrales / Minería',
    prompt: 'central bank gold purchases reserves supply mining output strikes production miners geopolitics bullion demand',
    rationale: 'Compras oficiales y shocks de oferta ajustan el balance físico.',
    fallback: 'https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1600&auto=format&fit=crop',
  },
];

const FALLBACK_MINING = 'https://images.unsplash.com/photo-1566943956303-74261c0f3760?q=80&w=1600&auto=format&fit=crop';

const SOURCE_IMAGE_OVERRIDES = {
  treasury: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1600&auto=format&fit=crop',
  bls: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?q=80&w=1600&auto=format&fit=crop',
  cftc: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&w=1600&auto=format&fit=crop',
  mining: FALLBACK_MINING,
  kitco: 'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?q=80&w=1600&auto=format&fit=crop',
};

const IMAGE_PRESETS = [
  { test: /(cpi|inflation|price index|consumer price|ppi|deflator|inflaci[oó]n)/i, image: 'https://images.unsplash.com/photo-1587583778181-069c2c8003e1?q=80&w=1600&auto=format&fit=crop' },
  { test: /(jobs|employment|labor|payroll|unemployment|jobless|empleo|n[oó]minas|laboral)/i, image: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?q=80&w=1600&auto=format&fit=crop' },
  { test: /(treasury|bond|yield|auction|t-bill|bono|rendimiento|rendimientos|debt)/i, image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1600&auto=format&fit=crop' },
  { test: /(dollar|usd|currency|exchange|dxy|divisa|yen|euro|fx)/i, image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1600&auto=format&fit=crop' },
  { test: /(federal reserve|fed|rate|fomc|central bank|bank of|policy|banqu[eé] central)/i, image: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop' },
  { test: /(etf|fund|flows|holdings|inflow|outflow|inversi[oó]n|fondos)/i, image: 'https://images.unsplash.com/photo-1593672715438-d88a70629abe?q=80&w=1600&auto=format&fit=crop' },
  { test: /(mine|mining|output|production|supply|miner|strike|lingote|reserva|mineral)/i, image: FALLBACK_MINING },
  { test: /(geopolit|conflict|war|sanction|invasion|geopol[ií]tica|tensi[oó]n)/i, image: 'https://images.unsplash.com/photo-1465447142348-e9952c393450?q=80&w=1600&auto=format&fit=crop' },
];

const FALLBACKS = [
  'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1593672715438-d88a70629abe?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1566943956303-74261c0f3760?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1465479423260-c4afc24172c6?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1521540216272-a50305cd4421?q=80&w=1600&auto=format&fit=crop',
];

const DEFAULT_HEADS = {
  relevance: {
    macro: { scale: 3.6, bias: -0.4 },
    etf: { scale: 3.8, bias: -0.5 },
    usd: { scale: 3.4, bias: -0.4 },
    cb: { scale: 3.2, bias: -0.35 },
  },
  impact: {
    macro: { scale: 4.2, bias: -0.6 },
    etf: { scale: 4.0, bias: -0.5 },
    usd: { scale: 4.0, bias: -0.6 },
    cb: { scale: 4.4, bias: -0.55 },
  },
  bias: {
    macro: { scale: 2.2, bias: 0 },
    etf: { scale: 2.0, bias: 0 },
    usd: { scale: 2.4, bias: 0 },
    cb: { scale: 2.1, bias: 0 },
  },
  confidence: {
    macro: { scale: 3.0, bias: -0.3 },
    etf: { scale: 3.2, bias: -0.3 },
    usd: { scale: 2.8, bias: -0.25 },
    cb: { scale: 3.0, bias: -0.25 },
  },
};

let extractorPromise = null;
let expertsPromise = null;
let weightsPromise = null;
let transformersModulePromise = null;

const TRANSFORMERS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.0/dist/transformers.min.js';

async function loadTransformersModule() {
  if (!transformersModulePromise) {
    transformersModulePromise = (async () => {
      try {
        return await import('@xenova/transformers');
      } catch (error) {
        if (typeof window === 'undefined') throw error;
        const fallbackUrl = window?.KLEVER_TRANSFORMERS_CDN || TRANSFORMERS_CDN_URL;
        try {
          console.warn('[GoldNews] No se pudo resolver @xenova/transformers, usando CDN', error);
          return await import(/* @vite-ignore */ fallbackUrl);
        } catch (cdnError) {
          console.error('[GoldNews] Fallback CDN de transformers también falló', cdnError);
          throw error;
        }
      }
    })();
  }
  return transformersModulePromise;
}

async function loadExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = await loadTransformersModule();
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;
      mod.env.backends.onnx.wasm.proxy = false;
      return mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    })();
  }
  return extractorPromise;
}

async function loadExpertVectors() {
  if (!expertsPromise) {
    expertsPromise = (async () => {
      const extractor = await loadExtractor();
      const vectors = [];
      for (const expert of EXPERTS) {
        const output = await extractor(expert.prompt, { pooling: 'mean', normalize: true });
        const data = Array.from(output.data ?? output);
        vectors.push({ ...expert, vector: data });
      }
      return vectors;
    })();
  }
  return expertsPromise;
}

async function loadHeads() {
  if (!weightsPromise) {
    weightsPromise = (async () => {
      try {
        const res = await fetch('/weights.news.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('weights 404');
        const json = await res.json();
        return mergeHeads(DEFAULT_HEADS, json);
      } catch {
        return DEFAULT_HEADS;
      }
    })();
  }
  return weightsPromise;
}

function mergeHeads(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base;
  const out = JSON.parse(JSON.stringify(base));
  for (const metric of Object.keys(base)) {
    if (!incoming[metric]) continue;
    for (const expertId of Object.keys(base[metric])) {
      if (!incoming[metric][expertId]) continue;
      const target = incoming[metric][expertId];
      const dest = out[metric][expertId];
      if (typeof target.scale === 'number') dest.scale = target.scale;
      if (typeof target.bias === 'number') dest.bias = target.bias;
    }
  }
  return out;
}

export async function scoreNewsItems(items = []) {
  if (!items.length) return [];
  const [vectors, heads] = await Promise.all([loadExpertVectors(), loadHeads()]);
  const extractor = await loadExtractor();

  const results = [];
  for (const item of items) {
    const text = buildEmbeddingText(item);
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data ?? output);
    const gating = computeGating(embedding, vectors);
    const metrics = computeMetrics(embedding, vectors, heads, gating.alphas, item);
    const metricsClamped = {
      relevance: clamp01(metrics.relevance),
      impact: clamp01(metrics.impact),
      bias: clamp01(metrics.bias),
      confidence: clamp01(metrics.confidence),
    };
    const sentiment = estimateSentiment(item, metricsClamped, gating, embedding);
    const biasLabel = levelFromScore(metricsClamped.bias);
    const impactLabel = impactLevel(metricsClamped.impact);
    const reason = buildReason(item, gating, sentiment, metricsClamped);
    const image = chooseImage(item, gating, metricsClamped);
    const insight = buildInsight(item, gating, sentiment, metricsClamped, reason);
    results.push({
      ...item,
      reason,
      image,
      expertTop: gating.top?.id || '',
      experts: gating.detail,
      impact: impactLabel,
      bias: biasLabel,
      sentiment,
      relevance: metricsClamped.relevance,
      confidence: metricsClamped.confidence,
      impactScore: metricsClamped.impact,
      biasScore: metricsClamped.bias,
      insight,
    });
  }
  return results;
}

function buildEmbeddingText(item) {
  const base = `${item.title || ''}. ${item.summaryHint || ''}`.trim();
  return base || (item.title || '');
}

function computeGating(embedding, vectors) {
  const sims = vectors.map((expert) => ({
    expert,
    cos: dot(embedding, expert.vector),
  }));
  const temperature = 0.38;
  const maxCos = Math.max(...sims.map((s) => s.cos));
  const exps = sims.map((s) => Math.exp((s.cos - maxCos) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const alphas = exps.map((v) => v / sum);
  const detail = sims.map((s, i) => ({
    id: s.expert.id,
    label: s.expert.label,
    alpha: alphas[i],
    cos: s.cos,
  }));
  detail.sort((a, b) => b.alpha - a.alpha);
  return { alphas, detail, top: detail[0] };
}

function computeMetrics(embedding, vectors, heads, alphas, item) {
  const scores = { relevance: 0, impact: 0, bias: 0, confidence: 0 };
  let idx = 0;
  for (const expert of vectors) {
    const cos = dot(embedding, expert.vector);
    const recencyBoost = recencyFactor(item.publishedAtIso || item.publishedAt, item.publishedAtMs);
    for (const metric of Object.keys(scores)) {
      const params = heads[metric][expert.id];
      const raw = logistic((params.scale ?? 1) * cos + (params.bias ?? 0));
      let value = raw;
      if (metric === 'relevance') value *= recencyBoost;
      if (metric === 'confidence') value *= confidenceAdjust(item);
      scores[metric] += alphas[idx] * value;
    }
    idx += 1;
  }
  return scores;
}

function estimateSentiment(item, metrics, gating, embedding) {
  const text = `${item.title || ''} ${item.summaryHint || ''}`.toLowerCase();
  const lexical = lexicalPolarity(text);
  const impactCentered = (clamp01(metrics.impact) - 0.5) * 1.4;
  const directional = themeDirectionalBoost(gating.top, text);
  const score = clamp(-1, 1, lexical * 0.45 + impactCentered * 0.4 + directional * 0.3);
  if (score > 0.12) return 'alcista';
  if (score < -0.12) return 'bajista';
  return 'neutro';
}

function themeDirectionalBoost(top, text) {
  if (!top) return 0;
  let delta = 0;
  if (top.id === 'macro') {
    if (/rate cut|cooling inflation|slowdown|yield decline|softer inflation/.test(text)) delta += 0.25;
    if (/rate hike|hawkish|tighten|sticky inflation|hot inflation/.test(text)) delta -= 0.25;
  } else if (top.id === 'etf') {
    if (/inflow|build|accumulate|buying/.test(text)) delta += 0.2;
    if (/outflow|redemption|selling|liquidat/.test(text)) delta -= 0.2;
  } else if (top.id === 'usd') {
    if (/dollar strengthens|dxy rises|usd rally|greenback climbs/.test(text)) delta -= 0.25;
    if (/dollar weakens|usd slips|greenback eases|dxy falls/.test(text)) delta += 0.25;
  } else if (top.id === 'cb') {
    if (/central bank buying|reserve build|purchases/.test(text)) delta += 0.25;
    if (/selling reserves|dumping gold|export surge/.test(text)) delta -= 0.2;
    if (/mine|mining|strike|output|production/.test(text)) delta += 0.1;
  }
  return clamp(-0.35, 0.35, delta * top.alpha);
}

function lexicalPolarity(text) {
  if (!text) return 0;
  const positives = [
    'cut', 'cool', 'ease', 'support', 'demand', 'buy', 'inflow', 'weaker dollar',
    'deficit', 'slowdown', 'stimulus', 'bullish', 'acquire', 'secure', 'increase reserves',
  ];
  const negatives = [
    'hike', 'strong', 'hawkish', 'surge', 'sell', 'outflow', 'liquidation', 'tighten',
    'slump', 'rebound dollar', 'rebound usd', 'dump', 'oversupply', 'recession risk', 'strike ends',
  ];
  let pos = 0;
  let neg = 0;
  for (const key of positives) if (text.includes(key)) pos += 1;
  for (const key of negatives) if (text.includes(key)) neg += 1;
  if (pos === 0 && neg === 0) return 0;
  const raw = (pos - neg) / Math.max(3, pos + neg);
  return clamp(-1, 1, raw);
}

function buildReason(item, gating, sentiment, metrics) {
  const keywords = extractKeywords(`${item.title || ''} ${item.summaryHint || ''}`);
  const keyLine = keywords.length ? `Claves: ${keywords.join(', ')}.` : 'Claves: variaciones macro y de flujos.';
  const alphaPct = Math.round((gating.top?.alpha ?? 0) * 100);
  const tone = sentiment === 'alcista' ? 'sesgo favorable al oro' : sentiment === 'bajista' ? 'presión bajista' : 'impacto neutral';
  const topExpert = EXPERTS.find((exp) => exp.id === gating.top?.id);
  const rationale = topExpert ? topExpert.rationale : 'Impacto diversificado.';
  const impactText = impactLevel(metrics.impact, true);
  const recency = describeRecency(item.publishedAtIso || item.publishedAt, item.publishedAtMs);
  return `${topExpert ? topExpert.label : 'Mixto'} domina (${alphaPct}% α). ${rationale} Impacto ${impactText} y ${tone}; ${keyLine} ${recency}`;
}

function chooseImage(item, gating, metrics) {
  if (item.imageHint && /^https?:\/\//.test(item.imageHint)) return item.imageHint;
  if (item.sourceId && SOURCE_IMAGE_OVERRIDES[item.sourceId]) return SOURCE_IMAGE_OVERRIDES[item.sourceId];
  const text = `${item.title || ''} ${item.summaryHint || ''} ${item.sourceCategory || ''}`.toLowerCase();
  for (const preset of IMAGE_PRESETS) {
    if (preset.test.test(text)) return preset.image;
  }
  if (metrics && metrics.impact >= 0.66) {
    const impactPreset = IMAGE_PRESETS.find((preset) => preset.test.test('impacto geopolitico alto'));
    if (impactPreset) return impactPreset.image;
  }
  const topId = gating.top?.id;
  const expert = EXPERTS.find((e) => e.id === topId);
  if (expert?.fallback) return expert.fallback;
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

function recencyFactor(isoDate, timestamp) {
  const now = Date.now();
  let reference = Number.isFinite(timestamp) ? timestamp : null;
  if (!reference && isoDate) {
    const parsed = Date.parse(isoDate);
    if (Number.isFinite(parsed)) reference = parsed;
  }
  if (!reference) return 0.8;
  const diffHours = (now - reference) / (1000 * 60 * 60);
  if (diffHours <= 3) return 1.12;
  if (diffHours <= 12) return 1.05;
  if (diffHours <= 24) return 1;
  if (diffHours <= 48) return 0.9;
  if (diffHours <= 72) return 0.85;
  if (diffHours <= 120) return 0.82;
  if (diffHours <= 168) return 0.78;
  return 0.72;
}

function confidenceAdjust(item) {
  let factor = 1;
  if (!item.summaryHint) factor *= 0.85;
  if (!item.link) factor *= 0.9;
  return factor;
}

function buildInsight(item, gating, sentiment, metrics, reason) {
  const topExpert = EXPERTS.find((exp) => exp.id === gating.top?.id);
  const alphaPct = Math.round((gating.top?.alpha ?? 0) * 100);
  const relevancePct = formatPct(metrics.relevance);
  const confidencePct = formatPct(metrics.confidence);
  const impactLabel = impactLevel(metrics.impact, true);
  const biasLabel = levelFromScore(metrics.bias);
  const sentimentText = sentimentNarrative(sentiment, impactLabel);
  const recency = describeRecency(item.publishedAtIso || item.publishedAt, item.publishedAtMs);
  const originLine = item.publishedAt ? `Publicado el ${item.publishedAt}` : 'Publicación reciente';

  return {
    summary: item.summaryHint || 'La fuente original no ofrece un sumario. Visita el enlace para el detalle completo.',
    effect: `El modelo estima un impacto ${impactLabel} ${sentimentText}`,
    why: topExpert
      ? `${topExpert.label} concentra ${alphaPct}% del peso analítico (${topExpert.rationale.toLowerCase()}).`
      : 'Se detecta una combinación equilibrada de factores macro, ETF, USD y bancos centrales.',
    signals: `Relevancia ${relevancePct} · Confianza ${confidencePct} · Sesgo ${biasLabel}.`,
    origin: `${originLine} · ${item.source}`,
    recency,
    reason,
  };
}

function sentimentNarrative(sentiment, impactLabel) {
  if (sentiment === 'alcista') return `con sesgo positivo para el oro (${impactLabel}).`;
  if (sentiment === 'bajista') return `con presión negativa para el oro (${impactLabel}).`;
  return `con impacto neutral para el oro (${impactLabel}).`;
}

function describeRecency(isoDate, timestamp) {
  const referenceMs = Number.isFinite(timestamp) ? timestamp : isoDate ? Date.parse(isoDate) : NaN;
  if (!Number.isFinite(referenceMs)) return 'Momento de publicación desconocido.';
  const diffMs = Date.now() - referenceMs;
  if (diffMs < 0) return 'Programado para publicación futura.';
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) return 'Publicado hace menos de una hora.';
  if (diffHours < 6) return `Publicado hace ${Math.round(diffHours)} horas.`;
  if (diffHours < 24) return 'Publicado en las últimas 24 horas.';
  if (diffHours < 48) return 'Publicado en las últimas 48 horas.';
  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) return `Publicado hace ${diffDays} día${diffDays === 1 ? '' : 's'}.`;
  return `Publicado hace aproximadamente ${diffDays} días.`;
}

function formatPct(value) {
  const pct = Math.round(clamp01(value) * 100);
  return `${pct}%`;
}

function extractKeywords(text) {
  const words = (text || '')
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñü]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  if (!words.length) return [];
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  return sorted.slice(0, 5);
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp(min, max, value) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function levelFromScore(score) {
  const v = clamp01(score);
  if (v >= 0.66) return 'alto';
  if (v >= 0.33) return 'medio';
  return 'bajo';
}

function impactLevel(score, verbose = false) {
  const v = clamp01(score);
  if (verbose) {
    if (v >= 0.66) return 'alto';
    if (v >= 0.33) return 'medio';
    return 'bajo';
  }
  if (v >= 0.66) return 'alto';
  if (v >= 0.33) return 'medio';
  return 'bajo';
}

