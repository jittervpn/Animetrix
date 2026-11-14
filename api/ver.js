// Página del reproductor: /ver?t=movie&id=950387
//                        /ver?t=serie&id=230424&se=1&ep=10
import { asType, asInt, title as getTitle, embedUrl, esc, config } from '../lib/inkaflix.js';
import { securityHeaders } from '../lib/http.js';
import { pageStart, pageEnd } from '../lib/layout.js';

const LABEL = { movie: 'Película', serie: 'Serie', anime: 'Anime' };

export default async function handler(req, res) {
  securityHeaders(res, true);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const q = req.query || {};
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
  const sandbox = config().sandbox ? ' sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"' : '';
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

  const html = pageStart({ title: `${name} ${epLabel}`.trim(), description: info?.overview || '', bodyClass: 'watch' }) + `
<main id="app" class="app watch-page" data-watch="${esc(watchData)}">
  <div class="player-wrap"><div class="player">
    <iframe src="${esc(embedUrl(type, tmdb, se, ep))}" title="Reproductor: ${esc(name)}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin"${sandbox}></iframe>
  </div></div>
  <section class="watch-info">
    <div class="watch-head">
      <a class="back" href="/#/titulo/${type}/${tmdb}" aria-label="Volver a la ficha"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
      <div>
        <p class="eyebrow">${LABEL[type]}${info?.year ? ' · ' + info.year : ''}</p>
        <h1>${esc(name)}${epLabel ? ` <span class="ep-tag">${epLabel}</span>` : ''}</h1>
      </div>
      <button class="btn ghost" type="button" id="favBtn" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Mi lista</span></button>
    </div>
    ${type !== 'movie' ? `<div class="ep-nav">
      ${prev ? `<a class="btn ghost" href="${esc(link(prev))}">‹ Anterior</a>` : ''}
      ${next ? `<a class="btn primary" href="${esc(link(next))}">Siguiente: T${next[0]} · E${next[1]} ›</a>` : ''}
    </div>` : ''}
    ${info?.overview ? `<p class="overview">${esc(info.overview)}</p>` : ''}
    ${episodesHtml}
    <p class="hint">¿No carga el video? Recarga la página o prueba en unos minutos: el servidor puede estar ocupado.</p>
  </section>
</main>
` + pageEnd();

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
  res.end(html);
}
