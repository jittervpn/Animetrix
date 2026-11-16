// Publicador del canal de Telegram (corre en Vercel, lo activa cron-job.org cada 10 minutos).
// Estado (qué ya se publicó) en Vercel Blob privado.
import { get, put } from '@vercel/blob';
import { catalogAll, title, TYPES } from './inkaflix.js';

const SITE = 'https://www.animetrix.lat';
const STATE = 'telegram/state.json';
const LABEL = { movie: '🎬 Nueva película', serie: '📺 Nueva serie', anime: '⭐ Nuevo anime' };
const TYPE_TAG = { movie: '#Pelicula', serie: '#Serie', anime: '#Anime' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (g) => '#' + String(g).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '');
const watchUrl = (type, id) => `${SITE}/abrir?t=${type}&id=${id}`;

async function tg(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return j;
    if (j.error_code === 429) { await sleep(((j.parameters?.retry_after) || 3) * 1000 + 300); continue; }
    throw new Error(`Telegram ${method}: ${j.error_code} ${j.description}`);
  }
  throw new Error(`Telegram ${method}: demasiados reintentos`);
}

async function loadState() {
  try {
    const r = await get(STATE, { access: 'private' });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch { return null; }
}
async function saveState(s) {
  await put(STATE, JSON.stringify(s), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

async function allItems() {
  const items = [];
  for (const t of TYPES) {
    try { for (const it of (await catalogAll(t)).items || []) items.push({ k: `${t}:${it.tmdb}`, ty: t, id: it.tmdb, t: it.title, e: it.episodes || 0 }); }
    catch { /* tipo no disponible */ }
  }
  return items;
}

function caption(head, d, it, extra = '') {
  const meta = [d?.year || null, d?.rating ? `⭐ ${Number(d.rating).toFixed(1)}` : null, d?.runtime && it.ty === 'movie' ? `${d.runtime} min` : null].filter(Boolean).join(' · ');
  const genres = (d?.genres || []).slice(0, 3).map(tag).join(' ');
  let ov = d?.overview || '';
  const text = `<b>${esc(head)}</b>\n\n<b>${esc(d?.title || it.t)}</b>${meta ? `\n${esc(meta)}` : ''}${extra}\n\n`;
  const tail = `\n\n${TYPE_TAG[it.ty] || ''} ${genres}`.trimEnd();
  const room = 1000 - text.length - tail.length;
  if (ov.length > room) ov = ov.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…';
  return text + esc(ov) + tail;
}

async function post(chat, head, it, extra = '') {
  let d = null;
  try { d = await title(it.ty, it.id); } catch { /* sin detalles */ }
  const cap = caption(head, d, it, extra);
  const markup = { inline_keyboard: [[{ text: '▶ Ver ahora', url: watchUrl(it.ty, it.id) }, { text: '📲 Descargar app', url: `${SITE}/app` }]] };
  const photo = (d?.backdrop || d?.poster || '').replace(/\/t\/p\/w\d+\//, '/t/p/w780/');
  if (photo.startsWith('https://image.tmdb.org/')) await tg('sendPhoto', { chat_id: chat, photo, caption: cap, parse_mode: 'HTML', reply_markup: markup });
  else await tg('sendMessage', { chat_id: chat, text: cap, parse_mode: 'HTML', reply_markup: markup, link_preview_options: { is_disabled: true } });
  await sleep(1500);
}

async function weekly(chat, items) {
  const rated = [];
  for (const it of items) {
    try { const d = await title(it.ty, it.id); if (d?.rating && d.votes >= 20) rated.push({ ...it, rating: d.rating }); } catch { /* sigue */ }
  }
  rated.sort((a, b) => b.rating - a.rating);
  const top = rated.slice(0, 10);
  if (!top.length) return false;
  const icon = { movie: '🎬', serie: '📺', anime: '⭐' };
  const lines = top.map((x, i) => `${i + 1}. ${icon[x.ty] || ''} <a href="${watchUrl(x.ty, x.id)}">${esc(x.t)}</a> — ⭐ ${x.rating.toFixed(1)}`);
  await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    text: `<b>🏆 Lo mejor valorado de la semana en Animetrix</b>\n\n${lines.join('\n')}\n\n📲 Descarga la app: ${SITE}/app\n#TopSemanal` });
  return true;
}

/** Hora de Argentina (UTC-3) para el resumen semanal: domingo 21:00. */
function weekKeyIfSundayNight(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3600e3);
  if (ar.getUTCDay() !== 0 || ar.getUTCHours() < 21) return null;
  return ar.toISOString().slice(0, 10);
}

export async function runTelegram({ maxPosts = 5 } = {}) {
  const chat = process.env.TELEGRAM_CHAT_ID || '@animetrixlat';
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const items = await allItems();
  if (!items.length) return { posted: 0, note: 'catálogo no disponible' };

  let state = await loadState();
  if (!state) {   // primera vez en Vercel: se guarda lo que hay, sin publicar (el canal ya tiene lo anterior)
    state = { known: Object.fromEntries(items.map((x) => [x.k, x.e || 0])), since: new Date().toISOString() };
    await saveState(state);
    return { posted: 0, note: `estado inicial (${items.length} títulos)` };
  }

  let posted = 0;
  for (const it of items) {
    if (posted >= maxPosts) break;
    const prev = state.known[it.k];
    if (prev === undefined) {
      await post(chat, LABEL[it.ty] || 'Nuevo en Animetrix', it);
      state.known[it.k] = it.e || 0; posted++; await saveState(state);
    } else if ((it.e || 0) > prev && prev > 0) {
      await post(chat, `▶ Nuevo episodio de ${it.t}`, it, `\n▶ Episodio ${it.e} disponible`);
      state.known[it.k] = it.e; posted++; await saveState(state);
    }
  }

  const wk = weekKeyIfSundayNight();
  if (wk && state.lastWeekly !== wk) {
    if (await weekly(chat, items)) { state.lastWeekly = wk; await saveState(state); }
  }
  return { posted };
}
