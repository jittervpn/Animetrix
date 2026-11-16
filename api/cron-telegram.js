// /api/cron-telegram?key=SECRETO — lo llama cron-job.org cada 10 minutos.
// Sin la clave correcta no hace nada. Publica en el canal los estrenos y episodios nuevos.
import { timingSafeEqual } from 'node:crypto';
import { runTelegram } from '../lib/telegram.js';
import { securityHeaders, sendJson, rateLimited, logSuspicious } from '../lib/http.js';

let running = false;

function validKey(given) {
  const real = process.env.CRON_SECRET || '';
  if (!real || typeof given !== 'string' || given.length !== real.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(real));
}

export default async function handler(req, res) {
  securityHeaders(res, false);
  const key = Array.isArray(req.query?.key) ? req.query.key[0] : req.query?.key;
  if (rateLimited(req, 10)) return sendJson(res, 429, { error: 'Demasiadas peticiones' });
  if (!validKey(key)) { logSuspicious(req, 'cron-bad-key'); return sendJson(res, 401, { error: 'No autorizado' }); }
  if (running) return sendJson(res, 200, { ok: true, note: 'ya en curso' });
  running = true;
  try {
    const r = await runTelegram();
    console.log('[animetrix-telegram]', JSON.stringify(r));
    return sendJson(res, 200, { ok: true, ...r });
  } catch (e) {
    console.error('[animetrix-telegram] error:', e.message);
    return sendJson(res, 500, { ok: false, error: 'Fallo al publicar' });
  } finally {
    running = false;
  }
}
