# Actualización: Selector de años compacto + carrusel de KPIs (Netlify/Vite fixes)

Este ZIP incluye los archivos listos para pegar en tu repo. Además, te indico cómo aplicar los cambios parciales de `GoldCsvDashboard.jsx` e `index.html`.

## Archivos nuevos
- `src/components/YearGroupSelector.jsx`
- `src/components/HScrollCarousel.jsx`

## Archivos para sustituir (si quieres hacerlo directamente)
- `vite.config.js` (base relativa para Netlify/raíz)
- `netlify.toml` (build sin lockfile y redirección SPA)
- `index.html` de ejemplo con la línea correcta para `config.js` + la línea de Vite intacta.

> Si tu `index.html` ya tiene más contenido/meta, **no lo reemplaces entero**: solo asegúrate de dejar estas dos líneas tal cual:
>
> ```html
> <script src="/config.js" defer></script>
> <script type="module" src="/src/main.jsx"></script>
> ```

## Cambios a aplicar en `src/components/GoldCsvDashboard.jsx`

1) **Añade estos imports (cerca del resto):**
```js
import YearGroupSelector from './YearGroupSelector.jsx'
import HScrollCarousel from './HScrollCarousel.jsx'
```

2) **Sustituye el bloque de controles de años** (el `<div className="flex flex-wrap items-end gap-3"> ... </div>` que está justo encima del comentario `/* Resumen por año seleccionado */`) **por este**:
```jsx
<div className="space-y-3">
  <YearGroupSelector
    years={yearsAvailable}
    selectedYears={selectedYears}
    onChange={(ys) => setSelectedYears(ys)}
  />
  <div className="flex items-center gap-2 justify-end">
    <label className="text-xs text-gray-500">Año foco</label>
    <select value={yearFocus ?? ''} onChange={(e) => setYearFocus(Number(e.target.value))} className="px-2 py-1.5 rounded-md border text-sm">
      {yearsAvailable.map((y) => (<option value={y} key={y}>{y}</option>))}
    </select>
    <label className="text-xs text-gray-500">Mes</label>
    <select value={monthFocus ?? ''} onChange={(e) => setMonthFocus(Number(e.target.value))} className="px-2 py-1.5 rounded-md border text-sm">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<option key={m} value={m}>{String(m).padStart(2, '0')}</option>))}
    </select>
    <label className="text-xs text-gray-500 inline-flex items-center gap-1">
      <input type="checkbox" className="accent-indigo-600" checked={filterOutliers} onChange={(e) => setFilterOutliers(e.target.checked)} />
      Filtro outliers p99
    </label>
  </div>
</div>
```

3) **Convierte el grid de KPIs por año en carrusel**. Justo debajo del comentario `/* Resumen por año seleccionado */`, reemplaza el contenedor:
```jsx
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  {selectedYears.map((y) => { ... })}
</div>
```
por:
```jsx
<HScrollCarousel itemWidth={280} ariaLabel="KPIs por año">
  {selectedYears.map((y) => {
    const s = yearSummaries.get(y)
    if (!s) return null
    return (
      <Kpi
        key={y}
        icon={Gauge}
        label={`Media diaria ${y}`}
        value={s.avg.toFixed(2)}
        hint={`Días: ${s.days} · Máx: ${s.maxRow.range.toFixed(2)} (${s.maxRow.date.toISOString().slice(0,10)})`}
      />
    )
  })}
</HScrollCarousel>
```

> **Importante:** No toques la rejilla de KPIs del **rango activo** del principio. Solo se cambia la sección "KPIs por año".

## Checklist rápido
- [x] `src/components/YearGroupSelector.jsx` pegado
- [x] `src/components/HScrollCarousel.jsx` pegado
- [x] Imports + reemplazos en `GoldCsvDashboard.jsx`
- [x] `index.html` con `/config.js` + `defer`
- [x] `vite.config.js` con `base: './'`
- [x] `netlify.toml` con `npm install`

## Nota Netlify / Vite
Si más adelante añades `package-lock.json`, puedes volver a `npm ci && npm run build` en `netlify.toml`.
Asegúrate de tener `public/config.js` presente para que `<script src="/config.js" defer></script>` lo sirva estáticamente.

## Variables de entorno necesarias

El backend Express y los helpers de `src/utils` ya no incluyen claves embebidas para los servicios externos. Antes de ejecutar el servidor local (`npm run dev` en `server`) o desplegar en plataformas como Render/Netlify, define estas variables de entorno:

- `NEWS_API_KEY`: clave de [NewsAPI](https://newsapi.org/) para obtener titulares relacionados con el oro.
- `UNSPLASH_ACCESS_KEY`: clave pública de [Unsplash](https://unsplash.com/developers) para buscar imágenes.

Los archivos de ejemplo `.env` (`env.builds`, `env.functions`) incluyen las variables vacías para que añadas los valores correctos en tu entorno seguro. Si alguna de estas claves falta en tiempo de ejecución, las rutas `/api/news` y `/api/images` responderán con un HTTP 502 indicando que el servicio no está configurado.
