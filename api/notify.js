// /api/notify — lo consulta la app de Android cada ~30 min para mostrar notificaciones.
// Devuelve: catálogo compacto (para detectar estrenos y episodios nuevos),
// el aviso activo (mantenimiento) y la última versión de la app.
import { catalogAll, TYPES, asText } from '../lib/inkaflix.js';
import { securityHeaders, rateLimited, sendJson } from '../lib/http.js';
import avisos from '../avisos.js';

const REPO = 'jittervpn/Animetrix';
let appCache = { t: 0, v: null };

const APK_URL = `https://github.com/${REPO}/releases/latest/download/Animetrix.apk`;
const TAG_RE = /^app-v(\d+)\.(\d+)\.(\d+)$/;
const fromTag = (tag) => {
  const m = TAG_RE.exec(String(tag || ''));
  return m ? { code: Number(m[3]), name: `${m[1]}.${m[2]}.${m[3]}`, url: APK_URL } : null;
};

/** Versión según la API de GitHub (con GITHUB_TOKEN si está; sin él, GitHub limita a 60 consultas/hora por IP compartida). */
async function viaApi() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Animetrix' };
  const tok = (process.env.GITHUB_TOKEN || '').trim();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
  return r.ok ? fromTag((await r.json()).tag_name) : null;
}

/** Respaldo sin API: github.com/…/releases/latest redirige a …/releases/tag/app-vX.Y.Z (no tiene ese límite). */
async function viaRedirect() {
  const r = await fetch(`https://github.com/${REPO}/releases/latest`, {
    method: 'HEAD', headers: { 'User-Agent': 'Animetrix' }, redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  const loc = r.headers.get('location') || '';
  const m = /\/releases\/tag\/([^/?#]+)$/.exec(loc);
  return m ? fromTag(decodeURIComponent(m[1])) : null;
}

async function latestApp() {
  // 10 min con dato bueno; si falló, se reintenta al minuto (antes se quedaba con la versión vieja 10 min o más).
  if (Date.now() - appCache.t < (appCache.ok ? 10 : 1) * 60e3) return appCache.v;
  let v = null;
  try { v = await viaApi(); } catch { /* límite de GitHub o sin red */ }
  if (!v) { try { v = await viaRedirect(); } catch { /* sin datos de versión */ } }
  // Nunca bajar de versión por un dato viejo.
  if (v && appCache.v && v.code < appCache.v.code) v = appCache.v;
  appCache = { t: Date.now(), ok: Boolean(v), v: v ?? appCache.v };
  return appCache.v;
}

export default async function handler(req, res) {
  securityHeaders(res, false);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return sendJson(res, 405, { error: 'Método no permitido' }); }
  if (rateLimited(req, 30)) { res.setHeader('Retry-After', '60'); return sendJson(res, 429, { error: 'Demasiadas peticiones' }); }

  const items = [];
  await Promise.all(TYPES.map(async (t) => {
    try {
      for (const it of (await catalogAll(t)).items || []) {
        items.push({ k: `${t}:${it.tmdb}`, ty: t, id: it.tmdb, t: it.title, e: it.episodes || 0 });
      }
    } catch { /* tipo no disponible ahora */ }
  }));

  const a = avisos?.aviso || {};
  const notice = a.activo
    ? { id: asText(a.id, 60) || 'aviso', title: asText(a.titulo, 80) || 'Animetrix', body: asText(a.mensaje, 240) || '' }
    : null;

  return sendJson(res, 200, { v: 1, app: await latestApp(), notice, items }, 120);
}
