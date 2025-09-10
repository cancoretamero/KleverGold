# Dashboard de Oro — listo para GitHub Pages

Proyecto React (Vite + Tailwind) con el dashboard de oro segmentado en componentes.
Incluye **workflow de GitHub Actions** para desplegar automáticamente a **GitHub Pages**.

## Cómo publicarlo en GitHub Pages (sin tocar código)

1. **Crea un repositorio nuevo en GitHub** (por ejemplo: `gold-dashboard`).  
2. **Sube todos los archivos** de este ZIP al repositorio (Botón *Add file → Upload files*).
3. En la pestaña **Actions**, es posible que tengas que pulsar **I understand my workflows... Enable Actions**.
4. Se ejecutará la acción **Deploy to GitHub Pages** que construye y publica `dist` en la rama **gh-pages**.
5. Ve a **Settings → Pages** y elige **Source: Deploy from branch** → Branch: `gh-pages` / `/root` → **Save**.
6. Tu web quedará disponible en `https://tu-usuario.github.io/<nombre-del-repo>/`.

> Nota: El CSV de ejemplo ya permite visualizar el dashboard. La parte de API es opcional.

## Poner tu clave de Metals API (opcional)
Tienes 2 opciones:

- **Rápida (pública):** edita `public/config.js` y pega tu clave en `window.METALS_API_KEY` (quedará visible).
- **A través de Secrets (más limpio):**
  1. En GitHub, ve a **Settings → Secrets and variables → Actions → New repository secret**.
  2. Crea el secreto **`VITE_METALS_API_KEY`** con tu clave.
  3. El workflow ya la inyecta al build y quedará embebida en el JS de producción.

## Cambios por secciones (cómo pedírmelos)
Está todo organizado para trabajar “quirúrgicamente”. Pídeme cambios citando **ruta del archivo** y la **sección**:
- `src/components/GoldCsvDashboard.jsx` → Composición de la página y lógica principal.
- `src/components/CandleChart.jsx` → Gráfico de velas (KLine → Lightweight → SVG fallback).
- `src/components/Kpi.jsx` → Tarjetas KPI.
- `src/components/TopTable.jsx` → Tabla “Top días por rango”.
- `src/components/CsvLoader.jsx` → Cargador de CSV manual.
- `src/utils.js` → Utilidades (parseo numérico, fechas, agregados, cuantil, enumeración de días, etc.).
- `src/api.js` → Adaptador de Metals API (pedidos por día + secuencial con delay).
- `src/storage.js` → Persistencia en `localStorage` y utilidades de mapeo por fecha.
- `src/config.js` → CONFIG general (ruta CSV, símbolo, base API, delays ...).

También puedes decir: *"toca el histograma en `utils.js` para..."* o
*"añade en `GoldCsvDashboard.jsx` un selector nuevo..."*. Yo te envío el parche preciso.

## Ejecutarlo en local (opcional)
Si más adelante quieres abrirlo en tu ordenador:
```bash
npm install
npm run dev
```

---

### Créditos
- React + Vite
- Tailwind CSS
- Recharts
- klinecharts / lightweight-charts
- PapaParse


---
**Nota:** Este paquete incluye tu CSV y la clave de MetalsAPI inyectada en `public/config.js`.
