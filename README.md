# Animetrix — animetrix.lat

Web de streaming de películas, series y anime, lista para **Vercel** (sin PHP, sin base de datos).
El reproductor y el catálogo vienen de la API de InkaFlix.

## Estructura

```
public/          ← web estática (index.html, CSS, JS, logo)
api/data.js      ← proxy seguro hacia InkaFlix (la API key nunca llega al navegador)
api/ver.js       ← página del reproductor (/ver?t=movie&id=950387)
lib/             ← cliente de la API, validación, plantilla HTML
vercel.json      ← rutas y cabeceras de seguridad
```

## Activar en Vercel (una sola vez)

1. Entra a <https://vercel.com/new> con tu cuenta de GitHub.
2. Importa el repo **jittervpn/Animetrix** (si no aparece: *Adjust GitHub App Permissions* y dale acceso).
3. En **Environment Variables** agrega:
   - `INKAFLIX_KEY` = tu API key de InkaFlix
4. Pulsa **Deploy**.
5. Dominio: *Project → Settings → Domains* → agrega `animetrix.lat` y `www.animetrix.lat`,
   y copia en tu proveedor del dominio los registros DNS que Vercel te muestre
   (normalmente `A @ 76.76.21.21` y `CNAME www cname.vercel-dns.com`).

Desde ahí, cada cambio que se suba a `main` se publica automáticamente.

## Variables de entorno

| Variable | Uso |
|---|---|
| `INKAFLIX_KEY` | **Obligatoria.** API key de InkaFlix |
| `TMDB_KEY` | API key de TMDB (gratis): activa rating, géneros, fondos y duración |
| `INKAFLIX_VIEW_KEY` | Key del reproductor, si es distinta (la que sale en el enlace del panel) |
| `INKAFLIX_EMBED_PATH` | Ruta del reproductor (por defecto `/public/e/`) |
| `PLAYER_SANDBOX` | `1` bloquea pop-ups de anuncios del reproductor (si el video no carga, quítala) |
| `INKAFLIX_DEMO` | `1` muestra datos de ejemplo sin conectar a InkaFlix |
| `SITE_HOST` | Dominio del sitio (por defecto `animetrix.lat`) |

## Seguridad incluida

- La API key solo vive en las variables de entorno de Vercel: no está en el código ni en el repo.
- Las consultas a InkaFlix se hacen desde el servidor con `Authorization: Bearer`.
- `/api/data`: solo GET, acciones y tipos en lista blanca, parámetros validados, límite de
  peticiones por IP, rechazo de peticiones de otros sitios, errores sin detalles internos.
- Respuestas filtradas: solo salen campos conocidos; imágenes únicamente de `image.tmdb.org`.
- Caché en la CDN de Vercel (menos llamadas a la API y más velocidad).
- Cabeceras: CSP estricta (solo se permiten iframes de `api.inkaflix.space`), HSTS, nosniff,
  anti-clickjacking, Permissions-Policy.
- El frontend no usa `innerHTML` con datos: todo el texto se inserta con `textContent`.

> El enlace del reproductor (`/e/...?view_key=`) necesariamente lleva la key en el `src` del iframe.
> Por eso la key debe estar **restringida al dominio `animetrix.lat`** en el panel de InkaFlix.
> Si se filtra: **Revocar**, generar otra y cambiar `INKAFLIX_KEY` en Vercel (y *Redeploy*).

## Probar en tu PC

```bash
npm run dev          # http://localhost:3000 con datos de ejemplo
```

Si cambias `lib/layout.js`, ejecuta `npm run build:html` para regenerar `public/index.html`.
