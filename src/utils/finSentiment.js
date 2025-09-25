/**
 * finSentiment.js — módulo para análisis de sentimiento con FinBERT.
 * Usa @xenova/transformers para cargar el modelo ProsusAI/finbert.
 * Retorna las predicciones de sentimiento para texto financiero.
 * (Licencia MIT para el modelo FinBERT).
 */

let classifierPromise = null;
let transformersPromise = null;

async function loadTransformers() {
  if (!transformersPromise) {
    transformersPromise = import('@xenova/transformers')
      .then((mod) => (mod && mod.pipeline ? mod : mod?.default || mod));
  }
  return transformersPromise;
}

/**
 * Obtiene o crea el clasificador FinBERT.
 */
async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const transformers = await loadTransformers();
      try {
        const pipeline = await transformers.pipeline('text-classification', 'ProsusAI/finbert');
        return pipeline;
      } catch (err) {
        console.warn('No se pudo cargar FinBERT; usando modelo sst-2 de respaldo', err);
        return await transformers.pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      }
    })();
  }
  return classifierPromise;
}

/**
 * Clasifica una noticia y devuelve etiquetas de sentimiento.
 * @param {string} text — El texto de la noticia (título + resumen).
 * @returns {Promise<{label: string, score: number}[]>}
 */
export async function classifySentiment(text) {
  const clf = await getClassifier();
  const result = await clf(text, { topk: 3 });
  return result;
}

export function resolveSentiment(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    return {
      label: 'neutral',
      score: 0.5,
      distribution: { bullish: 0, neutral: 0, bearish: 0 },
    };
  }

  const distribution = { bullish: 0, neutral: 0, bearish: 0 };
  for (const entry of predictions) {
    if (!entry) continue;
    const mapped = normalizeLabel(entry.label);
    const score = Number(entry.score) || 0;
    if (score > distribution[mapped]) {
      distribution[mapped] = score;
    }
  }

  const label = pickLabelFromDistribution(distribution);
  const score =
    label === 'bullish'
      ? distribution.bullish || Math.max(distribution.neutral, 0.5)
      : label === 'bearish'
        ? distribution.bearish || Math.max(distribution.neutral, 0.5)
        : Math.max(distribution.neutral, (distribution.bullish + distribution.bearish) / 2, 0.5);

  return { label, score, distribution };
}

function pickLabelFromDistribution({ bullish = 0, neutral = 0, bearish = 0 }) {
  const dominant = Math.max(bullish, neutral, bearish);
  const lean = bullish - bearish;
  const positiveIsTop = dominant === bullish;
  const negativeIsTop = dominant === bearish;
  const magnitude = Math.max(bullish, bearish);
  const neutralGap = dominant - neutral;

  if (positiveIsTop && bullish >= 0.48 && neutralGap >= 0.05) return 'bullish';
  if (negativeIsTop && bearish >= 0.48 && neutralGap >= 0.05) return 'bearish';

  if (Math.abs(lean) >= 0.18 && magnitude >= 0.34) {
    return lean > 0 ? 'bullish' : 'bearish';
  }

  if (neutral <= 0.42 && magnitude >= 0.32) {
    return lean >= 0 ? 'bullish' : 'bearish';
  }

  if (positiveIsTop && bullish > neutral + 0.08) return 'bullish';
  if (negativeIsTop && bearish > neutral + 0.08) return 'bearish';

  if (neutral < 0.38 && magnitude >= 0.28 && Math.abs(lean) >= 0.1) {
    return lean > 0 ? 'bullish' : 'bearish';
  }

  if (magnitude >= 0.52) {
    return bullish >= bearish ? 'bullish' : 'bearish';
  }

  return 'neutral';
}

function normalizeLabel(label) {
  if (!label) return 'neutral';
  const value = String(label).toLowerCase();
  if (value.includes('positive') || value.includes('bull')) return 'bullish';
  if (value.includes('negative') || value.includes('bear')) return 'bearish';
  return 'neutral';
}

/**
 * Clasifica una lista de noticias y añade campos 'sentimentLabel' y 'sentimentScore'.
 * @param {Array<{title: string, summaryHint: string}>} items
 * @returns {Promise<Array<any>>}
 */
export async function classifyNewsItems(items = []) {
  const clf = await getClassifier();
  const out = [];
  for (const item of items) {
    const text = `${item.title || ''}. ${item.summaryHint || ''}`.trim();
    const preds = await clf(text || item.title);
    const resolved = resolveSentiment(preds);
    out.push({ ...item, sentimentLabel: resolved.label, sentimentScore: resolved.score });
  }
  return out;
}
