# Animetrix — animetrix.lat

Web de streaming de películas, series y anime, lista para **Vercel** (sin PHP, sin base de datos).
El reproductor y el catálogo vienen de la API de InkaCat.

## Estructura

```
src/                  ← código fuente del frontend (app.js, app.css)
public/               ← web estática generada (index.html, assets con hash, fuentes)
api/data.js           ← proxy seguro hacia InkaCat y AnimetrixLat (las keys nunca llegan al navegador)
api/ver.js            ← página del reproductor (/ver?t=movie&id=950387 o /ver?atx=<id>)
lib/inkaflix.js       ← cliente de la API de InkaCat (catálogo principal)
lib/animetrixlat.js   ← cliente de tu API de AnimetrixLat (catálogo en paralelo, por "group")
lib/                  ← validación, plantilla HTML, interruptores
vercel.json           ← rutas y cabeceras de seguridad
```

## Catálogo de AnimetrixLat (en paralelo a InkaCat)

Además del catálogo de InkaCat, el sitio suma el de tu propia API
([animetrixlat.vercel.app/docs](https://animetrixlat.vercel.app/docs)). No lo reemplaza, se agrega.

- **Títulos con TMDB ID** (los que tienen TMDB en tu panel): entran igual que los de InkaCat, por
  `/api/v1/catalog` y `/api/v1/title` de tu API. Usan la misma ficha (Mi lista, Compartir, temporadas),
  el mismo reproductor `/ver?t=…&id=…` con modo cine y Seguir viendo, el aviso del bot de Telegram
  (estreno y episodios nuevos) y las notificaciones de la app. Si un título está en las dos fuentes,
  se muestra una sola vez: tus episodios se reproducen con tu reproductor y el resto con el de InkaCat.
- **Contenido sin TMDB**: se agrupa por serie (o por título) y aparece en Películas/Series/Anime con
  su ficha simple (`#/atx-titulo/…`) y reproductor `/ver?atx=<id>`.
- Si tu API exige clave (`x-api-key`), configúrala en `ATX_API_KEY`; vive solo en el servidor.
- Si tu API no responde, el sitio sigue funcionando solo con InkaCat.
- `/prueba-api` (oculta) sigue sirviendo para depurar la respuesta cruda de tu API.

Si cambias `ATX_API_BASE` a un dominio propio, actualiza también ese origen en el `frame-src` de
`lib/http.js` y `vercel.json`.

## Activar en Vercel (una sola vez)

1. Entra a <https://vercel.com/new> con tu cuenta de GitHub.
2. Importa el repo **jittervpn/Animetrix** (si no aparece: *Adjust GitHub App Permissions* y dale acceso).
3. En **Environment Variables** agrega:
   - `INKAFLIX_KEY` = tu API key de InkaCat
4. Pulsa **Deploy**.
5. Dominio: *Project → Settings → Domains* → agrega `animetrix.lat` y `www.animetrix.lat`,
   y copia en tu proveedor del dominio los registros DNS que Vercel te muestre
   (normalmente `A @ 76.76.21.21` y `CNAME www cname.vercel-dns.com`).

Desde ahí, cada cambio que se suba a `main` se publica automáticamente.

## Variables de entorno

| Variable | Uso |
|---|---|
| `INKAFLIX_KEY` | **Obligatoria.** API key de InkaCat |
| `TMDB_KEY` | API key de TMDB (gratis): activa rating, géneros, fondos y duración |
| `INKAFLIX_VIEW_KEY` | Key del reproductor, si es distinta (la que sale en el enlace del panel) |
| `INKAFLIX_EMBED_PATH` | Ruta del reproductor (por defecto `/public/e/`) |
| `PLAYER_SANDBOX` | Por defecto el reproductor va aislado (bloquea pop-ups y redirecciones de anuncios). `0` lo desactiva para todos |
| `INKAFLIX_DEMO` | `1` muestra datos de ejemplo sin conectar a InkaCat |
| `ATX_API_BASE` | Opcional. Base de tu API de AnimetrixLat (por defecto `https://animetrixlat.vercel.app`) |
| `ATX_API_KEY` | Opcional. Clave `atx_…`, solo si tu API tiene activado "Exigir clave de API" |
| `SITE_HOST` | Dominio del sitio (por defecto `animetrix.lat`) |

## Seguridad incluida

- La API key solo vive en las variables de entorno de Vercel: no está en el código ni en el repo.
- Las consultas a InkaCat se hacen desde el servidor con `Authorization: Bearer`.
- `/api/data`: solo GET, acciones y tipos en lista blanca, parámetros validados, límite de
  peticiones por IP, rechazo de peticiones de otros sitios, errores sin detalles internos.
- Respuestas filtradas: solo salen campos conocidos; imágenes únicamente de `image.tmdb.org`.
- Caché en la CDN de Vercel (menos llamadas a la API y más velocidad).
- Cabeceras: CSP estricta (solo se permiten iframes de `api.inkaflix.space`), HSTS, nosniff,
  anti-clickjacking, Permissions-Policy.
- El frontend no usa `innerHTML` con datos: todo el texto se inserta con `textContent`.

> El enlace del reproductor (`/e/...?view_key=`) necesariamente lleva la key en el `src` del iframe.
> Por eso la key debe estar **restringida al dominio `animetrix.lat`** en el panel de InkaCat.
> Si se filtra: **Revocar**, generar otra y cambiar `INKAFLIX_KEY` en Vercel (y *Redeploy*).

## AdMob (banner de la app Android)

Todo se configura en **animetrix.lat/admin → AdMob · Banner**:

- **Mostrar banner**, **Modo prueba** (anuncios de prueba de Google), **Posición** (arriba/abajo) y
  **Ocultar en el reproductor**: la app los lee de `/api/app-config` y se aplican en ~1 minuto, sin APK nuevo.
- **ID del banner** (`ca-app-pub-…/…`): también se aplica sin APK nuevo.
- **App ID** (`ca-app-pub-…~…`): va dentro del APK. El workflow *App Android* lo lee del panel al compilar;
  después de cambiarlo, ejecuta *Actions → App Android (APK) → Run workflow*. Sin App ID se usa el de prueba de Google.
- **Intersticial antes del video**: pantalla completa al abrir el reproductor (`/ver`), con un mínimo de minutos entre uno y otro. Si no hay anuncio listo, el video abre directo.
- `/app-ads.txt` se genera solo con la cuenta del App ID (AdMob lo exige en el sitio del desarrollador).

Necesita la misma Blob store que ya usan los interruptores (`BLOB_READ_WRITE_TOKEN`) y `ADMIN_SECRET`.

## Probar en tu PC

```bash
npm run dev          # http://localhost:3000 con datos de ejemplo
```

Tras cambiar `src/` o `lib/layout.js`, ejecuta `npm install` (una vez) y `npm run assets`:
minifica JS/CSS, les pone hash y regenera `public/index.html`.
