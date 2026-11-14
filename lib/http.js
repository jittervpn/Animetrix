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
  }
}

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; "
  + "font-src 'self'; img-src 'self' data: https://image.tmdb.org; "
  + "frame-src https://api.inkaflix.space; connect-src 'self'; object-src 'none'; base-uri 'none'; "
  + "form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests";

// Límite por IP en memoria (por instancia). Vercel además protege contra DDoS.
const hits = new Map();
export function rateLimited(req, max = 90) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '0').split(',')[0].trim();
  const win = Math.floor(Date.now() / 60000);
  const k = ip + ':' + win;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + win)) hits.delete(key);
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
