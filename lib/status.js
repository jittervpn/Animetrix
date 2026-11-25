// ==========================================================================
//  Estado del reproductor, publicado por el bot en el canal de Telegram.
//  - Manual: desde /admin ("Funcionando" / "En mantenimiento" + nota opcional).
//  - Automático (opcional): en cada pasada del cron (cada 10 min) se comprueba que
//    el catálogo y el reproductor de InkaCat respondan. Si falla 2 veces seguidas se
//    publica "mantenimiento"; si vuelve a andar 2 veces seguidas, "funcionando".
//    Solo se publica cuando el estado cambia.
//  Se guarda en Vercel Blob (config/status.json).
// ==========================================================================
import { get, put } from '@vercel/blob';
import { tg } from './telegram.js';
import { embedUrl } from './inkaflix.js';

const PATH = 'config/status.json';
const SITE = 'https://www.animetrix.lat';
const FAILS_TO_DOWN = 2;   // 2 pasadas del cron ≈ 20 min
const OKS_TO_UP = 2;

const DEFAULTS = Object.freeze({
  state: 'ok',        // último estado publicado: 'ok' | 'maint'
  source: 'manual',   // quién lo publicó: 'manual' | 'auto'
  note: '',
  auto: true,         // aviso automático si el reproductor se cae
  fails: 0, oks: 0,   // contadores del chequeo automático
  updatedAt: 0, postedAt: 0,
  lastCheck: null,    // { at, ok, detail }
});

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function getStatus() {
  try {
    const r = await get(PATH, { access: 'private' });
    if (r && r.statusCode === 200) return { ...DEFAULTS, ...JSON.parse(await new Response(r.stream).text()) };
  } catch { /* valores por defecto */ }
  return { ...DEFAULTS };
}

async function saveStatus(s) {
  await put(PATH, JSON.stringify(s), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

/** Texto del mensaje del canal. */
function message(state, note, auto) {
  const n = note ? `\n\n📝 ${esc(note)}` : '';
  if (state === 'maint') {
    return `🛠️ <b>Reproductor en mantenimiento</b>\n\n`
      + (auto ? 'Detectamos problemas para cargar los videos y ya estamos trabajando en eso.' : 'Estamos haciendo ajustes en el reproductor: algunos videos pueden no cargar por un rato.')
      + ' Te avisamos por acá apenas vuelva. 🙏' + n + '\n\n#Mantenimiento';
  }
  return `✅ <b>Reproductor funcionando perfectamente</b>\n\n`
    + 'Películas, series y anime ya cargan con normalidad. ¡A disfrutar! 🍿' + n + '\n\n#Funcionando';
}

async function announce(chat, state, note, auto) {
  await tg('sendMessage', {
    chat_id: chat, text: message(state, note, auto), parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: '▶ Ir a Animetrix', url: SITE }, { text: '📲 Descargar app', url: `${SITE}/app` }]] },
  });
}

const chatId = () => process.env.TELEGRAM_CHAT_ID || '@animetrixlat';

/** Publicación manual desde /admin. */
export async function publishStatus(state, note = '') {
  if (!['ok', 'maint'].includes(state)) throw Object.assign(new Error('Estado no válido'), { userError: true });
  if (!process.env.TELEGRAM_BOT_TOKEN) throw Object.assign(new Error('Falta TELEGRAM_BOT_TOKEN en Vercel'), { userError: true });
  const clean = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  await announce(chatId(), state, clean, false);
  const cur = await getStatus();
  const next = { ...cur, state, source: 'manual', note: clean, fails: 0, oks: 0, updatedAt: Date.now(), postedAt: Date.now() };
  await saveStatus(next);
  return next;
}

/** Enciende/apaga el aviso automático. */
export async function setAuto(on) {
  const cur = await getStatus();
  const next = { ...cur, auto: !!on, fails: 0, oks: 0, updatedAt: Date.now() };
  await saveStatus(next);
  return next;
}

/** ¿Responde el reproductor de InkaCat? Prueba el embed de un título real del catálogo. */
async function probe(items) {
  if (!items.length) return { ok: false, detail: 'catálogo vacío o sin respuesta' };
  const it = items.find((x) => x.ty === 'movie') || items[0];
  try {
    const r = await fetch(embedUrl(it.ty, it.id, 1, 1), {
      headers: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36' },
      signal: AbortSignal.timeout(12000),
    });
    const body = r.status === 200 ? await r.text() : '';
    const ok = r.status === 200 && body.length > 2000;
    return { ok, detail: ok ? 'ok' : `reproductor HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, detail: `reproductor sin respuesta (${e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'})` };
  }
}

/** Chequeo automático (lo llama el cron del bot cada 10 min). */
export async function checkPlayer(items) {
  const s = await getStatus();
  const p = await probe(items);
  s.lastCheck = { at: Date.now(), ok: p.ok, detail: p.detail };
  let posted = null;
  if (p.ok) { s.oks++; s.fails = 0; } else { s.fails++; s.oks = 0; }
  if (s.auto) {
    if (!p.ok && s.fails >= FAILS_TO_DOWN && s.state !== 'maint') {
      await announce(chatId(), 'maint', '', true);
      Object.assign(s, { state: 'maint', source: 'auto', note: '', postedAt: Date.now() }); posted = 'maint';
    } else if (p.ok && s.oks >= OKS_TO_UP && s.state === 'maint' && s.source === 'auto') {
      // Solo se anuncia la vuelta si el mantenimiento lo puso el chequeo automático;
      // si lo marcó el admin a mano, el admin decide cuándo avisar que volvió.
      await announce(chatId(), 'ok', '', true);
      Object.assign(s, { state: 'ok', source: 'auto', note: '', postedAt: Date.now() }); posted = 'ok';
    }
  }
  await saveStatus(s);
  return { ok: p.ok, detail: p.detail, posted };
}
