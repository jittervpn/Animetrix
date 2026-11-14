// Plantilla HTML común (cabecera, navegación y pie).
import { esc } from './inkaflix.js';
import { ASSETS } from './assets.js';

const SITE = 'Animetrix';

export function pageStart({ title = '', description = '', bodyClass = '', preloadHome = false, watch = false } = {}) {
  const full = title ? `${title} · ${SITE}` : `${SITE} — Películas, series y anime online`;
  const desc = description || `Mira películas, series y anime en ${SITE}. Estrenos, catálogo completo y tu lista personal.`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc.slice(0, 300))}">
<meta name="theme-color" content="#07080c">
<meta name="google-site-verification" content="cN-LkgWD5aBZMER1whLJIyLNWZ-a7F6I-sAXlmJY_6s">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc.slice(0, 300))}">
<meta property="og:type" content="website">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/unbounded.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://image.tmdb.org">
${watch ? '<link rel="preconnect" href="https://api.inkaflix.space">' : ''}
${preloadHome ? '<link rel="preload" href="/api/data?a=home" as="fetch" crossorigin="anonymous">' : ''}
<link rel="stylesheet" href="${ASSETS.css}">
<script src="${ASSETS.js}" defer></script>
</head>
<body class="${esc(bodyClass)}">
<a class="skip" href="#app">Saltar al contenido</a>
<header class="topbar" id="topbar">
  <a class="brand" href="/" aria-label="${SITE} inicio">
    <img src="/assets/logo.svg" alt="" width="30" height="30">
    <span>${SITE}</span>
  </a>
  <nav class="nav" aria-label="Secciones">
    <a href="/#/" data-nav="home">Inicio</a>
    <a href="/#/peliculas" data-nav="movie">Películas</a>
    <a href="/#/series" data-nav="serie">Series</a>
    <a href="/#/anime" data-nav="anime">Anime</a>
    <a href="/#/mi-lista" data-nav="list">Mi lista</a>
  </nav>
  <form class="search" role="search" action="/" id="searchForm">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="q" name="q" type="search" placeholder="Buscar títulos…" maxlength="60" autocomplete="off" aria-label="Buscar">
  </form>
</header>
`;
}

export function pageEnd() {
  return `<nav class="tabbar" aria-label="Navegación móvil">
  <a href="/#/" data-nav="home"><svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/></svg>Inicio</a>
  <a href="/#/peliculas" data-nav="movie"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4"/></svg>Películas</a>
  <a href="/#/series" data-nav="serie"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="m9 3 3 3 3-3"/></svg>Series</a>
  <a href="/#/anime" data-nav="anime"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6L20 9.5l-4 4.1.9 5.9L12 16.8 7.1 19.5l.9-5.9-4-4.1 5.4-.9z"/></svg>Anime</a>
  <a href="/#/mi-lista" data-nav="list"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Mi lista</a>
</nav>
<footer class="foot">
  <p><strong>${SITE}</strong> · Reproductor provisto por InkaFlix. Este sitio no aloja archivos de video.</p>
  <p>© ${new Date().getFullYear()} ${SITE}</p>
</footer>
</body>
</html>
`;
}
