FIX: Netlify secrets scanning

1) Elimina cualquier archivo que establezca claves en el frontend:
   - BORRA si existen: /config.js (raíz) y /public/config.js
     (Si prefieres mantener /public/config.js, usa exactamente el que viene en este paquete; está vacío.)

2) Sustituye /index.html por el incluido (no carga config.js ni scripts con claves).

3) Asegúrate de que el frontend NO utiliza import.meta.env.VITE_METALS_API_KEY ni VITE_API_BASE.
   En su lugar, llama a /.netlify/functions/metalprices (clave en Functions).

4) Si el escaneo sigue señalando el CSV grande de /public/data, añade en Netlify (scope Builds):
     SECRETS_SCAN_OMIT_PATHS=public/data
   Esto SOLO omite el escaneo del CSV, no de otros archivos.

5) Redeploy: Clear cache and deploy site.

Nota: Si necesitas, vuelve a importar en Functions:
  API_BASE=https://TU_API_DE_METALPRICES/v1
  METALS_API_KEY=TU_CLAVE
  (y las vars de GitHub si usas update-csv)
