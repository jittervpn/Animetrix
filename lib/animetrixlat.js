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

/** Hasta `maxGroups` categorías con `perGroup` ítems cada una, para sumar filas en la página de inicio. */
export async function home(maxGroups = 8, perGroup = 16) {
  const key = 'atx:home';
  const hit = cget(key, 3 * 60e3);
  if (hit) return hit;
  let gs;
  try { gs = await groups(); } catch (e) { console.error('[animetrix] AnimetrixLat groups:', e.message); return { groups: [] }; }
  gs = gs.filter((g) => g.count > 0).sort((a, b) => b.count - a.count).slice(0, maxGroups);
  const rows = await Promise.all(gs.map(async (g) => {
    try { const r = await itemsByGroup(g.group, perGroup); return { group: g.group, total: r.total, items: r.items }; }
    catch { return { group: g.group, total: 0, items: [] }; }
  }));
  const res = { groups: rows.filter((r) => r.items.length) };
  cset(key, res);
  return res;
}
