# Dashboard de Oro — Aisa Group (React + Vite + Tailwind)

> **Versión:** 2025-09-10 · **Estado:** Producción interna · **Licencia:** *AISA Group CA – Internal Use License (estricta)*

Este repositorio contiene un **dashboard profesional para análisis de oro (XAUUSD)** con:
- **Capa de datos cache-first:** usa un **CSV limpio** como fuente principal y **completa huecos vía Metals API** con persistencia en `localStorage`.
- **Visualización avanzada:** velas (KLine → Lightweight → SVG fallback), series y comparativas anuales/mensuales con **Recharts**.
- **Despliegue 1‑clic a GitHub Pages** a través de **GitHub Actions**.
- **Proyecto segmentado** por módulos para solicitar cambios “quirúrgicos” con la máxima granularidad.

---

## 🧭 Índice
1. [TL;DR (publicar sin tocar código)](#tldr-publicar-sin-tocar-código)
2. [Arquitectura y flujo de datos](#arquitectura-y-flujo-de-datos)
3. [Estructura del repositorio](#estructura-del-repositorio)
4. [Configuración](#configuración)
5. [Formato del CSV](#formato-del-csv)
6. [Componentes (para pedirme cambios por secciones)](#componentes-para-pedirme-cambios-por-secciones)
7. [Analítica y KPIs](#analítica-y-kpis)
8. [Gráficos y motores](#gráficos-y-motores)
9. [Despliegue a GitHub Pages](#despliegue-a-github-pages)
10. [Seguridad, privacidad y límites](#seguridad-privacidad-y-límites)
11. [Solución de problemas](#solución-de-problemas)
12. [Sobre Aisa Group](#sobre-aisa-group)
13. [Créditos de terceros](#créditos-de-terceros)
14. [Licencia](#licencia)

---

## ⚡ TL;DR (publicar sin tocar código)
1. Crea **un repositorio** en GitHub (p. ej. `gold-dashboard`).  
2. **Sube** los archivos del ZIP tal cual.  
3. En **Actions**, habilita el flujo si te lo pide. Se ejecutará **Deploy to GitHub Pages**.  
4. En **Settings → Pages**, selecciona **Source: Deploy from branch → `gh-pages`** y guarda.  
5. Tu web quedará disponible en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

> El proyecto trae un **CSV real** en `public/data/xauusd_ohlc_clean.csv` (el que adjuntaste) y la **clave de Metals API** ya está configurada en `public/config.js`.  
> Si deseas ocultar la clave, usa **GitHub Actions Secrets** (ver [Configuración](#configuración)).

---

## 🏗️ Arquitectura y flujo de datos
**Cache-first sobre CSV** + **API incremental**:
- Carga el CSV (campo `date, open, high, low, close`), **sanitiza** y **ordena** por fecha.
- Calcula KPIs y gráficas sobre el **rango activo** (presets: `1m, 3m, 6m, YTD, 1y, 5y, MAX, custom`).
- **Detecta huecos** día a día dentro del rango y permite **“Completar huecos”** (n llamadas = n huecos) a **Metals API** (endpoint OHLC por día).  
  - Rate‑limit controlado por `REQUEST_DELAY_MS` (1100 ms por defecto).
  - **Persistencia** de nuevos días en `localStorage` para no re-pedirlos.
- Gráficos: velas (KLine → Lightweight → **fallback SVG**) + series/columnas con Recharts.

**Módulos clave**:
- `src/utils.js`: parseo robusto de números internacionales, fechas (UTC), agregados y cuantiles.
- `src/api.js`: adaptador Metals API (día a día + delay secuencial).
- `src/storage.js`: persistencia y utilidades de mapeo por fecha.
- `src/components/*`: UI desacoplada y reutilizable.

---

## 🗂️ Estructura del repositorio
```text
.
├─ public/
│  ├─ config.js                # window.METALS_API_KEY = "…"
│  └─ data/xauusd_ohlc_clean.csv
├─ src/
│  ├─ components/
│  │  ├─ GoldCsvDashboard.jsx  # Lógica principal y layout
│  │  ├─ CandleChart.jsx       # KLine → LWC → SVG fallback
│  │  ├─ Kpi.jsx               # Tarjetas KPI
│  │  ├─ TopTable.jsx          # Top días por rango
│  │  └─ CsvLoader.jsx         # Cargador manual de CSV
│  ├─ api.js                   # Metals API (secuencial con delay)
│  ├─ utils.js                 # Parseo, tiempos, agregación, cuantiles
│  ├─ storage.js               # localStorage + helpers por fecha
│  ├─ config.js                # CONFIG del app (CSV_URL, SYMBOL…)
│  ├─ main.jsx / App.jsx       # Bootstrap React
│  └─ index.css                # Tailwind
├─ .github/workflows/deploy.yml # Build & deploy a GitHub Pages
├─ index.html                   # Carga ./config.js (ruta relativa)
├─ package.json, vite.config.js, tailwind.config.js, postcss.config.js
└─ LICENSE                      # Licencia estricta AISA Group
```

---

## ⚙️ Configuración
### Clave de Metals API
- **Pública (rápida):** `public/config.js` ya contiene tu clave en `window.METALS_API_KEY`. **Visible** en el navegador.
- **Oculta (recomendada):** define el secreto `VITE_METALS_API_KEY` en:
  `Settings → Secrets and variables → Actions → New repository secret`  
  El workflow lo inyecta sólo en **build**.

### Ajustes del app (`src/config.js`)
- `CSV_URL`: ruta del CSV (relativa para GitHub Pages, por defecto `data/xauusd_ohlc_clean.csv`).
- `SYMBOL`: `XAUUSD`.
- `API_BASE`: `https://metals-api.com/api`.
- `API_KEY`: se resuelve en orden: `VITE_METALS_API_KEY` (build) → `import.meta.env` → `window.METALS_API_KEY` (runtime).
- `REQUEST_DELAY_MS`: retardo entre llamadas para evitar rate‑limit.

---

## 🧾 Formato del CSV
- Cabeceras requeridas: **`date, open, high, low, close`**.  
  Alias aceptados (`Open/High/Low/Close`, `Date|timestamp|time`).
- **Fechas en UTC (YYYY‑MM‑DD)**. Sin horas.
- Números con **coma o punto** como separador decimal; se limpian miles (`3.659,13` → `3659.13`).

---

## 🧩 Componentes (para pedirme cambios por secciones)
- `GoldCsvDashboard.jsx` · Composición general, presets de rango, KPIs del rango activo, comparativas y exploradores.
- `CandleChart.jsx` · Motor de velas con **orden de preferencia**: *KLine → Lightweight → SVG fallback*.
- `Kpi.jsx` · Cartas de métrica.
- `TopTable.jsx` · Tabla “Top días por rango” (global al rango activo).
- `CsvLoader.jsx` · Cargador manual de CSV (merge con lo ya cargado).

**Ejemplos de petición:**  
“Añade un KPI con volatilidad semanal en `GoldCsvDashboard.jsx`” ·  
“Cambia el motor por defecto a Lightweight en `CandleChart.jsx`” ·  
“Sube el filtro de outliers a p99.5 en `utils.js`”.

---

## 📈 Analítica y KPIs
- **Rango activo**: filtro por presets (`1m, 3m, 6m, YTD, 1y, 5y, MAX`) o fechas personalizadas.
- **Variación diaria**: `range = high − low`.
- **KPIs del rango**: media de `range`, máximo (y fecha), “mes más volátil” por media mensual de `range`, nº de días.
- **Filtro de outliers p99** (opcional) para estudios anual/mensual.
- **Comparativas mensuales**: media o mediana por mes y año seleccionado.
- **Explorador diario**: detalles del día clicado (OHLC + rango).

---

## 📊 Gráficos y motores
- **Velas**: intenta **KLine**; si no está disponible, usa **Lightweight**; si falla todo, **SVG fallback** sin dependencias.
- **Recharts** para series/columnas (brush, legendas, referencias, etc.).
- **Downsampling** configurable (por defecto 3.000 puntos) para fluidez.

---

## 🚀 Despliegue a GitHub Pages
- Workflow en `.github/workflows/deploy.yml`:
  - `npm ci` → `npm run build` → publica `dist` en rama **`gh-pages`**.
- `vite.config.js` usa `base: './'` para funcionar en subcarpeta.
- **Secrets opcionales**: `VITE_METALS_API_KEY`.

---

## 🔐 Seguridad, privacidad y límites
- No expongas información sensible en `public/` (se sirve tal cual).
- **Rate‑limits** de Metals API: respetados con `REQUEST_DELAY_MS` al completar huecos.
- Los datos añadidos vía API se guardan en `localStorage` del navegador.

---

## 🧯 Solución de problemas
- **Página en blanco en GitHub Pages** → revisa que “Pages” apunta a `gh-pages / (root)` y que `vite.config.js` tiene `base: './'`.
- **No carga CSV** → ruta relativa correcta (`data/xauusd_ohlc_clean.csv`) y mayúsculas exactas en nombres de archivo.
- **Clave API no detectada** → usa secreto `VITE_METALS_API_KEY` o define `window.METALS_API_KEY` en `public/config.js`.
- **Gaps no bajan** → revisa el período activo y los permisos/cuotas de tu cuenta en Metals API.

---

## 🏢 Sobre Aisa Group
**Aisa Group** es un grupo **familiar** con base en **Canadá**, con operaciones globales en **minería, energías renovables, cárnicos, pesca y mariscos, productos agrícolas y real estate**.  
- **Presencia**: Canadá, EE. UU., Argentina, Reino Unido, España, India y China.  
- **Orígenes**: Inició hace más de dos décadas con exportación de vino a China desde Castilla‑La Mancha y se convirtió en actor destacado en Europa Central (vino) entre 2016–2022.  
- **Minería**: En 2023 adquirió **Minas Argentinas S.A. (Gualcamayo)** en San Juan, Argentina; reactivó exploración y planifica el **Deep Carbonates Project** (~120k oz/año durante ≥17 años según planes).  
- **Energía**: Proyectos fotovoltaicos en Argentina (e.g., **Calicanto Solar**).  
- **Pesca**: En 2025 adquirió **Cabo Vírgenes S.A.** (Rawson, Chubut; exporta a +50 países).  
- **Contacto**: `contact@aisagroup.ca` · `+1 (312) 285‑8599` · Web: https://www.aisagroup.ca

> Fuente pública corporativa: sección *Who are we*, *History*, *Divisions* y *News* del sitio oficial de Aisa Group.

---

## 🙌 Créditos de terceros
- **React**, **Vite**, **Tailwind CSS**  
- **Recharts**, **klinecharts**, **lightweight-charts**  
- **PapaParse**, **lucide-react**  
Cada dependencia se rige por su **propia licencia**.

---

## 📜 Licencia
Este proyecto está bajo **AISA Group CA — Internal Use License (estricta)** incluida en `LICENSE`.  
> **Resumen**: uso **exclusivo interno** por Aisa Group y afiliadas; **prohibida** redistribución, sublicencia, uso por terceros, publicación, entrenamiento de modelos o benchmarking externo. El código se proporciona **“tal cual”** sin garantías. Dependencias de terceros mantienen sus licencias originales.
