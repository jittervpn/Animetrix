// ==========================================================================
//  Configuración de AdMob (banner de la app Android).
//  El admin la cambia desde /admin; se guarda en Vercel Blob (config/ads.json).
//  La app la lee en /api/app-config, así se puede encender/apagar el banner o
//  cambiar el ID del bloque de anuncios sin publicar un APK nuevo.
//  (El App ID sí va dentro del APK: el próximo build lo toma de aquí.)
// ==========================================================================
import { get, put } from '@vercel/blob';

const PATH = 'config/ads.json';
const TTL = 20_000;
let cache = null;
let cachedAt = 0;

// IDs oficiales de prueba de Google (seguros para probar sin riesgo de baneo).
export const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
export const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/9214589741';

const APP_ID_RE = /^ca-app-pub-\d{10,20}~\d{6,14}$/;
const UNIT_ID_RE = /^ca-app-pub-\d{10,20}\/\d{6,14}$/;
const POSITIONS = ['bottom', 'top'];

export const DEFAULTS = Object.freeze({
  enabled: false,       // banner apagado hasta que el admin lo encienda
  appId: '',            // ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
  bannerId: '',         // ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
  position: 'bottom',   // abajo o arriba de la pantalla
  hideOnPlayer: true,   // no mostrar mientras se ve un video (/ver)
  test: true,           // anuncios de prueba de Google
  updatedAt: 0,
});

const bad = (msg) => Object.assign(new Error(msg), { userError: true });

/** Valida y normaliza. Lanza Error con un mensaje legible si algo no es válido. */
export function validate(input) {
  if (!input || typeof input !== 'object') throw bad('Datos no válidos');
  const appId = String(input.appId ?? '').trim();
  const bannerId = String(input.bannerId ?? '').trim();
  if (appId && !APP_ID_RE.test(appId)) throw bad('El App ID debe tener el formato ca-app-pub-0000000000000000~0000000000');
  if (bannerId && !UNIT_ID_RE.test(bannerId)) throw bad('El ID del banner debe tener el formato ca-app-pub-0000000000000000/0000000000');
  if (appId && bannerId && appId.split('~')[0] !== bannerId.split('/')[0]) throw bad('El App ID y el ID del banner son de cuentas distintas');
  const out = {
    enabled: input.enabled === true,
    appId,
    bannerId,
    position: POSITIONS.includes(input.position) ? input.position : 'bottom',
    hideOnPlayer: input.hideOnPlayer !== false,
    test: input.test === true,
  };
  if (out.enabled && !out.test && !out.bannerId) throw bad('Para mostrar anuncios reales falta el ID del banner');
  return out;
}

function clean(obj) {
  try { return { ...DEFAULTS, ...validate(obj), updatedAt: Number(obj?.updatedAt) || 0 }; } catch { return { ...DEFAULTS }; }
}

/** Lee la configuración (con caché). Si algo falla, el banner queda APAGADO. */
export async function getAds() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL) return cache;
  try {
    const r = await get(PATH, { access: 'private' });
    cache = r && r.statusCode === 200 ? clean(JSON.parse(await new Response(r.stream).text())) : { ...DEFAULTS };
  } catch { cache = cache || { ...DEFAULTS }; }
  cachedAt = now;
  return cache;
}

/** Guarda la configuración completa (ya validada). */
export async function setAds(input) {
  const next = { ...validate(input), updatedAt: Date.now() };
  await put(PATH, JSON.stringify(next), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  cache = next; cachedAt = Date.now();
  return next;
}

/** Lo que recibe la app (nada secreto: estos IDs son públicos por naturaleza). */
export function publicView(a) {
  const live = a.enabled && (a.test || !!a.bannerId);
  return {
    enabled: live,
    appId: a.appId || null,
    banner: !live ? null : (a.test ? TEST_BANNER_ID : a.bannerId),
    test: a.test,
    position: a.position,
    hideOnPlayer: a.hideOnPlayer,
    v: a.updatedAt,
  };
}
