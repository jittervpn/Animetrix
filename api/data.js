// Proxy público: /api/data?a=catalog&type=movie&page=1&q=...
//                /api/data?a=title&type=serie&tmdb=123
// El navegador nunca ve la API key: esta función la añade del lado del servidor.
import { asType, asInt, catalog, catalogAll, stats, home, title, ApiError } from '../lib/inkaflix.js';
import { securityHeaders, rateLimited, sendJson, logSuspicious } from '../lib/http.js';

export default async function handler(req, res) {
  securityHeaders(res, false);
  if (req.method !== 'GET') { logSuspicious(req, 'method-' + req.method); res.setHeader('Allow', 'GET'); return sendJson(res, 405, { error: 'Método no permitido' }); }

  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) { logSuspicious(req, 'cross-site'); return sendJson(res, 403, { error: 'Origen no permitido' }); }
  if (rateLimited(req)) { res.setHeader('Retry-After', '60'); return sendJson(res, 429, { error: 'Demasiadas peticiones, espera un minuto' }); }

  const q = req.query || {};
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  if (one(q.a) === 'home') {
    try { return sendJson(res, 200, await home(), 300); } catch { return sendJson(res, 502, { error: 'Servicio no disponible' }); }
  }
  if (one(q.a) === 'stats') {
    try { return sendJson(res, 200, await stats(), 120); } catch { return sendJson(res, 502, { error: 'Servicio no disponible' }); }
  }
  const type = asType(one(q.type));
  if (!type) { logSuspicious(req, 'bad-type'); return sendJson(res, 400, { error: 'Tipo no válido' }); }

  try {
    switch (one(q.a)) {
      case 'catalog': {
        const page = asInt(one(q.page) ?? '1', 1, 1000) ?? 1;
        let s = typeof one(q.q) === 'string' ? one(q.q) : '';
        s = s.replace(/[\x00-\x1F\x7F<>]+/g, '').trim().slice(0, 60);
        return sendJson(res, 200, await catalog(type, page, s), 300);
      }
      case 'all':
        return sendJson(res, 200, await catalogAll(type), 300);
      case 'title': {
        const tmdb = asInt(one(q.tmdb), 1, 99999999);
        if (tmdb == null) return sendJson(res, 400, { error: 'ID no válido' });
        return sendJson(res, 200, await title(type, tmdb), 900);
      }
      default:
        return sendJson(res, 400, { error: 'Acción no válida' });
    }
  } catch (e) {
    if (!(e instanceof ApiError)) console.error('[animetrix]', e);
    const nf = e instanceof ApiError && e.status === 404;
    return sendJson(res, nf ? 404 : 502, { error: nf ? 'No encontrado' : 'Servicio no disponible, intenta más tarde' });
  }
}
