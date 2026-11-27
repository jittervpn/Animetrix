// Cliente de la API propia de AnimetrixLat (https://animetrixlat.vercel.app/docs).
// Fuente de catálogo EN PARALELO a InkaCat (lib/inkaflix.js): no la reemplaza.
// Solo se ejecuta en el servidor — si la API exige clave, esta nunca llega al navegador.
//
// Variables de entorno (opcionales):
//   ATX_API_BASE  (por defecto https://animetrixlat.vercel.app; o tu dominio propio)
//   ATX_API_KEY   (clave atx_…, solo si la API tiene activado "Exigir clave de API")

export const config = () => ({
  base: /^https:\/\/[a-z0-9.-]+$/i.test(process.env.ATX_API_BASE || '') ? process.env.ATX_API_BASE : 'https://animetrixlat.vercel.app',
  key: (process.env.ATX_API_KEY || '').trim(),
});

export class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

/* ---------------- caché en memoria (por instancia) ---------------- */
const cache = new Map();
function cget(k, ttlMs) { const e = cache.get(k); return e && Date.now() - e.t < ttlMs ? e.v : undefined; }
function cset(k, v) { if (cache.size > 300) cache.delete(cache.keys().next().value); cache.set(k, { t: Date.now(), v }); }

async function get(path, params = {}) {
  const { base, key } = config();
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  const hit = cget(url, 5 * 60e3);
  if (hit) return hit;
  let r;
  try {
    r = await fetch(url, {
      headers: { Accept: 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const stale = cget(url, Infinity);
    if (stale) return stale;
    console.error('[animetrix] AnimetrixLat sin conexión:', e.message);
    throw new ApiError(502, 'La API de AnimetrixLat no responde');
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

/* ---------------- validación (lista blanca de campos) ---------------- */
function asText(s, max = 300) {
  if (typeof s !== 'string' && typeof s !== 'number') return null;
  s = String(s).replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
const asInt = (v, min, max) => {
  if (typeof v === 'string' && /^\d{1,9}$/.test(v)) v = Number(v);
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
};
const asImg = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
export const asId = (v) => (typeof v === 'string' && /^[a-z0-9_-]{1,160}$/i.test(v) ? v : null);

function normItem(it, base) {
  if (!it || typeof it !== 'object') return null;
  const id = asId(it.id);
  if (!id) return null;
  const embed = typeof it.embed === 'string' && it.embed.startsWith(base + '/') ? it.embed : `${base}/embed/${encodeURIComponent(id)}`;
  return {
    id,
    title: asText(it.title, 140) || id,
    serie: asText(it.serie, 140),
    temporada: asInt(it.temporada, 0, 500),
    episodio: asInt(it.episodio, 0, 100000),
    group: asText(it.group, 60),
    lang: asText(it.lang, 20),
    description: asText(it.description, 1200),
    logo: asImg(it.logo),
    kind: asText(it.kind, 20),
    tmdb: asInt(it.tmdb, 1, 99999999),
    embed,
  };
}

/* ---------------- API pública del módulo ---------------- */
export async function groups() {
  const raw = await get('/api/v1/groups');
  const list = [].concat(raw.groups ?? raw.items ?? raw.data ?? []);
  return list
    .map((g) => ({
      group: asText(typeof g === 'object' && g ? (g.group ?? g.name) : g, 60),
      count: asInt(typeof g === 'object' && g ? (g.count ?? g.total) : null, 0, 1e7) ?? 0,
    }))
    .filter((g) => g.group);
}

export async function itemsByGroup(group, limit = 20, page = 1) {
  const { base } = config();
  const raw = await get('/api/v1/items', { group, sort: 'recent', limit: String(Math.min(Math.max(limit, 1), 1000)), page: String(page) });
  const list = [].concat(raw.items ?? []).filter((x) => x && typeof x === 'object');
  const items = list.map((x) => normItem(x, base)).filter(Boolean);
  return {
    total: asInt(raw.total, 0, 1e7) ?? items.length,
    page: asInt(raw.page, 1, 100000) ?? page,
    items,
  };
}

/** Un ítem con su descripción, episodios de la misma serie y navegación prev/next. */
export async function item(id) {
  const { base } = config();
  const safeId = asId(id);
  if (!safeId) throw new ApiError(400, 'ID no válido');
  const raw = await get(`/api/v1/items/${encodeURIComponent(safeId)}`);
  const it = raw.item && typeof raw.item === 'object' ? raw.item : raw;
  const norm = normItem(it, base);
  if (!norm) throw new ApiError(404, 'No encontrado');
  const pid = (x) => (x && typeof x === 'object' ? asId(x.id) : asId(x));
  const episodes = [].concat(raw.episodes ?? it.episodes ?? [])
    .map((x) => normItem(x, base)).filter(Boolean).slice(0, 500);
  return { ...norm, prev: pid(raw.prev ?? it.prev), next: pid(raw.next ?? it.next), episodes };
}

/** A qué tipo de Animetrix (movie/serie/anime) corresponde un "group" de tu panel. */
export const TYPES = ['movie', 'serie', 'anime'];
function typeOfGroup(group) {
  const g = String(group || '').toLowerCase();
  if (/anime/.test(g)) return 'anime';
  if (/(pelic|movie|film)/.test(g)) return 'movie';
  if (/(serie|tv|dorama)/.test(g)) return 'serie';
  return null; // "group" sin tipo claro: no se mezcla en Películas/Series/Anime
}

function slugKey(it) {
  // Agrupa episodios de la misma serie en un solo ítem (como hace InkaCat con temporadas/episodios).
  // Tu API no siempre completa "serie" en cada episodio (puede venir null): en ese caso se agrupa
  // por título, que sí suele repetirse igual en todos los episodios de un mismo show.
  if (it.serie) return 'serie:' + it.serie.trim().toLowerCase();
  if (it.title) return 'title:' + it.title.trim().toLowerCase();
  return 'id:' + it.id;
}

/**
 * Catálogo de AnimetrixLat agrupado por tipo y por serie, para mezclar directamente en las
 * filas/grillas de Películas, Series y Anime (en vez de aparecer como filas sueltas).
 */
export async function catalogByType() {
  const key = 'atx:bytype';
  const hit = cget(key, 3 * 60e3);
  if (hit) return hit;
  const out = { movie: [], serie: [], anime: [] };
  let gs;
  try { gs = await groups(); } catch (e) { console.error('[animetrix] AnimetrixLat groups:', e.message); return out; }
  const matching = gs.filter((g) => g.count > 0 && typeOfGroup(g.group));
  await Promise.all(matching.map(async (g) => {
    const type = typeOfGroup(g.group);
    try {
      const r = await itemsByGroup(g.group, 1000);
      const bySerie = new Map();
      for (const it of r.items) {
        if (it.tmdb) continue; // con TMDB entra como ficha normal (igual que InkaCat): ver tmdbCatalog()
        const key2 = slugKey(it);
        if (!bySerie.has(key2)) bySerie.set(key2, { atx: true, type, key: key2, title: it.serie || it.title, poster: it.logo, lang: it.lang, group: g.group, count: 0 });
        const entry = bySerie.get(key2);
        entry.count += 1;
        if (!entry.poster && it.logo) entry.poster = it.logo;
      }
      out[type].push(...bySerie.values());
    } catch (e) { console.error('[animetrix] AnimetrixLat itemsByGroup', g.group, e.message); }
  }));
  cset(key, out);
  return out;
}

/** Detalle de una serie (o ítem suelto) de AnimetrixLat: ficha + lista de episodios, como InkaCat. */
export async function serieDetail(type, key) {
  if (!TYPES.includes(type)) throw new ApiError(400, 'Tipo no válido');
  if (typeof key !== 'string' || !key || key.length > 200) throw new ApiError(400, 'ID no válido');
  let gs;
  try { gs = await groups(); } catch { throw new ApiError(502, 'La API de AnimetrixLat no responde'); }
  const matching = gs.filter((g) => g.count > 0 && typeOfGroup(g.group) === type);
  if (!matching.length) throw new ApiError(404, 'No encontrado');
  const items = [];
  for (const g of matching) {
    try { const r = await itemsByGroup(g.group, 1000); items.push(...r.items); } catch { /* seguimos con lo que haya */ }
  }
  const eps = items.filter((it) => slugKey(it) === key);
  if (!eps.length) throw new ApiError(404, 'No encontrado');
  eps.sort((a, b) => (a.temporada ?? 0) - (b.temporada ?? 0) || (a.episodio ?? 0) - (b.episodio ?? 0));
  const first = eps[0];
  return {
    type, key,
    title: first.serie || first.title,
    poster: eps.find((e) => e.logo)?.logo || null,
    lang: first.lang,
    description: eps.find((e) => e.description)?.description || null,
    episodes: eps.map((e) => ({ id: e.id, title: e.title, temporada: e.temporada, episodio: e.episodio })),
  };
}

/* ---------------- Formato estilo InkaCat (fichas con TMDB) ----------------
 * Tu API expone /api/v1/catalog y /api/v1/title igual que InkaCat. Los títulos con TMDB ID
 * se suman al catálogo de InkaCat (lib/inkaflix.js) y usan la misma ficha, Mi lista, Compartir,
 * Seguir viendo, reproductor y avisos del bot de Telegram. */
const TMDB_IMG = /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const tmdbImg = (u) => (typeof u === 'string' && TMDB_IMG.test(u) ? u : null);
const asYear = (v) => asInt(v, 1880, 2100);
const asRating = (v) => (typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v * 10) / 10 : null);
const asGenres = (g) => [].concat(g || []).map((x) => asText(typeof x === 'object' && x ? x.name : x, 40)).filter(Boolean).slice(0, 6);

/** Fichas con TMDB de un tipo (movie | serie | anime). Nunca lanza: si la API falla devuelve []. */
export async function tmdbCatalog(type) {
  const key = 'atx:tmdbcat:' + type;
  const hit = cget(key, 3 * 60e3);
  if (hit) return hit;
  const out = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const raw = await get('/api/v1/catalog', { type, page: String(page), per_page: '100' });
      for (const x of [].concat(raw.items || [])) {
        const tmdb = asInt(x?.tmdb, 1, 99999999);
        if (!tmdb) continue;
        out.push({
          type, tmdb,
          title: asText(x.title, 140) || 'Sin título',
          year: asYear(x.year),
          poster: tmdbImg(x.poster),
          episodes: asInt(x.episodes, 0, 100000) ?? 0,
          rating: asRating(x.rating),
          genres: asGenres(x.genres),
          src: 'atx',
        });
      }
      if (page >= (asInt(raw.pages, 1, 1000) ?? 1)) break;
    }
  } catch (e) {
    console.error('[animetrix] AnimetrixLat catalog', type, e.message);
    const stale = cget(key, Infinity);
    if (stale) return stale;
    return [];
  }
  cset(key, out);
  return out;
}

/** Ficha con temporadas/episodios (mismo formato que title() de InkaCat), o null si no está. */
export async function tmdbTitle(type, tmdb) {
  let raw;
  try { raw = await get('/api/v1/title', { type, tmdb: String(tmdb) }); } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  const seasons = [].concat(raw.seasons || []).map((s) => ({
    n: asInt(s?.season, 0, 500),
    episodes: [].concat(s?.episodes || []).map((e) => ({ n: asInt(e?.ep ?? e?.episode, 0, 100000), title: asText(e?.title, 120), still: null, src: 'atx' }))
      .filter((e) => e.n != null).sort((a, b) => a.n - b.n),
  })).filter((s) => s.n != null && s.episodes.length).sort((a, b) => a.n - b.n);
  return {
    type, tmdb,
    title: asText(raw.title, 140) || 'Sin título',
    year: asYear(raw.year),
    poster: tmdbImg(raw.poster),
    episodes: seasons.reduce((n, s) => n + s.episodes.length, 0),
    overview: asText(raw.overview, 1200),
    backdrop: tmdbImg(raw.backdrop),
    genres: asGenres(raw.genres),
    rating: asRating(raw.rating),
    votes: asInt(raw.votes, 0, 1e9) ?? 0,
    runtime: asInt(raw.runtime, 1, 1000),
    tagline: null,
    seasons: type === 'movie' ? [] : seasons,
    src: 'atx',
  };
}

/** URL del reproductor de tu API para una ficha con TMDB (/public/e/{type}?tmdb=&se=&ep=). */
export function playerUrl(type, tmdb, se, ep) {
  const { base, key } = config();
  const q = new URLSearchParams({ tmdb: String(tmdb) });
  if (type !== 'movie') { q.set('se', String(se ?? 1)); q.set('ep', String(ep ?? 1)); }
  if (key) q.set('key', key);
  return `${base}/public/e/${type}?${q}`;
}
