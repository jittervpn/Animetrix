// POST /api/pedido — un usuario pide una película/serie/anime. Llega por Telegram al administrador.
// Protecciones: solo POST JSON desde la propia web, tamaño máximo, validación en el servidor,
// campo trampa para bots, límite estricto por IP y global, texto escapado antes de enviarlo.
import { asText } from '../lib/inkaflix.js';
import { securityHeaders, sendJson, logSuspicious } from '../lib/http.js';

const TYPES = { movie: '🎬 Película', serie: '📺 Serie', anime: '⭐ Anime' };
const perIp = new Map();
let global = { t: 0, n: 0 };

function limited(ip) {
  const now = Date.now();
  const list = (perIp.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= 3) return true;              // 3 pedidos cada 10 min por IP
  if (now - global.t > 3600e3) global = { t: now, n: 0 };
  if (global.n >= 60) return true;                // 60 por hora en total (por instancia)
  list.push(now); perIp.set(ip, list); global.n++;
  if (perIp.size > 5000) perIp.clear();
  return false;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw new Error('grande'); }
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  securityHeaders(res, false);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { error: 'Método no permitido' }); }

  const site = req.headers['sec-fetch-site'];
  const origin = String(req.headers.origin || '');
  if ((site && site !== 'same-origin') || (origin && !/^https:\/\/(www\.)?animetrix\.lat$/.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) {
    logSuspicious(req, 'pedido-cross-site'); return sendJson(res, 403, { error: 'Origen no permitido' });
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'Formato no válido' });
  if (Number(req.headers['content-length'] || 0) > 4096) return sendJson(res, 413, { error: 'Pedido demasiado largo' });

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '0').split(',')[0].trim();
  let b;
  try { b = await readBody(req); } catch { return sendJson(res, 400, { error: 'Pedido no válido' }); }

  if (b.website) { logSuspicious(req, 'pedido-honeypot'); return sendJson(res, 200, { ok: true }); } // bot: se ignora en silencio
  const title = asText(b.title, 80);
  const type = Object.hasOwn(TYPES, b.type) ? b.type : null;
  const year = /^\d{4}$/.test(String(b.year || '')) && +b.year >= 1900 && +b.year <= 2100 ? String(b.year) : '';
  const note = asText(b.note, 200) || '';
  const name = asText(b.name, 24) || '';
  if (!title || title.length < 2) return sendJson(res, 400, { error: 'Escribe el nombre del título' });
  if (!type) return sendJson(res, 400, { error: 'Elige si es película, serie o anime' });
  if (limited(ip)) { logSuspicious(req, 'pedido-rate-limit'); res.setHeader('Retry-After', '600'); return sendJson(res, 429, { error: 'Ya enviaste varios pedidos. Prueba en unos minutos.' }); }

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
  const via = /AnimetrixApp\//.test(String(req.headers['user-agent'] || '')) ? 'app' : 'web';
  console.log(`[animetrix-pedido] ${type} "${title}" ${year} via=${via}`);
  if (!token || !chat) return sendJson(res, 503, { error: 'Los pedidos no están disponibles por ahora' });

  const text = `<b>📥 Nuevo pedido</b>\n\n${TYPES[type]}: <b>${esc(title)}</b>${year ? ` (${year})` : ''}`
    + (note ? `\n💬 ${esc(note)}` : '') + (name ? `\n👤 ${esc(name)}` : '') + `\n📱 Desde la ${via}`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('telegram ' + r.status);
  } catch (e) {
    console.error('[animetrix-pedido] no se pudo enviar:', e.message);
    return sendJson(res, 502, { error: 'No se pudo enviar el pedido. Intenta más tarde.' });
  }
  return sendJson(res, 200, { ok: true });
}
