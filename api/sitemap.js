// /sitemap.xml — lista todas las páginas que Google debe indexar (se genera solo con el catálogo).
import { catalogAll, title, TYPES } from '../lib/inkaflix.js';
import { mapLimit } from '../lib/tmdb.js';

const SITE = 'https://www.animetrix.lat';
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  const urls = [{ loc: SITE + '/', priority: '1.0', freq: 'daily' }];
  for (const t of TYPES) {
    let items = [];
    try { items = (await catalogAll(t)).items || []; } catch { /* sigue con lo que haya */ }
    const entries = await mapLimit(items, 6, async (it) => {
      if (t === 'movie') return [{ loc: `${SITE}/ver?t=movie&id=${it.tmdb}`, priority: '0.8', freq: 'weekly' }];
      let seasons = [];
      try { seasons = (await title(t, it.tmdb)).seasons || []; } catch { /* solo el primer episodio */ }
      const eps = seasons.length ? seasons.flatMap((s) => s.episodes.map((e) => [s.n, e.n])) : [[1, 1]];
      return eps.slice(0, 200).map(([s, e], i) => ({ loc: `${SITE}/ver?t=${t}&id=${it.tmdb}&se=${s}&ep=${e}`, priority: i === 0 ? '0.8' : '0.5', freq: 'weekly' }));
    });
    urls.push(...entries.flat());
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${x(u.loc)}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')
    + '\n</urlset>\n';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(xml);
}
