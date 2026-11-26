// /api/app-config — configuración remota de la app Android (por ahora: banner de AdMob).
// La app la consulta al abrir; el workflow del APK la usa para leer el App ID.
import { securityHeaders, rateLimited, sendJson } from '../lib/http.js';
import { getAds, publicView } from '../lib/ads.js';
import { pruebaApi } from '../lib/prueba-api.js';

export default async function handler(req, res) {
  // /prueba-api (página de prueba de la API de AnimetrixLat) comparte esta función por el límite de 12 del plan Hobby.
  if (req.query && req.query.vista === 'prueba') return pruebaApi(req, res);
  securityHeaders(res, false);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return sendJson(res, 405, { error: 'Método no permitido' }); }
  if (rateLimited(req, 60)) { res.setHeader('Retry-After', '60'); return sendJson(res, 429, { error: 'Demasiadas peticiones' }); }
  // Caché corto en la CDN: un cambio del panel llega a la app en ~1 minuto.
  return sendJson(res, 200, { v: 1, ads: publicView(await getAds()) }, 30);
}
