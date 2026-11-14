// Datos extra de TMDB (rating, géneros, fondo, duración). Solo servidor.
// Variable de entorno TMDB_KEY: acepta la "API Key" (v3) o el "Token de lectura" (v4).
import { asImg, asText, asInt } from './inkaflix.js';

const BASE = 'https://api.themoviedb.org/3';
const mem = new Map();

export const tmdbEnabled = () => Boolean((process.env.TMDB_KEY || '').trim());

async function tmdbGet(path) {
  const key = (process.env.TMDB_KEY || '').trim();
  if (!key) return null;
  const v4 = key.length > 40;
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}language=es-MX${v4 ? '' : '&api_key=' + encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', ...(v4 ? { Authorization: `Bearer ${key}` } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Devuelve { rating, votes, genres[], backdrop, runtime, seasons, tagline } o null. */
export async function tmdbInfo(type, tmdb) {
  const k = type + ':' + tmdb;
  const hit = mem.get(k);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
  const d = await tmdbGet(`/${type === 'movie' ? 'movie' : 'tv'}/${tmdb}`);
  let v = null;
  if (d && typeof d === 'object') {
    const rating = typeof d.vote_average === 'number' ? Math.round(d.vote_average * 10) / 10 : null;
    v = {
      rating: rating && d.vote_count > 0 ? rating : null,
      votes: asInt(d.vote_count, 0, 1e9) ?? 0,
      genres: (Array.isArray(d.genres) ? d.genres : []).map((g) => asText(g?.name, 40)).filter(Boolean).slice(0, 6),
      backdrop: asImg(d.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path : null),
      runtime: asInt(d.runtime ?? (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : null), 1, 1000),
      tagline: asText(d.tagline, 160),
    };
  }
  if (mem.size > 3000) mem.delete(mem.keys().next().value);
  mem.set(k, { t: Date.now(), v });
  return v;
}

/** Ejecuta fn sobre items con concurrencia limitada. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
