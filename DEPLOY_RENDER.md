# Despliegue EPÍTOME en Render (Blueprint)

1) Haz commit de `render.yaml` (raíz del repo) y sube a GitHub.
2) Ve a https://render.com → New + → "Blueprint" → conecta tu repo.
3) Render leerá `render.yaml` y creará el servicio **klevergold-epitome**.
4) Espera a que Build y Deploy terminen (plan FREE). Al final verás una URL:
   `https://klevergold-epitome.onrender.com` (o el subdominio que Render asigne).
5) Copia esa URL y, si es distinta, edita `public/config.js` → `window.EPITOME_API = "..."`.
6) Netlify (frontend) ya podrá llamar a `/forecast`, `/risk`, `/regime` en ese dominio.
7) Si Netlify usa dominio personalizado, puedes limitar CORS cambiando
   `EPITOME_ALLOWED_ORIGINS` en Render a tu dominio (en Settings → Environment).
