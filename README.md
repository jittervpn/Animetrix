# Animetrix — animetrix.lat

Web de streaming de películas, series y anime, lista para **Vercel** (sin PHP, sin base de datos).
El reproductor y el catálogo vienen de la API de InkaCat.

## Estructura

```
src/             ← código fuente del frontend (app.js, app.css)
public/          ← web estática generada (index.html, assets con hash, fuentes)
api/data.js      ← proxy seguro hacia InkaCat (la API key nunca llega al navegador)
api/ver.js       ← página del reproductor (/ver?t=movie&id=950387)
lib/             ← cliente de la API, validación, plantilla HTML
vercel.json      ← rutas y cabeceras de seguridad
```

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
- `/app-ads.txt` se genera solo con la cuenta del App ID (AdMob lo exige en el sitio del desarrollador).

Necesita la misma Blob store que ya usan los interruptores (`BLOB_READ_WRITE_TOKEN`) y `ADMIN_SECRET`.

## Probar en tu PC

```bash
npm run dev          # http://localhost:3000 con datos de ejemplo
```

Tras cambiar `src/` o `lib/layout.js`, ejecuta `npm install` (una vez) y `npm run assets`:
minifica JS/CSS, les pone hash y regenera `public/index.html`.
