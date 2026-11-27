// Página del reproductor: /ver?t=movie&id=950387
//                        /ver?t=serie&id=230424&se=1&ep=10
//                        /ver?atx=el-comienzo-a1b2c3   (fuente: AnimetrixLat, en paralelo a InkaCat)
import { asType, asInt, title as getTitle, playerFor, esc, config } from '../lib/inkaflix.js';
import { item as atxItem, asId as atxAsId, ApiError as AtxApiError } from '../lib/animetrixlat.js';
import { securityHeaders, rateLimited } from '../lib/http.js';
import { typeEnabled } from '../lib/flags.js';
import { pageStart, pageEnd } from '../lib/layout.js';

const LABEL = { movie: 'Película', serie: 'Serie', anime: 'Anime' };

export default async function handler(req, res) {
  securityHeaders(res, true);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (rateLimited(req, 120)) {
    res.statusCode = 429; res.setHeader('Retry-After', '60'); res.setHeader('Cache-Control', 'no-store');
    return res.end(pageStart({ title: 'Espera un momento' }) + '<main id="app" class="app"><section class="empty"><h1>Demasiadas solicitudes</h1><p>Espera un minuto y vuelve a intentar.</p></section></main>' + pageEnd());
  }
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const q = req.query || {};

  const atxId = atxAsId(one(q.atx));
  if (atxId) return renderAtx(res, atxId);

  const type = asType(one(q.t));
  const tmdb = asInt(one(q.id), 1, 99999999);

  if (!type || tmdb == null) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pageStart({ title: 'No encontrado' })
      + '<main id="app" class="app"><section class="empty"><h1>Título no encontrado</h1><p><a class="btn primary" href="/">Volver al inicio</a></p></section></main>'
      + pageEnd());
  }
  const se = type === 'movie' ? null : (asInt(one(q.se) ?? '1', 0, 500) ?? 1);
  const ep = type === 'movie' ? null : (asInt(one(q.ep) ?? '1', 0, 100000) ?? 1);

  let info = null;
  try { info = await getTitle(type, tmdb); } catch (e) { console.error('[animetrix] ver:', e.message); }
  const name = info?.title || 'Reproduciendo';
  const seasons = info?.seasons || [];

  let prev = null; let next = null;
  if (type !== 'movie' && seasons.length) {
    const list = seasons.flatMap((s) => s.episodes.map((e) => [s.n, e.n]));
    const i = list.findIndex(([s, e]) => s === se && e === ep);
    if (i >= 0) { prev = list[i - 1] || null; next = list[i + 1] || null; }
  } else if (type !== 'movie') {
    prev = ep > 1 ? [se, ep - 1] : null;
    next = [se, ep + 1];
  }

  const link = ([s, e]) => '/ver?' + new URLSearchParams({ t: type, id: String(tmdb), se: String(s), ep: String(e) });
  const epLabel = type === 'movie' ? '' : `T${se} · E${ep}`;
  const link0 = type === 'movie' ? `/ver?t=movie&id=${tmdb}` : link([se, ep]);
  // Protección: SIN allow-top-navigation → ningún anuncio puede sacar al usuario de la página.
  // Con allow-popups → el reproductor puede abrir su anuncio en otra pestaña (muchos lo exigen para soltar el video).
  const playerOff = !(await typeEnabled(type));
  const sandbox = config().sandbox ? ' sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox allow-orientation-lock allow-pointer-lock"' : '';
  const watchData = JSON.stringify({ type, tmdb, title: name, poster: info?.poster || null, year: info?.year || null, se, ep });

  let episodesHtml = '';
  if (type !== 'movie' && seasons.length) {
    episodesHtml = `<div class="episodes">
      <div class="season-tabs" role="tablist">${seasons.map((s) =>
        `<button type="button" role="tab" data-season="${s.n}" aria-selected="${s.n === se}">Temporada ${s.n}</button>`).join('')}</div>
      ${seasons.map((s) => `<ol class="ep-list" data-season-list="${s.n}"${s.n === se ? '' : ' hidden'}>${s.episodes.map((e) =>
        `<li><a href="${esc(link([s.n, e.n]))}"${s.n === se && e.n === ep ? ' aria-current="true"' : ''}><span class="ep-n">${e.n}</span><span class="ep-t">${esc(e.title || 'Episodio ' + e.n)}</span></a></li>`).join('')}</ol>`).join('')}
    </div>`;
  } else if (type !== 'movie') {
    episodesHtml = `<form class="ep-picker" method="get" action="/ver">
      <input type="hidden" name="t" value="${type}"><input type="hidden" name="id" value="${tmdb}">
      <label>Temporada <input type="number" name="se" min="0" max="500" value="${se}"></label>
      <label>Episodio <input type="number" name="ep" min="0" max="100000" value="${ep}"></label>
      <button class="btn primary">Ir</button>
    </form>`;
  }

  const rc = (r) => (r >= 7.5 ? 'hi' : r >= 6 ? 'mid' : 'lo');
  const metaParts = [
    info?.rating ? `<span class="rate-pill ${rc(info.rating)}">★ ${Number(info.rating).toFixed(1)}</span>` : '',
    info?.runtime && type === 'movie' ? `<span>${info.runtime >= 60 ? Math.floor(info.runtime / 60) + ' h ' + (info.runtime % 60 || '') + (info.runtime % 60 ? ' min' : '') : info.runtime + ' min'}</span>` : '',
    ...(info?.genres || []).slice(0, 3).map((g) => `<span>${esc(g)}</span>`),
  ].filter(Boolean);
  const meta = metaParts.length ? `<div class="meta watch-meta">${metaParts.join('')}</div>` : '';

  const html = pageStart({
    title: `Ver ${name}${epLabel ? ' ' + epLabel : ''} online${info?.year ? ' (' + info.year + ')' : ''}`,
    description: (info?.overview ? info.overview + ' ' : '') + `Mira ${name} online en Animetrix.`,
    bodyClass: 'watch', watch: true,
    canonical: 'https://www.animetrix.lat' + link0,
    image: info?.backdrop || info?.poster || '',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': type === 'movie' ? 'Movie' : 'TVSeries',
      name, ...(info?.overview ? { description: info.overview } : {}),
      ...(info?.poster ? { image: info.poster } : {}),
      ...(info?.year ? { datePublished: String(info.year) } : {}),
      ...(info?.genres?.length ? { genre: info.genres } : {}),
      ...(info?.rating && info?.votes ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: info.rating, bestRating: 10, ratingCount: info.votes } } : {}),
    },
  }) + `
<main id="app" class="app watch-page" data-watch="${esc(watchData)}">
  ${playerOff ? '' : `<div class="player-wrap"><div class="player">
    <div class="p-load" id="pLoad" role="status" aria-live="polite">
      <span class="p-spin" aria-hidden="true"></span>
      <b>Cargando video…</b>
      <small>${esc(name)}${epLabel ? ' · ' + epLabel : ''}</small>
    </div>
    <div class="cine-bar" id="cineBar">
      <a class="cine-btn" href="/app-accion?a=cine-off" aria-label="Salir de pantalla completa"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
      <div class="cine-t"><b>${esc(name)}</b>${epLabel ? `<span>${epLabel}</span>` : ''}</div>
      ${prev ? `<a class="cine-btn" href="${esc(link(prev))}" aria-label="Episodio anterior"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 5l-9 7 9 7z"/></svg></a>` : ''}
      ${next ? `<a class="cine-btn" href="${esc(link(next))}" aria-label="Siguiente episodio"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l9 7-9 7z"/></svg></a>` : ''}
      <a class="cine-btn" href="/app-accion?a=ajuste" aria-label="Ampliar o ajustar el video"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="cine-lbl">Ajuste</span></a>
      <a class="cine-btn txt" href="/app-accion?a=cine-off">${type === 'movie' ? 'Detalles' : 'Episodios'}</a>
    </div>
    <button type="button" class="cine-handle" id="cineHandle" aria-label="Mostrar opciones"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <iframe id="player" src="${esc(playerFor(info, type, tmdb, se, ep))}" title="Reproductor: ${esc(name)}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin"${sandbox}></iframe>
  </div></div>
  <div class="ad-tip" id="adTip">
    <svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>
    <p><strong>Cerrar anuncios:</strong> si al tocar el video aparece <em>“¿Salir de esta página?”</em> o <em>“Confirmar navegación”</em>, toca <strong>Quedarme / Cancelar</strong>. El anuncio se cierra y tu video sigue igual.</p>
  </div>`}
  ${(sandbox && !playerOff) ? `<div class="player-bar" id="playerBar">
    <span class="shield"><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg><span id="shieldText">Protección activada: los anuncios no te sacarán del video</span></span>
    <button type="button" class="link-btn" id="compatBtn">¿No carga? Usar modo compatible</button>
  </div>` : ''}
  <section class="watch-info">
    <div class="watch-head">
      <a class="back" href="/#/titulo/${type}/${tmdb}" aria-label="Volver a la ficha"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
      <div>
        <p class="eyebrow">${LABEL[type]}${info?.year ? ' · ' + info.year : ''}</p>
        <h1>${esc(name)}${epLabel ? ` <span class="ep-tag">${epLabel}</span>` : ''}</h1>
        ${meta}
      </div>
<div class="watch-actions">
            <button class="btn ghost" type="button" id="favBtn" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Mi lista</span></button>
      ${playerOff ? '' : `<a class="btn ghost cine-only" href="/app-accion?a=cine-on"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Ampliar</span></a>`}
      <button class="btn ghost" type="button" id="shareBtn" aria-label="Compartir"><svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg><span>Compartir</span></button>
      </div>
    </div>
    ${type !== 'movie' ? `<div class="ep-nav">
      ${prev ? `<a class="btn ghost" href="${esc(link(prev))}">‹ Anterior</a>` : ''}
      ${next ? `<a class="btn primary" href="${esc(link(next))}">Siguiente: T${next[0]} · E${next[1]} ›</a>` : ''}
    </div>` : ''}
    ${info?.overview ? `<p class="overview">${esc(info.overview)}</p>` : ''}
    ${episodesHtml}
    <p class="hint">¿No carga el video? Recarga la página o prueba en unos minutos.</p>
  </section>
</main>
` + pageEnd();

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.end(html);
}

/** Reproductor para un ítem de la API de AnimetrixLat (/ver?atx=<id>). */
async function renderAtx(res, id) {
  let it;
  try {
    it = await atxItem(id);
  } catch (e) {
    const notFound = e instanceof AtxApiError && e.status === 404;
    if (!(e instanceof AtxApiError)) console.error('[animetrix] ver atx:', e.message);
    res.statusCode = notFound ? 404 : 502;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pageStart({ title: notFound ? 'No encontrado' : 'No disponible' })
      + `<main id="app" class="app"><section class="empty"><h1>${notFound ? 'Título no encontrado' : 'No se pudo cargar el video'}</h1>`
      + '<p><a class="btn primary" href="/">Volver al inicio</a></p></section></main>' + pageEnd());
  }

  const name = it.title || id;
  const epLabel = it.temporada != null || it.episodio != null
    ? ['T' + (it.temporada ?? 1), it.episodio != null ? 'E' + it.episodio : null].filter(Boolean).join(' · ')
    : '';
  const meta = [it.serie, it.group, it.lang].filter(Boolean).join(' · ');
  const link = (x) => '/ver?atx=' + encodeURIComponent(x);

  const episodesHtml = it.episodes.length
    ? `<div class="episodes"><h2 class="sub-title">Episodios</h2><ol class="ep-list">${it.episodes.map((e) =>
        `<li><a href="${esc(link(e.id))}"${e.id === it.id ? ' aria-current="true"' : ''}><span class="ep-n">${e.episodio ?? ''}</span><span class="ep-t">${esc(e.title || e.id)}</span></a></li>`).join('')}</ol></div>`
    : '';

  const html = pageStart({
    title: `Ver ${name}${epLabel ? ' ' + epLabel : ''} online`,
    description: (it.description ? it.description + ' ' : '') + `Mira ${name} online en Animetrix.`,
    bodyClass: 'watch', watch: true,
    canonical: 'https://www.animetrix.lat' + link(it.id),
    image: it.logo || '',
  }) + `
<main id="app" class="app watch-page" data-watch="${esc(JSON.stringify({ atx: true, id: it.id, title: name }))}">
  <div class="player-wrap"><div class="player">
    <iframe id="player" src="${esc(it.embed)}" title="Reproductor: ${esc(name)}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>
  </div></div>
  <section class="watch-info">
    <div class="watch-head">
      <a class="back" href="/" aria-label="Volver al inicio"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
      <div>
        <p class="eyebrow">${esc(it.group || 'Animetrix')}</p>
        <h1>${esc(name)}${epLabel ? ` <span class="ep-tag">${esc(epLabel)}</span>` : ''}</h1>
        ${meta ? `<div class="meta watch-meta"><span>${esc(meta)}</span></div>` : ''}
      </div>
    </div>
    <div class="ep-nav">
      ${it.prev ? `<a class="btn ghost" href="${esc(link(it.prev))}">‹ Anterior</a>` : ''}
      ${it.next ? `<a class="btn primary" href="${esc(link(it.next))}">Siguiente ›</a>` : ''}
    </div>
    ${it.description ? `<p class="overview">${esc(it.description)}</p>` : ''}
    ${episodesHtml}
    <p class="hint">¿No carga el video? Recarga la página o prueba en unos minutos.</p>
  </section>
</main>
` + pageEnd();

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.end(html);
}
