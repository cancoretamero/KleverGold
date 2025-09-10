import React, { useMemo, useRef, useEffect, useState } from 'react'

export default function CandleChart({ data, height = 420, engine = "auto", mode = "candlestick", fitNonce = 0 }) {
  const ref = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | kline | lwc | svg
  const key = useMemo(() => (data.length ? `${data[0].date.getTime()}-${data[data.length - 1].date.getTime()}` : "empty"), [data]);

  useEffect(() => {
    let chart = null;
    let disposeK = null;

    async function boot() {
      setStatus("loading");
      if (engine !== "lwc" && mode !== "area") {
        try {
          const k = await import("klinecharts");
          const { init, dispose } = k;
          if (!ref.current) return;
          chart = init(ref.current, { styles: { candle: { type: mode === "ohlc" ? "candle_stroke" : "candle_solid" } } });
          const series = data.map((d) => ({ timestamp: d.date.getTime(), open: d.open, high: d.high, low: d.low, close: d.close, volume: 0 }));
          chart.applyNewData(series);
          try { chart.setVisibleRange({ from: series[0].timestamp, to: series[series.length - 1].timestamp }); } catch (_) {}
          setStatus("kline");
          disposeK = () => { try { dispose(ref.current); } catch (_) {} };
          return;
        } catch (e) {}
      }
      try {
        const lib = await import("lightweight-charts");
        const createChart = lib.createChart ?? lib.default?.createChart;
        if (!createChart || !ref.current) throw new Error("LWC no disponible");
        chart = createChart(ref.current, {
          height,
          layout: { textColor: "#222", fontFamily: "Inter, ui-sans-serif, system-ui" },
          grid: { vertLines: { visible: false }, horzLines: { visible: true } },
          timeScale: { borderVisible: false },
          rightPriceScale: { borderVisible: false },
        });
        let s;
        if (mode === "area" && chart.addAreaSeries) {
          s = chart.addAreaSeries({});
          s.setData(data.map((d) => ({ time: Math.floor(d.date.getTime() / 1000), value: d.close })));
        } else if (mode === "ohlc") {
          const add = chart.addBarSeries ?? chart.addCandlestickSeries;
          s = add.call(chart, {});
          s.setData(data.map((d) => ({ time: Math.floor(d.date.getTime() / 1000), open: d.open, high: d.high, low: d.low, close: d.close })));
        } else {
          const add = chart.addCandlestickSeries ?? chart.addBarSeries;
          s = add.call(chart, {});
          s.setData(data.map((d) => ({ time: Math.floor(d.date.getTime() / 1000), open: d.open, high: d.high, low: d.low, close: d.close })));
        }
        try { chart.timeScale().fitContent(); } catch (_) {}
        setStatus("lwc");
        return;
      } catch (e) {}
      setStatus("svg");
    }

    boot();
    return () => {
      try { if (disposeK) disposeK(); } catch (_) {}
      try { if (chart && chart.remove) chart.remove(); } catch (_) {}
    };
  }, [key, engine, mode, height, fitNonce]);

  if (status === "svg") {
    return (
      <div className="w-full" style={{ height }}>
        <div className="text-xs text-amber-600 mb-2">Mostrando fallback SVG (librerías no disponibles).</div>
        <svg viewBox={`0 0 1000 ${height}`} className="w-full" style={{ height }}>
          {data.slice(0, 200).map((d, i) => {
            const x = 20 + i * 4;
            const mid = height / 2;
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={mid - 20} y2={mid + 20} stroke="#111" />
                <rect x={x - 1.5} y={mid - 10} width={3} height={20} fill={d.close >= d.open ? "#16a34a" : "#dc2626"} />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }
  return <div ref={ref} style={{ height }} className="w-full" />;
}
