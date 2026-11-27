// Utilidades HTTP compartidas por las funciones: cabeceras de seguridad y límite de peticiones.

export function securityHeaders(res, html = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (html) {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  } else {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex');
  }
}

// Incluye los dominios de Google AdSense (scripts, iframes de anuncios, medición y consentimiento).
const G_SCRIPT = 'https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://partner.googleadservices.com https://www.googletagservices.com https://adservice.google.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com';
const G_FRAME = 'https://googleads.g.doubleclick.net https://*.googlesyndication.com https://www.google.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com';
const G_CONNECT = 'https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com';
// AnimetrixLat (lib/animetrixlat.js): fuente de catálogo en paralelo a InkaCat, reproductor propio vía iframe.
// Si cambias ATX_API_BASE a un dominio propio, actualiza también este origen (y el de vercel.json).
const ATX_FRAME = 'https://animetrixlat.vercel.app';
export const CSP = `default-src 'self'; script-src 'self' ${G_SCRIPT}; style-src 'self' 'unsafe-inline'; `
  + "font-src 'self'; img-src 'self' data: https:; "
  + `frame-src https://api.inkaflix.space ${ATX_FRAME} ${G_FRAME}; connect-src 'self' ${G_CONNECT}; object-src 'none'; base-uri 'none'; `
  + "form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests";

// Límite por IP en memoria (por instancia). Vercel además protege contra DDoS.
const hits = new Map();
/** Registra actividad sospechosa en los logs de Vercel (sin datos personales completos). */
export function logSuspicious(req, reason) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '?').split(',')[0].trim();
  const masked = ip.replace(/(\d+)\.(\d+)$/, 'x.x').replace(/:[0-9a-f]*:[0-9a-f]*$/i, ':x:x');
  console.warn(`[animetrix-security] ${reason} ip=${masked} path=${String(req.url || '').slice(0, 120)} ua=${String(req.headers['user-agent'] || '').slice(0, 60)}`);
}

export function rateLimited(req, max = 90) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '0').split(',')[0].trim();
  const win = Math.floor(Date.now() / 60000);
  const k = ip + ':' + win;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + win)) hits.delete(key);
  if (n === max + 1) logSuspicious(req, 'rate-limit');
  return n > max;
}

export function sendJson(res, status, data, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheSeconds > 0
    ? `public, max-age=60, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
    : 'no-store');
  res.end(JSON.stringify(data).replace(/</g, '\\u003c'));
}
