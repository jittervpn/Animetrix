// ==========================================================================
//  Interruptores por tipo (películas, series, anime).
//  El admin los enciende/apaga desde /admin; se guardan en Vercel Blob.
//  Cada instancia los cachea 20 s, así un cambio se aplica en todo el sitio
//  en menos de medio minuto, sin redesplegar.
// ==========================================================================
import { get, put } from '@vercel/blob';
import { TYPES } from './inkaflix.js';

const PATH = 'config/flags.json';
const TTL = 20_000;
let cache = null;
let cachedAt = 0;

const allOn = () => Object.fromEntries(TYPES.map((t) => [t, true]));

function clean(obj) {
  const out = allOn();
  if (obj && typeof obj === 'object') for (const t of TYPES) if (obj[t] === false) out[t] = false;
  return out;
}

/** Lee los interruptores (con caché). Si algo falla, todo queda ENCENDIDO. */
export async function getFlags() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL) return cache;
  try {
    const r = await get(PATH, { access: 'private' });
    if (r && r.statusCode === 200) cache = clean(JSON.parse(await new Response(r.stream).text()));
    else cache = allOn();
  } catch { cache = allOn(); }
  cachedAt = now;
  return cache;
}

/** Enciende o apaga un tipo. Devuelve el estado completo ya actualizado. */
export async function setFlag(type, on) {
  if (!TYPES.includes(type)) throw new Error('tipo no válido');
  const cur = await getFlags();
  const next = { ...cur, [type]: !!on };
  await put(PATH, JSON.stringify(next), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  cache = next; cachedAt = Date.now();
  return next;
}

/** true si ese tipo está activo ahora mismo. */
export async function typeEnabled(type) {
  return (await getFlags())[type] !== false;
}
