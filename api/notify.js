// /api/notify — lo consulta la app de Android cada ~30 min para mostrar notificaciones.
// Devuelve: catálogo compacto (para detectar estrenos y episodios nuevos),
// el aviso activo (mantenimiento) y la última versión de la app.
import { catalogAll, TYPES, asText } from '../lib/inkaflix.js';
import { securityHeaders, rateLimited, sendJson } from '../lib/http.js';
import avisos from '../avisos.js';

const REPO = 'jittervpn/Animetrix';
let appCache = { t: 0, v: null };

async function latestApp() {
  if (Date.now() - appCache.t < 10 * 60e3) return appCache.v;
  let v = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Animetrix' },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const j = await r.json();
      const m = /^app-v(\d+)\.(\d+)\.(\d+)$/.exec(String(j.tag_name || ''));
      if (m) v = { code: Number(m[3]), name: `${m[1]}.${m[2]}.${m[3]}`, url: 'https://github.com/jittervpn/Animetrix/releases/latest/download/Animetrix.apk' };
    }
  } catch { /* sin datos de versión */ }
  appCache = { t: Date.now(), v: v ?? appCache.v };
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

  return sendJson(res, 200, { v: 1, app: await latestApp(), notice, items }, 300);
}
