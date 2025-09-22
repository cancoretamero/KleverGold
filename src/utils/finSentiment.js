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
    const best = preds && preds[0] ? preds[0] : { label: 'neutral', score: 0 };
    let label = best.label || '';
    const score = best.score || 0;
    const lower = label.toLowerCase();
    const sentimentLabel = lower.includes('positive') ? 'bullish'
      : lower.includes('negative') ? 'bearish'
      : 'neutral';
    out.push({ ...item, sentimentLabel, sentimentScore: score });
  }
  return out;
}
