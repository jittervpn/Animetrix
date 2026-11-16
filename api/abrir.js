// /abrir?t=anime&id=123 — enlace universal para Telegram, WhatsApp, etc.
//  - Dentro de la app Animetrix → va directo al título.
//  - En Android con la app instalada → abre la app (intent://).
//  - Sin la app, o en PC/iPhone → abre la web.
import { asType, asInt } from '../lib/inkaflix.js';
import { securityHeaders, rateLimited } from '../lib/http.js';
import { pageStart, pageEnd } from '../lib/layout.js';

const SITE = 'https://www.animetrix.lat';
const PKG = 'lat.animetrix.app';

export default function handler(req, res) {
  securityHeaders(res, true);
  res.setHeader('Cache-Control', 'no-store');
  if (rateLimited(req, 120)) { res.statusCode = 429; return res.end('Demasiadas solicitudes'); }

  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const q = req.query || {};
  const type = asType(one(q.t));
  const id = asInt(one(q.id), 1, 99999999);
  const target = !type || id == null ? `${SITE}/`
    : type === 'movie' ? `${SITE}/ver?t=movie&id=${id}` : `${SITE}/#/titulo/${type}/${id}`;

  const ua = String(req.headers['user-agent'] || '');
  const go = (url) => { res.statusCode = 302; res.setHeader('Location', url); return res.end(); };
  if (/AnimetrixApp\//.test(ua) || one(q.web) === '1' || !/Android/i.test(ua) || !type || id == null) return go(target);

  const self = `/abrir?t=${type}&id=${id}`;
  const fallback = encodeURIComponent(`${SITE}${self}&web=1`);
  const intent = `intent://www.animetrix.lat${self}#Intent;scheme=https;package=${PKG};S.browser_fallback_url=${fallback};end`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(pageStart({ title: 'Abrir en la app', bodyClass: 'open-page' }) + `
<main id="app" class="app"><section class="empty open-box" data-intent="${intent.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
  <img src="/assets/logo.svg" alt="" width="72" height="72">
  <h1>Abriendo Animetrix…</h1>
  <p>Si no se abre solo, toca el botón.</p>
  <p><a class="btn primary lg" id="openApp" href="${intent.replace(/&/g, '&amp;')}">▶ Abrir en la app</a></p>
  <p><a class="btn ghost" href="${self}&amp;web=1">Ver en la web</a> <a class="btn ghost" href="/app">📲 Descargar app</a></p>
</section></main>
<script src="/assets/open.js" defer></script>` + pageEnd());
}
