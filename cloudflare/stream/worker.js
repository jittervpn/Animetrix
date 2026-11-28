// Reproductor de AnimetrixLat en Cloudflare (gratis: Cloudflare no cobra transferencia).
// Junta las partes de 19 MB que el convertidor guardó en tu canal privado de Telegram y las sirve como un
// solo .mp4, con Range (adelantar/atrasar). Tu API (/v/<id>) redirige acá con un link firmado que vence.
//
//   GET /s/<índice>/<nombre>.mp4?e=<vence>&s=<firma>
//
// Secreto del Worker: BOT_TOKEN (lo pone el flujo stream-worker.yml; nunca va en el código).

const TG = 'https://api.telegram.org';
const MAX_PIECES = 8;          // partes por respuesta (el plan gratis permite 50 pedidos internos por visita)
const PATH_TTL = 50 * 60e3;    // Telegram garantiza los file_path por 1 hora

// Memoria del Worker entre visitas (en workers.dev no hay caché de Cloudflare).
const manifests = new Map();   // índice → { t, m }
const paths = new Map();       // file_id → { t, path }

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(keyBytes, text) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(text));
}

/** Misma firma que api/_lib/tgstore.js de AnimetrixLat (clave derivada del token del bot). */
async function validSig(env, id, e, s) {
  if (!env.BOT_TOKEN || !/^\d{9,12}$/.test(e || '') || Number(e) < Date.now() / 1000 || !s) return false;
  const k = await hmac(enc.encode(env.BOT_TOKEN), 'atx-stream');
  const want = b64url(await hmac(k, `${id}.${e}`));
  if (want.length !== s.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}

async function filePath(env, fileId) {
  const hit = paths.get(fileId);
  if (hit && Date.now() - hit.t < PATH_TTL) return hit.path;
  const r = await fetch(`${TG}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const j = await r.json().catch(() => ({}));
  if (!j.ok || !j.result?.file_path) throw new Error(`Telegram: ${j.description || r.status}`);
  if (paths.size > 5000) paths.delete(paths.keys().next().value);
  paths.set(fileId, { t: Date.now(), path: j.result.file_path });
  return j.result.file_path;
}

const fileUrl = async (env, fileId) => `${TG}/file/bot${env.BOT_TOKEN}/${await filePath(env, fileId)}`;

async function manifest(env, id) {
  const hit = manifests.get(id);
  if (hit && Date.now() - hit.t < 24 * 3600e3) return hit.m;
  const r = await fetch(await fileUrl(env, id));
  if (!r.ok) throw new Error(`Telegram respondió ${r.status} al índice`);
  const m = await r.json();
  if (!m || !Array.isArray(m.parts) || !m.size || !m.piece) throw new Error('Índice inválido');
  if (manifests.size > 500) manifests.delete(manifests.keys().next().value);
  manifests.set(id, { t: Date.now(), m });
  return m;
}

/** Corta un flujo: saltea `skip` bytes y deja pasar `take`. */
function slicer(skip, take) {
  return new TransformStream({
    transform(chunk, ctl) {
      if (take <= 0) return;
      if (skip >= chunk.byteLength) { skip -= chunk.byteLength; return; }
      const part = chunk.subarray(skip, Math.min(chunk.byteLength, skip + take));
      skip = 0; take -= part.byteLength;
      ctl.enqueue(part);
    },
  });
}

/** Bytes [a, b] del video: se piden las partes de Telegram una detrás de otra, sin guardarlas en memoria. */
function body(env, m, a, b) {
  const { readable, writable } = new TransformStream();
  (async () => {
    try {
      for (let pos = a; pos <= b;) {
        const i = Math.floor(pos / m.piece);
        const off = pos - i * m.piece;
        const end = Math.min(b, (i + 1) * m.piece - 1);
        const len = end - pos + 1;
        const r = await fetch(await fileUrl(env, m.parts[i]), { headers: { Range: `bytes=${off}-${off + len - 1}` } });
        if (!r.ok || !r.body) throw new Error(`Telegram respondió ${r.status}`);
        const stream = r.status === 206 ? r.body : r.body.pipeThrough(slicer(off, len));
        await stream.pipeTo(writable, { preventClose: true });
        pos = end + 1;
      }
      await writable.close();
    } catch (e) {
      await writable.abort(e).catch(() => {});
    }
  })();
  return readable;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};
const text = (status, msg) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
    if (url.pathname === '/' || url.pathname === '/salud') return text(200, env.BOT_TOKEN ? 'AnimetrixLat stream: ok' : 'AnimetrixLat stream: falta BOT_TOKEN');
    const mt = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{20,200})(?:\/[^/]*)?$/);
    if (!mt || !['GET', 'HEAD'].includes(req.method)) return text(404, 'No encontrado.');
    const id = mt[1];
    if (!(await validSig(env, id, url.searchParams.get('e'), url.searchParams.get('s')))) return text(403, 'Enlace vencido o inválido.');

    let m;
    try { m = await manifest(env, id); } catch (e) { return text(502, `No se pudo leer el video: ${e.message}`); }
    const size = m.size;
    const headers = {
      ...CORS,
      'Content-Type': m.mime || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(m.name || 'video.mp4')}`,
    };

    // Rango pedido (los navegadores y la APK siempre piden uno: "bytes=0-").
    const range = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('Range') || '').trim());
    let a = 0, b = size - 1, partial = false;
    if (range) {
      partial = true;
      if (range[1] === '' && range[2] !== '') a = Math.max(0, size - Number(range[2]));
      else { a = Number(range[1] || 0); if (range[2] !== '') b = Math.min(Number(range[2]), size - 1); }
      if (a >= size || a > b) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    // Una respuesta trae como mucho MAX_PIECES partes; el reproductor pide lo que sigue solo.
    const firstPiece = Math.floor(a / m.piece);
    const cap = Math.min(size, (firstPiece + MAX_PIECES) * m.piece) - 1;
    if (b > cap) { b = cap; partial = true; }

    headers['Content-Length'] = String(b - a + 1);
    if (partial) headers['Content-Range'] = `bytes ${a}-${b}/${size}`;
    if (req.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
    return new Response(body(env, m, a, b), { status: partial ? 206 : 200, headers });
  },
};
