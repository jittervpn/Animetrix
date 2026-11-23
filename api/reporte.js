// /api/reporte — la app Android avisa por qué se cerró la última vez (motivo de Android, sin datos personales).
// Solo se escribe en los registros de Vercel ([app-reporte] …) para diagnosticar cierres.
import { securityHeaders, rateLimited, sendJson } from '../lib/http.js';

const MAX = 16 * 1024;
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' || typeof v === 'boolean' ? v : null);

export default async function handler(req, res) {
  securityHeaders(res, false);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { error: 'Método no permitido' }); }
  if (rateLimited(req, 10)) return sendJson(res, 429, { error: 'Demasiadas peticiones' });
  if (!/AnimetrixApp\//.test(String(req.headers['user-agent'] || ''))) return sendJson(res, 403, { error: 'Solo la app' });
  let raw = '';
  try {
    for await (const c of req) { raw += c; if (raw.length > MAX) return sendJson(res, 413, { error: 'Demasiado grande' }); }
    const b = JSON.parse(raw || '{}');
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 5).map((x) => ({
      kind: clip(x.kind, 20), reason: clip(x.reason, 40), sub: clip(x.sub, 20), status: clip(x.status, 12), importance: clip(x.importance, 12),
      pssKb: clip(x.pssKb, 12), rssKb: clip(x.rssKb, 12), at: clip(x.at, 15), desc: clip(x.desc, 300), url: clip(x.url, 200), trace: clip(x.trace, 4000),
    }));
    console.log('[app-reporte]', JSON.stringify({ v: clip(b.v, 20), sdk: clip(b.sdk, 4), model: clip(b.model, 60), ramMb: clip(b.ramMb, 8), lowRam: clip(b.lowRam, 5), items }));
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 400, { error: 'Datos no válidos' });
  }
}
