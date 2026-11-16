// Servidor local que imita Vercel: estáticos de public/ + funciones de api/.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const ROUTES = { '/ver': '../api/ver.js', '/ver.php': '../api/ver.js', '/api/ver': '../api/ver.js', '/api/data': '../api/data.js', '/sitemap.xml': '../api/sitemap.js', '/api/notify': '../api/notify.js', '/abrir': '../api/abrir.js', '/api/pedido': '../api/pedido.js', '/compartir': '../api/compartir.js' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (ROUTES[url.pathname]) {
    req.query = Object.fromEntries(url.searchParams);
    const mod = await import(ROUTES[url.pathname]);
    return mod.default(req, res);
  }
  const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(path);
    res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end('404'); }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
