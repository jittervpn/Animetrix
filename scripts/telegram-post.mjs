// Publica automáticamente en el canal de Telegram los estrenos y episodios nuevos de Animetrix.
// Lo ejecuta GitHub Actions (.github/workflows/telegram.yml). Sin dependencias.
//
// Variables: TELEGRAM_BOT_TOKEN (secreto), TELEGRAM_CHAT_ID (por defecto @animetrixlat),
//            MODE = check | intro | weekly, STATE_FILE (por defecto .telegram/state.json)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const SITE = 'https://www.animetrix.lat';
const API = process.env.API_BASE || SITE; // solo para pruebas locales
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '@animetrixlat';
const MODE = process.env.MODE || 'check';
const STATE_FILE = process.env.STATE_FILE || '.telegram/state.json';
const MAX_POSTS = Number(process.env.MAX_POSTS || 5);   // por ejecución, para no inundar el canal
const DRY = process.env.DRY_RUN === '1';

const LABEL = { movie: '🎬 Nueva película', serie: '📺 Nueva serie', anime: '⭐ Nuevo anime' };
const TYPE_TAG = { movie: '#Pelicula', serie: '#Serie', anime: '#Anime' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (g) => '#' + String(g).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '');

async function getJSON(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'AnimetrixTelegram/1.0' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
    } catch { /* reintento */ }
    await sleep(3000 * (i + 1));
  }
  throw new Error('No se pudo leer ' + url);
}

async function tg(method, body) {
  if (DRY) { console.log('[dry-run]', method, JSON.stringify(body).slice(0, 300)); return { ok: true }; }
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return j;
    if (j.error_code === 429) { await sleep(((j.parameters?.retry_after) || 5) * 1000 + 500); continue; }
    throw new Error(`Telegram ${method}: ${j.error_code} ${j.description}`);
  }
  throw new Error(`Telegram ${method}: demasiados reintentos`);
}

function watchUrl(type, id) {
  return type === 'movie' ? `${SITE}/ver?t=movie&id=${id}` : `${SITE}/#/titulo/${type}/${id}`;
}

function buttons(type, id) {
  return { inline_keyboard: [[
    { text: '▶ Ver ahora', url: watchUrl(type, id) },
    { text: '📲 Descargar app', url: `${SITE}/app` },
  ]] };
}

async function details(type, id) {
  try { return await getJSON(`${API}/api/data?a=title&type=${type}&tmdb=${id}`); } catch { return null; }
}

function caption(head, d, it, extra = '') {
  const meta = [d?.year || null, d?.rating ? `⭐ ${Number(d.rating).toFixed(1)}` : null, d?.runtime && it.ty === 'movie' ? `${d.runtime} min` : null].filter(Boolean).join(' · ');
  const genres = (d?.genres || []).slice(0, 3).map(tag).join(' ');
  let ov = d?.overview || '';
  let text = `<b>${esc(head)}</b>\n\n<b>${esc(d?.title || it.t)}</b>${meta ? `\n${esc(meta)}` : ''}${extra}\n\n`;
  const tail = `\n\n${TYPE_TAG[it.ty] || ''} ${genres}`.trimEnd();
  const room = 1000 - text.length - tail.length;
  if (ov.length > room) ov = ov.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…';
  return text + esc(ov) + tail;
}

async function post(head, it, extra = '') {
  const d = await details(it.ty, it.id);
  const cap = caption(head, d, it, extra);
  const photo = (d?.backdrop || d?.poster || '').replace(/\/t\/p\/w\d+\//, '/t/p/w780/');
  if (photo.startsWith('https://image.tmdb.org/')) {
    await tg('sendPhoto', { chat_id: CHAT, photo, caption: cap, parse_mode: 'HTML', reply_markup: buttons(it.ty, it.id) });
  } else {
    await tg('sendMessage', { chat_id: CHAT, text: cap, parse_mode: 'HTML', reply_markup: buttons(it.ty, it.id), link_preview_options: { is_disabled: true } });
  }
  console.log('Publicado:', head, '-', it.t);
  await sleep(3500); // Telegram limita la frecuencia en canales
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function saveState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s));
}

async function weekly(items) {
  const rated = [];
  for (const it of items) {
    const d = await details(it.ty, it.id);
    if (d?.rating && d.votes >= 20) rated.push({ ...it, rating: d.rating, year: d.year });
    await sleep(150);
  }
  rated.sort((a, b) => b.rating - a.rating);
  const top = rated.slice(0, 10);
  if (!top.length) return;
  const icon = { movie: '🎬', serie: '📺', anime: '⭐' };
  const lines = top.map((x, i) => `${i + 1}. ${icon[x.ty] || ''} <a href="${watchUrl(x.ty, x.id)}">${esc(x.t)}</a> — ⭐ ${x.rating.toFixed(1)}`);
  const text = `<b>🏆 Lo mejor valorado de la semana en Animetrix</b>\n\n${lines.join('\n')}\n\n📲 Descarga la app: ${SITE}/app\n#TopSemanal`;
  await tg('sendMessage', { chat_id: CHAT, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  console.log('Resumen semanal publicado');
}

async function main() {
  if (!TOKEN && !DRY) throw new Error('Falta el secreto TELEGRAM_BOT_TOKEN');
  if (!DRY) await tg('getChat', { chat_id: CHAT }); // falla rápido si el bot no es admin del canal

  const data = await getJSON(`${API}/api/notify`);
  const items = (data.items || []).filter((x) => x && x.k && x.ty && x.id);
  if (!items.length) { console.log('Catálogo vacío o no disponible: no se hace nada.'); return; }

  if (MODE === 'weekly') return weekly(items);

  let state = loadState();
  if (!state) {
    // Primera vez (o estado perdido): se guarda todo sin publicar…
    state = { known: Object.fromEntries(items.map((x) => [x.k, x.e || 0])), since: new Date().toISOString() };
    saveState(state);
    console.log(`Estado inicial guardado (${items.length} títulos).`);
    if (MODE !== 'intro') return;
    // …salvo en modo "intro": se publica lo más reciente de cada tipo para estrenar el canal.
    for (const ty of ['movie', 'anime', 'serie']) {
      const it = items.find((x) => x.ty === ty);
      if (it) await post(LABEL[ty], it);
    }
    return;
  }

  let posted = 0;
  for (const it of items) {
    if (posted >= MAX_POSTS) break;
    const prev = state.known[it.k];
    if (prev === undefined) {
      await post(LABEL[it.ty] || 'Nuevo en Animetrix', it);
      state.known[it.k] = it.e || 0; posted++; saveState(state);
    } else if ((it.e || 0) > prev && prev > 0) {
      const extra = `\n▶ Episodio ${it.e} disponible`;
      await post(`▶ Nuevo episodio de ${it.t}`, it, extra);
      state.known[it.k] = it.e; posted++; saveState(state);
    }
  }
  console.log(posted ? `${posted} publicación(es).` : 'Sin novedades.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
