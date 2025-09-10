
import { CreateMLCEngine } from "@mlc-ai/web-llm";

let enginePromise = null;

export async function initWebLLM(onProgress) {
  if (!enginePromise) {
    enginePromise = CreateMLCEngine(
      { model: "Qwen2-1.5B-Instruct-q4f16_1-MLC" },
      { initProgressCallback: (p) => onProgress?.(p) }
    );
  }
  return enginePromise;
}

export async function assessWithWebLLM(title, summary = "") {
  const engine = await initWebLLM();
  const sys = `Eres analista de materias primas. Evalúa si la noticia puede mover el precio spot del oro (XAUUSD) en 1–7 días. Devuelve SOLO JSON:
{"impact":"alto|medio|bajo","sentiment":"alcista|bajista|neutro","confidence":0-1,"reason":"","topics":[]}`;
  const user = `Titular: "${title}"
Resumen: "${summary}"`;
  const out = await engine.chat.completions.create({
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    stream: false,
    temperature: 0.2,
  });
  const txt = out.choices?.[0]?.message?.content || "{}";
  const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
  return JSON.parse(txt.slice(s, e + 1));
}
