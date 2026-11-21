// /app-ads.txt — AdMob lo exige en el sitio del desarrollador para autorizar los anuncios de la app.
// Se arma solo: siempre incluye la cuenta de AdSense y, si el App ID del panel es de otra
// cuenta, también esa.
import { getAds } from '../lib/ads.js';

const BASE = 'pub-5047047508633424';

export default async function handler(req, res) {
  const pubs = new Set([BASE]);
  try {
    const { appId } = await getAds();
    const m = /^ca-app-pub-(\d+)~/.exec(appId || '');
    if (m) pubs.add('pub-' + m[1]);
  } catch { /* se sirve al menos la cuenta base */ }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end([...pubs].map((p) => `google.com, ${p}, DIRECT, f08c47fec0942fa0`).join('\n') + '\n');
}
