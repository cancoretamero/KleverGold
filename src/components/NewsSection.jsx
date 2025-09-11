import React, { useEffect, useState } from 'react';
import GoldNewsCarousel from './GoldNewsCarousel.jsx';

export default function NewsSection() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/.netlify/functions/news', { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!alive) return;
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="p-4 rounded bg-gray-50 border text-gray-700">Cargando noticias…</div>;
  }
  if (error) {
    return (
      <div className="p-4 rounded bg-rose-50 border border-rose-200 text-rose-800">
        No se pudieron cargar las noticias: {String(error.message || error)}
      </div>
    );
  }
  if (!items?.length) {
    return <div className="p-4 rounded bg-gray-50 border text-gray-700">No hay noticias por ahora.</div>;
  }
  try {
    return <GoldNewsCarousel title="Titulares de Oro" endpoint="/.netlify/functions/news" />;
  } catch {
    return (
      <div className="space-y-2">
        {items.slice(0, 8).map((it, i) => (
          <a key={i} className="block p-3 rounded border hover:bg-gray-50" href={it.url} target="_blank" rel="noreferrer">
            <div className="text-sm text-gray-500">{it.source}</div>
            <div className="font-medium text-gray-900">{it.title}</div>
          </a>
        ))}
      </div>
    );
  }
}
