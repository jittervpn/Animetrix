import { tmdbInfo, mapLimit, tmdbEnabled } from './tmdb.js';

// Cliente de la API de InkaCat — solo se ejecuta en el servidor (funciones de Vercel).
// La API key se lee de la variable de entorno INKAFLIX_KEY y nunca se envía al navegador.

export const TYPES = ['movie', 'serie', 'anime'];
const BASE = 'https://api.inkaflix.space';
const TYPE_ALIASES = { movie: ['movie'], serie: ['serie', 'series', 'tv'], anime: ['anime'] };

export const config = () => ({
  key: (process.env.INKAFLIX_KEY || '').trim(),
  // Key del reproductor (si InkaCat te dio otra para los embeds). Si falta, usa INKAFLIX_KEY.
  viewKey: (process.env.INKAFLIX_VIEW_KEY || process.env.INKAFLIX_KEY || '').trim(),
  // Ruta del reproductor. InkaCat ahora usa /public/e/
  embedPath: /^\/[a-z/]*\/$/.test(process.env.INKAFLIX_EMBED_PATH || '') ? process.env.INKAFLIX_EMBED_PATH : '/public/e/',
  demo: process.env.INKAFLIX_DEMO === '1',
  host: process.env.SITE_HOST || 'animetrix.lat',
  sandbox: process.env.PLAYER_SANDBOX === '1', // desactivado: el reproductor de InkaCat no funciona aislado
});

export class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

/* ---------------- validación ---------------- */
export const asType = (v) => (typeof v === 'string' && TYPES.includes(v) ? v : null);
export function asInt(v, min, max) {
  if (typeof v === 'string' && /^\d{1,9}$/.test(v)) v = Number(v);
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}
export function asImg(u) {
  if (typeof u !== 'string' || !u) return null;
  if (u.startsWith('/')) u = 'https://image.tmdb.org/t/p/w500' + u;
  return /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(u) ? u : null;
}
export function asText(s, max = 300) {
  if (typeof s !== 'string' && typeof s !== 'number') return null;
  s = String(s).replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function embedUrl(type, tmdb, se, ep) {
  const q = new URLSearchParams({ tmdb: String(tmdb) });
  if (type !== 'movie') { q.set('se', String(se ?? 1)); q.set('ep', String(ep ?? 1)); }
  q.set('view_key', config().viewKey);
  return `${BASE}${config().embedPath}${type}?${q}`;
}

/* ---------------- caché en memoria (por instancia) ---------------- */
const cache = new Map();
const aliasHint = {};
function cget(k, ttlMs) { const e = cache.get(k); return e && Date.now() - e.t < ttlMs ? e.v : undefined; }
function cset(k, v) { if (cache.size > 500) cache.delete(cache.keys().next().value); cache.set(k, { t: Date.now(), v }); }

async function get(path, params) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const hit = cget(url, 10 * 60e3);
  if (hit) return hit;
  const { key } = config();
  if (!key) throw new ApiError(500, 'Falta la variable de entorno INKAFLIX_KEY');
  let r;
  try {
    r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': `Animetrix/1.0 (+https://${config().host})` },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    const stale = cget(url, Infinity);
    if (stale) return stale;
    console.error('[animetrix] InkaCat sin conexión:', e.message);
    throw new ApiError(502, 'El servidor de videos no responde');
  }
  if (r.status !== 200) throw new ApiError([400, 404].includes(r.status) ? r.status : 502, `API ${r.status}`);
  const text = await r.text();
  if (text.length > 5e6) throw new ApiError(502, 'Respuesta demasiado grande');
  let data;
  try { data = JSON.parse(text); } catch { throw new ApiError(502, 'Respuesta no válida'); }
  if (!data || typeof data !== 'object') throw new ApiError(502, 'Respuesta no válida');
  cset(url, data);
  return data;
}

async function getWithAliases(path, type, params) {
  const list = [...new Set([aliasHint[type], ...TYPE_ALIASES[type]].filter(Boolean))];
  let last;
  for (const alias of list) {
    try {
      const res = await get(path, { type: alias, ...params });
      aliasHint[type] = alias;
      return res;
    } catch (e) {
      last = e;
      if (e.status !== 400) throw e; // solo reintentamos si el "type" no fue aceptado
    }
  }
  throw last || new ApiError(502, 'Sin respuesta');
}

/* ---------------- normalización (lista blanca de campos) ---------------- */
const queryOf = (u) => { try { return Object.fromEntries(new URL(u).searchParams); } catch { return {}; } };
const num = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : null) : v);

function normItem(it, type) {
  let tmdb = asInt(num(it.tmdb ?? it.tmdb_id ?? it.id), 1, 99999999);
  if (tmdb == null && typeof it.embed === 'string') tmdb = asInt(queryOf(it.embed).tmdb, 1, 99999999);
  if (tmdb == null) return null;
  let year = asInt(num(it.year), 1880, 2100);
  const d = it.release_date ?? it.first_air_date;
  if (year == null && typeof d === 'string') year = asInt(d.slice(0, 4), 1880, 2100);
  return {
    type, tmdb,
    title: asText(it.title, 140) || asText(it.name, 140) || asText(it.titulo, 140) || 'Sin título',
    year,
    poster: asImg(it.poster ?? it.poster_path ?? it.image),
    episodes: asInt(num(it.episodes ?? 0), 0, 100000) ?? 0,
  };
}

function normSeasons(raw) {
  const flat = new Map();
  const push = (ep, hint) => {
    const q = typeof ep.embed === 'string' ? queryOf(ep.embed) : {};
    const se = asInt(num(ep.se ?? ep.season ?? ep.season_number ?? ep.temporada ?? q.se ?? hint), 0, 500);
    const en = asInt(num(ep.ep ?? ep.episode ?? ep.episode_number ?? ep.capitulo ?? ep.number ?? q.ep), 0, 100000);
    if (se == null || en == null) return;
    if (!flat.has(se)) flat.set(se, new Map());
    flat.get(se).set(en, { n: en, title: asText(ep.title ?? ep.name, 120), still: asImg(ep.still ?? ep.still_path ?? ep.image) });
  };
  for (const s of [].concat(raw.seasons ?? raw.temporadas ?? [])) {
    if (!s || typeof s !== 'object') continue;
    const sn = asInt(num(s.season ?? s.se ?? s.season_number ?? s.number), 0, 500);
    for (const ep of [].concat(s.episodes ?? s.episodios ?? [])) if (ep && typeof ep === 'object') push(ep, sn);
  }
  for (const ep of [].concat(raw.episodes ?? raw.episodios ?? [])) if (ep && typeof ep === 'object') push(ep, 1);
  return [...flat.keys()].sort((a, b) => a - b).map((n) => ({
    n, episodes: [...flat.get(n).values()].sort((a, b) => a.n - b.n),
  }));
}

/* ---------------- API pública del módulo ---------------- */
export async function catalog(type, page, q = '') {
  if (config().demo) return Demo.catalog(type, page, q);
  const raw = await getWithAliases('/api/v1/catalog', type, { page: String(page), ...(q ? { q } : {}) });
  const list = [].concat(raw.items ?? raw.results ?? raw.data ?? []);
  const items = list.filter((x) => x && typeof x === 'object').map((x) => normItem(x, type)).filter(Boolean);
  return {
    page: asInt(num(raw.page), 1, 100000) ?? page,
    per_page: asInt(num(raw.per_page), 1, 500) ?? 20,
    total: asInt(num(raw.total), 0, 1e7) ?? items.length,
    items,
  };
}

export async function title(type, tmdb) {
  if (config().demo) return Demo.title(type, tmdb);
  let raw = await getWithAliases('/api/v1/title', type, { tmdb: String(tmdb) });
  for (const k of ['item', 'title', 'data', 'result']) {
    if (raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k])) { raw = { ...raw, ...raw[k] }; break; }
  }
  const base = normItem({ tmdb, ...raw, ...(raw.tmdb ? {} : { tmdb }) }, type) || { type, tmdb, title: 'Sin título', year: null, poster: null, episodes: 0 };
  const genres = [].concat(raw.genres ?? raw.generos ?? [])
    .map((g) => asText(g && typeof g === 'object' ? g.name : g, 40)).filter(Boolean).slice(0, 6);
  const extra = await tmdbInfo(type, tmdb);
  return {
    ...base,
    overview: asText(raw.overview ?? raw.description ?? raw.sinopsis ?? raw.synopsis, 1200),
    backdrop: asImg(raw.backdrop ?? raw.backdrop_path ?? raw.cover) || extra?.backdrop || null,
    genres: genres.length ? genres : extra?.genres || [],
    rating: extra?.rating ?? null,
    votes: extra?.votes ?? 0,
    runtime: extra?.runtime ?? null,
    tagline: extra?.tagline ?? null,
    seasons: type === 'movie' ? [] : normSeasons(raw),
  };
}

/** Catálogo completo de un tipo (todas las páginas) con rating y géneros, para filtrar y contar. */
export async function catalogAll(type) {
  const key = 'all:' + type;
  const hit = cget(key, 2 * 60e3);
  if (hit) return hit;
  const first = await catalog(type, 1);
  const per = first.per_page || 20;
  const pages = Math.min(25, Math.ceil((first.total || 0) / per));
  const rest = pages > 1 ? await mapLimit(Array.from({ length: pages - 1 }, (_, i) => i + 2), 4, (p) => catalog(type, p).catch(() => ({ items: [] }))) : [];
  const seen = new Set();
  const items = [first, ...rest].flatMap((r) => r.items || []).filter((it) => !seen.has(it.tmdb) && seen.add(it.tmdb));
  const enriched = await mapLimit(items, 8, async (it) => {
    const x = config().demo ? { rating: 5 + ((it.tmdb * 37) % 45) / 10, genres: Demo.genresFor(it.tmdb) } : await tmdbInfo(type, it.tmdb);
    return { ...it, rating: x?.rating ?? null, genres: x?.genres || [] };
  });
  const res = { type, total: first.total ?? enriched.length, tmdb: tmdbEnabled() || config().demo, items: enriched };
  cset(key, res);
  return res;
}

/** Todo lo que necesita la página de inicio en una sola respuesta. */
export async function home() {
  const lists = {};
  const counts = {};
  await Promise.all(TYPES.map(async (t) => {
    try { const r = await catalogAll(t); lists[t] = r.items.slice(0, 24); counts[t] = r.total || r.items.length; }
    catch { lists[t] = []; counts[t] = null; }
  }));
  const all = [...lists.movie, ...lists.anime, ...lists.serie];
  const pool = all.filter((x) => x.poster).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
  let featured = null;
  if (pool.length) {
    const pick = pool[Math.floor(Date.now() / 600000) % pool.length]; // cambia cada 10 min
    try { featured = await title(pick.type, pick.tmdb); delete featured.seasons; } catch { featured = pick; }
  }
  return { counts, lists, featured };
}

/** Cantidad de títulos por tipo. */
export async function stats() {
  const out = {};
  await Promise.all(TYPES.map(async (t) => {
    try { out[t] = (await catalog(t, 1)).total || 0; } catch { out[t] = null; }
  }));
  return out;
}

/* ---------------- datos de ejemplo (INKAFLIX_DEMO=1) ---------------- */
const NAMES = {
  movie: ['Horizonte Rojo', 'La Última Señal', 'Ciudad de Neón', 'El Faro', 'Ecos del Sur', 'Vértigo Azul', 'Medianoche en Lima', 'Código Fantasma'],
  serie: ['Distrito 9 Sur', 'Los Herederos', 'Frecuencia', 'Archivo Cero', 'Río Abajo'],
  anime: ['Kaze no Ken', 'Astral Drive', 'Neko Shrine', 'Shinobi Code', 'Mecha Requiem', 'Sakura Protocol'],
};
const Demo = {
  genresFor: (i) => [['Acción', 'Aventura'], ['Drama'], ['Comedia', 'Romance'], ['Terror', 'Misterio'], ['Ciencia ficción', 'Acción'], ['Animación', 'Fantasía']][i % 6],
  catalog(type, page, q) {
    const items = NAMES[type].map((name, i) => ({ type, tmdb: 1000 + i + 100 * TYPES.indexOf(type), title: name, year: 2019 + (i % 7), poster: null, episodes: type === 'movie' ? 0 : 12 }))
      .filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()));
    return { page, per_page: 20, total: items.length, items: page === 1 ? items : [] };
  },
  title(type, tmdb) {
    const name = NAMES[type][(tmdb - 1000) % 100] || 'Título de ejemplo';
    const seasons = type === 'movie' ? [] : [1, 2].map((s) => ({ n: s, episodes: Array.from({ length: s === 1 ? 12 : 8 }, (_, i) => ({ n: i + 1, title: 'Episodio ' + (i + 1), still: null })) }));
    return { type, tmdb, title: name, year: 2023, poster: null, episodes: 20, overview: 'Sinopsis de ejemplo. Configura INKAFLIX_KEY para ver el catálogo real.', backdrop: null, genres: Demo.genresFor(tmdb), rating: 5 + ((tmdb * 37) % 45) / 10, votes: 120, runtime: 104, tagline: null, seasons };
  },
};
