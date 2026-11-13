# Animetrix — animetrix.lat

Web de streaming de películas, series y anime (PHP 8.1+, sin base de datos).
El reproductor y el catálogo vienen de la API de InkaFlix.

## Estructura

```
app/            ← código privado (FUERA de public_html): config, cliente de la API, plantillas
storage/cache/  ← caché del catálogo y control de peticiones (FUERA de public_html)
public_html/    ← lo único accesible desde internet
  index.php     ← inicio, catálogo, búsqueda, ficha, "Mi lista"
  ver.php       ← reproductor con selector de temporadas/episodios
  api.php       ← proxy seguro hacia InkaFlix (la API key nunca llega al navegador)
  assets/       ← CSS, JS, logo
```

## Instalación en cPanel

1. **Sube el repo a tu carpeta de inicio** (`/home/TU_USUARIO/`), de modo que queden
   `~/app`, `~/storage` y `~/public_html` al mismo nivel.
   - Con Git: cPanel → *Git™ Version Control* → *Create* → clona el repo en `/home/TU_USUARIO/animetrix`
     y luego apunta el dominio `animetrix.lat` a `/home/TU_USUARIO/animetrix/public_html`
     (cPanel → *Domains* → *Manage* → *Document Root*).
2. **Crea la configuración secreta** (no está en el repo):
   copia `app/config.example.php` como `app/config.php` con el Administrador de archivos
   y pega tu API key en `'api_key'`. Permisos recomendados: `600`.
3. **Permisos de caché:** `storage/cache` debe ser escribible por PHP (`700` o `755`).
4. **SSL:** activa AutoSSL / Let's Encrypt para `animetrix.lat` (el `.htaccess` fuerza HTTPS).
5. **PHP 8.1 o superior** con extensión `curl` (cPanel → *Select PHP Version*).

## Seguridad incluida

- La API key solo vive en `app/config.php` (ignorado por Git) o en la variable de entorno `INKAFLIX_KEY`.
- Las consultas JSON a InkaFlix se hacen desde el servidor con `Authorization: Bearer`.
- `api.php`: solo GET, acciones y tipos en lista blanca, parámetros validados, límite de peticiones por IP,
  rechazo de peticiones de otros sitios, errores sin detalles internos.
- Respuestas filtradas: solo salen campos conocidos; imágenes únicamente de `image.tmdb.org`.
- Cabeceras: CSP estricta (solo se permiten iframes de `api.inkaflix.space`), HSTS, nosniff,
  anti-clickjacking, Permissions-Policy.
- El frontend no usa `innerHTML` con datos: todo el texto se inserta con `textContent`.
- `.htaccess` bloquea archivos ocultos, de configuración y las carpetas `app/` y `storage/`.

> El enlace del reproductor (`/e/...?view_key=`) necesariamente lleva la key en el `src` del iframe.
> Por eso la key debe estar **restringida al dominio `animetrix.lat`** en el panel de InkaFlix.
> Si alguna vez se filtra, pulsa **Revocar**, genera otra y cámbiala en `app/config.php`.

## Opciones (`app/config.php`)

| Opción | Uso |
|---|---|
| `cache_ttl` | Minutos de caché del catálogo (10 por defecto) |
| `rate_limit` | Peticiones por minuto e IP al proxy (90) |
| `player_sandbox` | `true` bloquea pop-ups de anuncios del reproductor; si el video no carga, vuelve a `false` |
| `demo` | `true` muestra datos de ejemplo sin conectar a InkaFlix |

## Probar en tu PC

```bash
cp app/config.example.php app/config.php   # pon 'demo' => true para probar sin key
php -S 127.0.0.1:8000 -t public_html
```
