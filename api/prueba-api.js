// /prueba-api — PÁGINA DE PRUEBA (oculta, sin indexar) de la API de AnimetrixLat
// (https://animetrixlat.vercel.app/docs). Muestra su catálogo y reproduce con su /embed/{id}.
// No toca el resto del sitio: si la prueba no convence, se borra este archivo y la ruta.
//
// Variables opcionales en Vercel:
//   ATX_API_BASE  (por defecto https://animetrixlat.vercel.app)
//   ATX_API_KEY   (clave atx_…, solo si la API tiene activado "Exigir clave de API")
import { rateLimited } from '../lib/http.js';

const BASE = (/^https:\/\/[a-z0-9.-]+$/i.test(process.env.ATX_API_BASE || '') ? process.env.ATX_API_BASE : 'https://animetrixlat.vercel.app');
const KEY = process.env.ATX_API_KEY || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path) {
  const t0 = Date.now();
  const url = BASE + path;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...(KEY ? { 'x-api-key': KEY } : {}) }, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* no es JSON */ }
    return { ok: r.ok && !!json, status: r.status, ms: Date.now() - t0, json, raw: text.slice(0, 20000), url };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, json: null, raw: String(e.message || e), url };
  }
}

const CSS = `*{box-sizing:border-box}body{margin:0;background:#07080c;color:#eef1f7;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:inherit}main{max-width:1000px;margin:0 auto;padding:18px 16px 60px}
.tag{display:inline-block;background:#ffd75e;color:#07080c;font-weight:800;font-size:12px;padding:3px 10px;border-radius:999px;letter-spacing:.06em}
h1{font-size:24px;margin:10px 0 4px}.sub{color:#9aa3b2;margin:0 0 14px;font-size:14px}
form{display:flex;gap:8px;margin:12px 0 18px}input{flex:1;padding:11px 14px;border-radius:12px;border:1px solid #20242f;background:#0f1118;color:#fff;font:inherit}
button{padding:11px 16px;border-radius:12px;border:0;background:#c8ff2e;color:#07080c;font-weight:800;font:inherit;font-weight:800}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{display:block;text-decoration:none;background:#0f1118;border:1px solid #1a1e29;border-radius:14px;overflow:hidden}
.card .img{aspect-ratio:16/9;background:#151925 center/cover no-repeat;display:grid;place-items:center;color:#3b4253;font-size:28px}
.card .t{padding:8px 10px}.card b{display:block;font-size:14px;line-height:1.25}.card small{color:#9aa3b2;font-size:12px}
.player{position:relative;aspect-ratio:16/9;background:#000;border-radius:14px;overflow:hidden;margin:6px 0 12px}
.player iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.nav{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.nav a{background:#151925;border-radius:999px;padding:7px 14px;text-decoration:none;font-size:14px}
.nav a.on{background:#c8ff2e;color:#07080c;font-weight:800}
details{margin-top:18px;background:#0f1118;border:1px solid #1a1e29;border-radius:12px;padding:10px 12px}summary{cursor:pointer;color:#9aa3b2}
pre{white-space:pre-wrap;word-break:break-all;font-size:12px;color:#cfd5e1;max-height:420px;overflow:auto}
.err{background:#2a1214;border:1px solid #5c2328;color:#ffb3b8;border-radius:12px;padding:12px}`;

function page(title, body, frameSrc) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Prueba API</title><style>${CSS}</style></head>
<body><main><a href="/prueba-api" style="text-decoration:none"><span class="tag">PRUEBA · API AnimetrixLat</span></a>${body}</main></body></html>`;
}

function debug(r) {
  return `<details><summary>Respuesta de la API · HTTP ${r.status || 'sin respuesta'} · ${r.ms} ms</summary>
<p style="font-size:12px;color:#9aa3b2;margin:6px 0">${esc(r.url.replace(/([?&]key=)[^&]+/, '$1***'))}</p><pre>${esc(r.raw)}</pre></details>`;
}

function card(it) {
  const meta = [it.serie, it.temporada != null ? `T${it.temporada}` : null, it.episodio != null ? `E${it.episodio}` : null, it.lang, it.kind].filter(Boolean).join(' · ');
  const logo = typeof it.logo === 'string' && /^https:\/\//.test(it.logo) ? it.logo : '';
  return `<a class="card" href="/prueba-api?id=${encodeURIComponent(it.id)}">
<div class="img"${logo ? ` style="background-image:url('${esc(logo)}')"` : ''}>${logo ? '' : '▶'}</div>
<div class="t"><b>${esc(it.title || it.id)}</b><small>${esc(meta || it.group || '')}</small></div></a>`;
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (rateLimited(req, 60)) { res.statusCode = 429; return res.end('Demasiadas peticiones'); }
  const origin = new URL(BASE).origin;
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-src ${origin}; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const q = req.query || {};
  const id = typeof q.id === 'string' && /^[a-z0-9_-]{1,160}$/i.test(q.id) ? q.id : null;

  if (id) {
    const r = await api(`/api/v1/items/${encodeURIComponent(id)}`);
    const it = r.json && (r.json.item || r.json);
    if (!r.ok || !it || !it.id) {
      res.statusCode = r.status === 404 ? 404 : 502;
      return res.end(page('Error', `<h1>No se pudo cargar</h1><p class="err">La API respondió HTTP ${r.status || 'sin respuesta'}.</p>${debug(r)}`));
    }
    let embed = typeof it.embed === 'string' && it.embed.startsWith(origin + '/embed/') ? it.embed : `${origin}/embed/${encodeURIComponent(it.id)}`;
    if (KEY) embed += (embed.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(KEY);
    embed += (embed.includes('?') ? '&' : '?') + 'color=c8ff2e';
    const prev = r.json.prev || it.prev, next = r.json.next || it.next;
    const pid = (x) => (x && (x.id || (typeof x === 'string' ? x : null)));
    const eps = Array.isArray(r.json.episodes) ? r.json.episodes : (Array.isArray(it.episodes) ? it.episodes : []);
    const meta = [it.serie, it.temporada != null ? `Temporada ${it.temporada}` : null, it.episodio != null ? `Episodio ${it.episodio}` : null, it.group, it.lang, it.kind].filter(Boolean).join(' · ');
    const body = `<h1>${esc(it.title || it.id)}</h1><p class="sub">${esc(meta)}</p>
<div class="player"><iframe src="${esc(embed)}" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="origin"></iframe></div>
${it.description ? `<p>${esc(it.description)}</p>` : ''}
<div class="nav">${pid(prev) ? `<a href="/prueba-api?id=${encodeURIComponent(pid(prev))}">‹ Anterior</a>` : ''}${pid(next) ? `<a href="/prueba-api?id=${encodeURIComponent(pid(next))}">Siguiente ›</a>` : ''}</div>
${eps.length ? `<h2 style="font-size:17px">Episodios</h2><div class="nav">${eps.slice(0, 300).map((e) => `<a ${e.id === it.id ? 'class="on" ' : ''}href="/prueba-api?id=${encodeURIComponent(e.id)}">${esc(e.episodio != null ? `E${e.episodio}` : (e.title || e.id))}</a>`).join('')}</div>` : ''}
${debug(r)}`;
    return res.end(page(it.title || id, body));
  }

  const search = typeof q.q === 'string' ? q.q.slice(0, 80) : '';
  const r = await api(`/api/v1/items?limit=200&sort=recent${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const items = r.json && Array.isArray(r.json.items) ? r.json.items : [];
  const body = `<h1>Catálogo de la API nueva</h1>
<p class="sub">Fuente: ${esc(origin)} · ${r.ok ? `${r.json.total ?? items.length} contenido(s)` : `error HTTP ${r.status || 'sin respuesta'}`} · ${r.ms} ms. Página de prueba: no aparece en el sitio ni en Google.</p>
<form action="/prueba-api"><input name="q" value="${esc(search)}" placeholder="Buscar en la API…"><button>Buscar</button></form>
${r.ok ? (items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<p class="sub">Sin resultados.</p>') : '<p class="err">No se pudo leer la API.</p>'}
${debug(r)}`;
  return res.end(page('Catálogo', body));
}
