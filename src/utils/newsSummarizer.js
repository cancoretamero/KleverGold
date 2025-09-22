/**
 * newsSummarizer.js
 * This module provides functions to summarize long news articles using
 * transformer-based models. It uses the @xenova/transformers library to load
 * a summarization pipeline (DistilBART CNN 6-6 model) that produces concise
 * summaries. If the preferred model fails to load (e.g. due to network issues),
 * the code falls back to T5-small summarizer. All functions return plain
 * JavaScript objects and are asynchronous.
 *
 * License: Apache-2.0 (same as models used).
 */

let summarizerInstance = null;

/**
 * Lazy-load the transformers module. The @xenova/transformers library can
 * run entirely in the browser/Node environment without requiring a Python backend.
 * If the local import fails, we use a CDN fallback. This mirrors the pattern
 * used in newsMoE.js.
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
 * Initialise the summarization pipeline. By default we load the DistilBART
 * CNN 6-6 model, which is a light-weight variant of BART trained for abstractive
 * summarization on CNN/DailyMail. This function caches the pipeline once loaded.
 */
async function loadSummarizer() {
  if (summarizerInstance) {
    return summarizerInstance;
  }
  const { pipeline } = await loadTransformersModule();
  try {
    summarizerInstance = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', { progress_callback: null });
  } catch (err) {
    console.warn('Failed to load distilbart summarizer, falling back to t5-small:', err);
    summarizerInstance = await pipeline('summarization', 'Xenova/t5-small', { progress_callback: null });
  }
  return summarizerInstance;
}

/**
 * Summarize a single piece of text. You may provide optional parameters
 * such as maxLength or minLength to control the summary length. Default values
 * follow the common practice of 130 tokens for maximum length and 30 tokens for
 * minimum length. The result is the summary string.
 *
 * @param {string} text - The input text to summarize.
 * @param {Object} opts - Optional configuration (maxLength, minLength).
 * @returns {Promise<string>} - The summarized text.
 */
export async function summarize(text, opts = {}) {
  const summarizer = await loadSummarizer();
  const { maxLength = 130, minLength = 30 } = opts;
  const outputs = await summarizer(text, { max_length: maxLength, min_length: minLength });
  // The transformers.js pipeline returns an array of objects with a summary_text
  // property when using summarization. On fallback models, the structure might
  // differ slightly, so we normalise it.
  const result = Array.isArray(outputs) ? outputs[0] : outputs;
  return result?.summary_text ?? result?.generated_text ?? String(result);
}

/**
 * Given an array of news items (objects with a content or description field),
 * return a new array where each item includes a 'summary' property containing
 * the generated summary. This helper is convenient for batch processing of RSS
 * feed entries.
 *
 * @param {Array<Object>} items - Array of news objects with content fields.
 * @param {Object} opts - Optional configuration for summary lengths.
 * @returns {Promise<Array<Object>>} - Array with added summary fields.
 */
export async function summarizeNewsItems(items, opts = {}) {
  const results = [];
  for (const item of items) {
    const content = item.content || item.description || item.summary || item.title || '';
    const summary = content ? await summarize(content, opts) : '';
    results.push({ ...item, summary });
  }
  return results;
}
