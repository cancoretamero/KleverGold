/**
 * newsBias.js
 *
 * This module provides functions to classify the ideological or market bias
 * of news texts via zero-shot classification. It leverages the HuggingFace
 * `facebook/bart-large-mnli` model (via Xenova's JS port) for zero-shot
 * classification. If the base model fails to load, it falls back to a smaller
 * NLI model. The classification labels can be customised by the caller.
 *
 * The default set of labels includes political and economic biases such as
 * "liberal", "conservative", "center", "pro-market", "anti-market" and "neutral".
 * The function returns the highest scoring label along with its confidence.
 */

let classifierInstance = null;

/**
 * Lazy-load the transformers module. If the local import fails (e.g. the
 * dependency is not installed in the environment), we fall back to a CDN
 * hosted version. This mirrors the approach used in other utility modules.
 */
async function loadTransformersModule() {
  try {
    return await import('@xenova/transformers');
  } catch (err) {
    console.warn('Falling back to CDN for transformers:', err);
    return await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.2/dist/transformers.min.js');
  }
}

/**
 * Initialise the zero-shot classification pipeline. We attempt to load the
 * `facebook/bart-large-mnli` model first since it performs well on a wide
 * range of tasks. If that fails (e.g. due to network issues), we load a
 * smaller NLI model `nli-roberta-base-v2`. The pipeline is cached after
 * initialisation.
 */
async function loadClassifier() {
  if (classifierInstance) {
    return classifierInstance;
  }
  const { pipeline } = await loadTransformersModule();
  try {
    classifierInstance = await pipeline('zero-shot-classification', 'Xenova/facebook-bart-large-mnli', { progress_callback: null });
  } catch (err) {
    console.warn('Failed to load bart-large-mnli, falling back to nli-roberta-base-v2:', err);
    classifierInstance = await pipeline('zero-shot-classification', 'Xenova/nli-roberta-base-v2', { progress_callback: null });
  }
  return classifierInstance;
}

/**
 * Classify the bias of a single piece of text using zero-shot classification.
 * You can provide a custom array of candidate labels. The result includes
 * the top label and its confidence score.
 *
 * @param {string} text - The text to classify.
 * @param {Array<string>} candidateLabels - Optional labels to use for classification.
 * @returns {Promise<{label: string, score: number}>} - The top label and score.
 */
export async function classifyBias(text, candidateLabels = ['liberal', 'conservative', 'center', 'pro-market', 'anti-market', 'neutral']) {
  const classifier = await loadClassifier();
  const output = await classifier(text, candidateLabels);
  // The output contains labels and scores arrays; pick the highest scoring one
  const topLabel = output.labels[0];
  const topScore = output.scores[0];
  return { label: topLabel, score: topScore };
}

/**
 * Classify the bias for an array of news items. Each item should have a
 * `content`, `description` or `title` property containing text to analyse.
 * The function returns a new array with added `bias` and `biasScore` fields.
 *
 * @param {Array<Object>} items - The news items to classify.
 * @param {Array<string>} candidateLabels - Optional labels for classification.
 * @returns {Promise<Array<Object>>} - Items with bias annotations.
 */
export async function classifyNewsBias(items, candidateLabels) {
  const results = [];
  for (const item of items) {
    const text = item.content || item.description || item.summary || item.title || '';
    let biasInfo;
    if (text) {
      biasInfo = await classifyBias(text, candidateLabels ?? ['liberal', 'conservative', 'center', 'pro-market', 'anti-market', 'neutral']);
    } else {
      biasInfo = { label: 'unknown', score: 0 };
    }
    results.push({ ...item, bias: biasInfo.label, biasScore: biasInfo.score });
  }
  return results;
}
