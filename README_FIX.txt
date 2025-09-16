FIX: Netlify secrets scanning

## Actualización 2024: backend Express con GoldAPI

- Configura en Render (o el host donde corra `server/index.js`) las variables:
  - `GOLDAPI_KEY`, `GOLDAPI_BASE`, `SYMBOL`, `CSV_PATH`, `PORT` (opcional `GOLDAPI_TIMEOUT_MS`).
- El frontend ahora llama a `/api/spot`, `/api/historical` y `/api/update-csv`.
  - En Netlify (scope Builds) define `VITE_BACKEND_BASE` si el backend vive en otro dominio.
- Las claves ya **no se exponen** en el bundle del cliente; quedan en el backend.

Las notas originales del escaneo de secretos se mantienen debajo por si sigues usando
Netlify Functions heredadas.

1) Elimina cualquier archivo que establezca claves en el frontend:
   - BORRA si existen: /config.js (raíz) y /public/config.js
     (Si prefieres mantener /public/config.js, usa exactamente el que viene en este paquete; está vacío.)

2) Sustituye /index.html por el incluido (no carga config.js ni scripts con claves).

3) [LEGADO] Asegúrate de que el frontend NO utiliza import.meta.env.VITE_METALS_API_KEY ni VITE_API_BASE.
   En su lugar, llama a /.netlify/functions/metalprices (clave en Functions).

4) [LEGADO] Si el escaneo sigue señalando el CSV grande de /public/data, añade en Netlify (scope Builds):
     SECRETS_SCAN_OMIT_PATHS=public/data
   Esto SOLO omite el escaneo del CSV, no de otros archivos.

5) [LEGADO] Redeploy: Clear cache and deploy site.

Nota: [LEGADO] Si necesitas, vuelve a importar en Functions:
  API_BASE=https://TU_API_DE_METALPRICES/v1
  METALS_API_KEY=TU_CLAVE
  (y las vars de GitHub si usas update-csv)
