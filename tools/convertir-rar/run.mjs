// Convertidor de .rar grandes para el bot de Telegram de AnimetrixLat.
// Lo lanza el bot (workflow_dispatch de convertir-rar.yml) cuando el archivo pesa más de lo que aguanta Vercel.
//
//  1. Pide al bot los datos del trabajo (link, contraseña) con el token OIDC de GitHub: no hay secretos en el repo.
//  2. Descarga el .rar de MediaFire (retoma si se corta), lo descomprime y busca el video.
//  3. Lo pasa a .mp4 apto para el navegador (copia el video; audio en AAC, prefiere español; "faststart").
//  4. Sube el .mp4 por partes a tu MediaFire con un token de subida que da el bot, y el bot lo agrega al panel.
//
// Variables: JOB (id del trabajo), API (https://tu-api), WORK (carpeta de trabajo).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const JOB = String(process.env.JOB || '').trim();
const API = String(process.env.API || '').trim().replace(/\/+$/, '');
const WORK = process.env.WORK || path.resolve('work');
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const VIDEO_RE = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|wmv|flv)$/i;
const MF = 'https://www.mediafire.com/api/1.5';

const gb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : (n / 1048576).toFixed(1) + ' MB').replace('.', ',');
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const mask = (v) => { if (v) console.log(`::add-mask::${v}`); };

class Fail extends Error {}

/* ------------------------------------------------ hablar con el bot */
async function oidc() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) throw new Fail('Falta el permiso id-token del flujo de GitHub.');
  const r = await fetch(`${u}&audience=animetrixlat`, { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json().catch(() => ({}));
  if (!j.value) throw new Fail(`GitHub no dio el token de identidad (${r.status}).`);
  return j.value;
}

async function bot(action, body = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${API}/api/bot?gh=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await oidc()}` },
        body: JSON.stringify({ job: JOB, ...body }),
        signal: AbortSignal.timeout(290000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return j;
      if (r.status >= 400 && r.status < 500) throw new Fail(j.error || `El bot respondió ${r.status}`);
      throw new Error(j.error || `El bot respondió ${r.status}`);
    } catch (e) {
      if (e instanceof Fail || i >= tries) throw e;
      await sleep(3000 * i);
    }
  }
}

let lastSent = 0, lastText = '';
async function progress(text, force = false) {
  console.log(text);
  if (text === lastText || (!force && Date.now() - lastSent < 12000)) return;
  lastSent = Date.now(); lastText = text;
  try { await bot('progress', { text }, 1); } catch (e) { console.log('aviso no enviado:', e.message); }
}
const pctOf = (a, b) => (b ? Math.min(100, Math.floor((a / b) * 100)) : 0);

/* ------------------------------------------------ descarga */
function mediafireKey(raw) {
  try {
    const u = new URL(raw);
    const seg = u.pathname.split('/').filter(Boolean);
    if (/^download\d*\.mediafire\.com$/i.test(u.hostname)) return seg[1] || null;
    const i = seg.findIndex((s) => /^(file|download|view|file_premium)$/i.test(s));
    if (i >= 0 && seg[i + 1]) return seg[i + 1];
    return u.searchParams.get('key') || (u.search.slice(1).match(/^\w{8,}$/) || [])[0] || null;
  } catch { return null; }
}

/** Link de descarga fresco desde la página del archivo (por si el que mandaste ya venció). */
async function fromPage(page) {
  const r = await fetch(page, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'es-ES,es;q=0.9' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`la página de MediaFire respondió ${r.status}`);
  const html = await r.text();
  let m = html.match(/href=["'](https:\/\/download\d*\.mediafire\.com\/[^"']+)["']/i);
  if (m) return m[1].replace(/&amp;/g, '&');
  m = html.match(/data-scrambled-url=["']([^"']+)["']/i);
  if (m) {
    const d = Buffer.from(m[1], 'base64').toString('utf8');
    if (/^https:\/\/download\d*\.mediafire\.com\//.test(d)) return d;
  }
  throw new Error('la página de MediaFire no tiene el link de descarga');
}

async function download(link, page, dest) {
  const urls = [link];
  let have = 0, total = 0, triedPage = false, lastErr = '';
  for (let attempt = 1; attempt <= 8; attempt++) {
    const url = urls[urls.length - 1];
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': UA, ...(have ? { Range: `bytes=${have}-` } : {}) }, redirect: 'follow' });
    } catch (e) { lastErr = e.message; await sleep(4000 * attempt); continue; }
    const html = /text\/html/i.test(r.headers.get('content-type') || '');
    if (!r.ok || html) {
      lastErr = html ? 'el link abre una página, no el archivo (venció o no es directo)' : `respondió ${r.status}`;
      try { await r.body?.cancel(); } catch { /* nada */ }
      if (!triedPage && page) {
        triedPage = true;
        try { urls.push(await fromPage(page)); continue; } catch (e) { lastErr += `; ${e.message}`; }
      }
      if (r.status >= 400 && r.status < 500 || html) break;
      await sleep(4000 * attempt);
      continue;
    }
    if (r.status === 200 && have) have = 0;   // el servidor no retomó: empezar de nuevo
    const cr = (r.headers.get('content-range') || '').split('/')[1];
    total = Number(cr) || (have + Number(r.headers.get('content-length') || 0)) || total;
    let got = have;
    const count = new Transform({
      transform(c, _e, cb) {
        got += c.length;
        progress(`⬇️ Descargando ${gb(total)}… ${pctOf(got, total)}%`);
        cb(null, c);
      },
    });
    try {
      await pipeline(Readable.fromWeb(r.body), count, fs.createWriteStream(dest, { flags: have ? 'a' : 'w' }));
    } catch (e) { lastErr = e.message; }
    have = fs.statSync(dest).size;
    if (total && have >= total) return { size: have, name: decodeURIComponent(new URL(r.url || url).pathname.split('/').pop() || '').replace(/\+/g, ' ') };
    if (!total && !lastErr) return { size: have, name: '' };
    await sleep(3000 * attempt);
  }
  const mf = /mediafire\.com/i.test(link);
  throw new Fail(`${mf ? 'MediaFire' : 'El sitio'} no dejó descargar el archivo (${lastErr || 'error'}). ${mf ? 'Abrí el link en MediaFire, tocá Descargar' : 'Abrí la página de descarga, copiá el link de descarga nuevo'} y mandáselo al bot.`);
}

/* ------------------------------------------------ programas */
function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve) => {
    let tail = '';
    const stdout = [];
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-6000);
      if (onLine) for (const l of s.split(/[\r\n]+/)) if (l) onLine(l);
    };
    p.stdout.on('data', (d) => { stdout.push(d); take(d); });
    p.stderr.on('data', take);
    p.on('error', (e) => resolve({ code: -1, out: e.message, stdout: '' }));
    p.on('close', (code) => resolve({ code, out: tail, stdout: Buffer.concat(stdout).toString() }));
  });
}
async function has(cmd) { return (await run('sh', ['-c', `command -v ${cmd}`])).code === 0; }

async function magic(file) {
  const fh = await fsp.open(file, 'r');
  const b = Buffer.alloc(8);
  await fh.read(b, 0, 8, 0); await fh.close();
  if (b.subarray(0, 4).toString('latin1') === 'Rar!') return 'rar';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (b.subarray(0, 2).toString('latin1') === '7z') return '7z';
  return 'otro';
}

async function extract(file, outDir, pw) {
  await fsp.mkdir(outDir, { recursive: true });
  const kind = await magic(file);
  if (kind === 'otro') return false;   // no es un archivo comprimido: puede ser el video mismo
  const tools = [];
  if (kind === 'rar' && await has('unrar')) tools.push('unrar');
  for (const z of ['7zz', '7z']) if (await has(z)) { tools.push(z); break; }
  if (!tools.length) throw new Fail('No hay programa para descomprimir en GitHub (unrar/7z).');
  let last = '';
  for (const t of tools) {
    const args = t === 'unrar'
      ? ['x', '-o+', '-y', pw ? `-p${pw}` : '-p-', file, outDir + path.sep]
      : ['x', '-y', '-bso0', '-bsp0', `-o${outDir}`, `-p${pw || ''}`, file];
    const r = await run(t, args);
    if (r.code === 0) return true;
    last = r.out;
    console.log(`${t} terminó con ${r.code}:\n${r.out}`);
    if (/incorrect password|wrong password|checksum error in the encrypted|corrupt.*password|enter password|encrypted/i.test(r.out) || (t === 'unrar' && r.code === 11)) {
      throw new Fail(pw
        ? 'La contraseña del .rar no es correcta. Mandale al bot: link contraseña'
        : 'El .rar tiene contraseña. Mandale al bot: link contraseña');
    }
  }
  if (/multi|volume|next volume|part\d/i.test(last)) throw new Fail('El .rar es parte de un archivo dividido (part1, part2…): hace falta un .rar por episodio.');
  throw new Fail(`No se pudo descomprimir el archivo (${last.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200) || 'error'}).`);
}

async function biggestVideo(dir) {
  const found = [];
  async function walk(d) {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else found.push({ f, name: e.name, size: (await fsp.stat(f)).size });
    }
  }
  await walk(dir);
  const vids = found.filter((x) => VIDEO_RE.test(x.name)).sort((a, b) => b.size - a.size);
  if (!vids.length) throw new Fail(`El archivo no tiene un video${found.length ? ` (tiene: ${found.slice(0, 8).map((x) => x.name).join(', ')})` : ''}.`);
  return vids[0];
}

/* ------------------------------------------------ .mp4 para el navegador */
const SPANISH = /^(spa|es|esp|lat|spl|es-\w+)$/i;
function pickAudio(streams) {
  const aud = streams.filter((s) => s.codec_type === 'audio');
  if (!aud.length) return null;
  const score = (s) => {
    const lang = s.tags?.language || '', title = s.tags?.title || '';
    let n = 0;
    if (SPANISH.test(lang) || /latin|espa|castell|spanish/i.test(title)) n += 4;
    if (/latin/i.test(title) || /^lat$/i.test(lang)) n += 1;   // si hay latino y castellano, latino
    if (s.disposition?.default) n += 1;
    if (/comment/i.test(title)) n -= 5;
    return n;
  };
  return aud.reduce((best, s) => (score(s) > score(best) ? s : best), aud[0]);
}

async function toMp4(input, output) {
  if (!(await has('ffmpeg')) || !(await has('ffprobe'))) return { file: input, note: 'sin ffmpeg' };
  const pr = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input]);
  let info;
  try { info = JSON.parse(pr.stdout); } catch { console.log('ffprobe:\n' + pr.out); return { file: input, note: 'ffprobe falló' }; }
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!v) return { file: input, note: 'sin pista de video' };
  const a = pickAudio(streams);
  const duration = Number(info.format?.duration) || 0;
  // Solo H.264 de 8 bits se copia tal cual (rápido). HEVC/H.265, H.264 de 10 bits y otros formatos
  // se pasan a H.264, que se reproduce en todos lados (APK, WebView, navegadores).
  const tenBit = /10|12/.test(v.pix_fmt || '');
  const copyV = v.codec_name === 'h264' && !tenBit;
  const tall = Number(v.height) > 1080;
  const copyA = a && a.codec_name === 'aac';
  const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-map', `0:${v.index}`];
  if (a) args.push('-map', `0:${a.index}`);
  args.push(...(copyV ? ['-c:v', 'copy'] : [
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
    ...(tall ? ['-vf', 'scale=-2:1080'] : []),
  ]));
  if (a) args.push(...(copyA ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']));
  args.push('-sn', '-dn', '-map_chapters', '-1', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output);
  const label = copyV ? '🎞 Pasando a .mp4' : `🎞 Convirtiendo ${v.codec_name === 'hevc' ? 'H.265' : (v.codec_name || 'el video')} a H.264 para que se vea en todos lados`;
  await progress(`${label}…`, true);
  const r = await run('ffmpeg', args, {
    onLine: (l) => {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
      if (m && duration) progress(`${label}… ${pctOf(Number(m[1]) / 1e6, duration)}%`);
    },
  });
  if (r.code !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1024) {
    console.log('ffmpeg falló, se sube el video original:\n' + r.out);
    try { fs.rmSync(output, { force: true }); } catch { /* nada */ }
    return { file: input, note: 'no se pudo pasar a .mp4' };
  }
  return { file: output, note: `${copyV ? 'video copiado' : 'video recodificado'}, audio ${a ? (copyA ? 'copiado' : 'AAC') : 'ninguno'}${a?.tags?.language ? ` (${a.tags.language})` : ''}` };
}

/* ------------------------------------------------ subida a MediaFire */
function safeName(name) {
  return String(name || 'video.mp4').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 180) || 'video.mp4';
}

async function sha256File(file) {
  const h = crypto.createHash('sha256');
  const size = fs.statSync(file).size;
  let got = 0;
  for await (const c of fs.createReadStream(file, { highWaterMark: 8 << 20 })) {
    h.update(c); got += c.length;
    progress(`🔎 Preparando la subida… ${pctOf(got, size)}%`);
  }
  return h.digest('hex');
}

async function upload(file, inner) {
  const size = fs.statSync(file).size;
  const filename = safeName(path.basename(file));
  const hash = await sha256File(file);
  const prep = await bot('check', { filename, size, hash, inner });
  if (prep.done) return;   // ya estaba en tu MediaFire: el bot lo agregó directo
  mask(prep.actionToken);
  const { unitSize, units, actionToken, folderKey } = prep;
  const skip = new Set(prep.skip || []);
  const qs = new URLSearchParams({ session_token: actionToken, response_format: 'json', ...(folderKey ? { folder_key: folderKey } : {}) });
  const fh = await fsp.open(file, 'r');
  let uploadKey = null, sent = 0;
  try {
    for (let u = 0; u < units; u++) {
      const len = Math.min(unitSize, size - u * unitSize);
      if (skip.has(u)) { sent += len; continue; }
      const chunk = Buffer.alloc(len);
      await fh.read(chunk, 0, len, u * unitSize);
      const unitHash = crypto.createHash('sha256').update(chunk).digest('hex');
      for (let t = 1; ; t++) {
        try {
          const form = new FormData();
          form.append('file', new Blob([chunk], { type: 'application/octet-stream' }), 'chunk');
          const r = await fetch(`${MF}/upload/resumable.php?${qs}`, {
            method: 'POST', body: form, signal: AbortSignal.timeout(180000),
            headers: {
              'x-filename': filename, 'x-filesize': String(size), 'x-filehash': hash,
              'x-unit-hash': unitHash, 'x-unit-id': String(u), 'x-unit-size': String(len),
            },
          });
          const j = (await r.json().catch(() => ({}))).response || {};
          if (j.result !== 'Success') throw new Error(j.message || `MediaFire respondió ${r.status}`);
          uploadKey = uploadKey || j.doupload?.key;
          break;
        } catch (e) {
          if (t >= 6) throw new Fail(`No se pudo subir la parte ${u + 1}/${units} a MediaFire: ${e.message}`);
          await sleep(3000 * t);
        }
      }
      sent += len;
      progress(`⬆️ Subiendo ${gb(size)} a tu MediaFire… ${pctOf(sent, size)}%`);
    }
  } finally { await fh.close(); }
  if (!uploadKey) throw new Fail('MediaFire no devolvió la clave de subida.');
  await progress('⏳ MediaFire está terminando de armar el archivo…', true);
  for (let i = 0; i < 12; i++) {
    const r = await bot('done', { uploadKey, filename, inner });
    if (r.done) return;
    await sleep(15000);
  }
  throw new Fail('MediaFire tardó demasiado en procesar el archivo. Probá de nuevo en un rato.');
}

/* ------------------------------------------------ todo junto */
async function main() {
  if (!/^[a-z0-9]{8,40}$/.test(JOB)) throw new Fail('Trabajo inválido.');
  if (!/^https:\/\/[^/\s]+$/.test(API)) throw new Fail('Dirección de la API inválida.');
  const job = await bot('job');
  mask(job.password); mask(job.link);
  await fsp.mkdir(WORK, { recursive: true });
  const rar = path.join(WORK, 'archivo.bin');
  const out = path.join(WORK, 'salida');
  await progress(`⬇️ Descargando ${gb(job.size || 0)} en GitHub…`, true);
  const page = job.page || (mediafireKey(job.link) ? `https://www.mediafire.com/file/${mediafireKey(job.link)}` : '');
  const dl = await download(job.link, page, rar);
  await progress(`📦 Descomprimiendo (${gb(dl.size)})…`, true);
  let video;
  if (await extract(rar, out, job.password)) {
    fs.rmSync(rar, { force: true });   // libera espacio en el disco del runner
    video = await biggestVideo(out);
  } else {
    const name = job.srcName && VIDEO_RE.test(job.srcName) ? job.srcName : 'video.mp4';
    const f = path.join(out, name);
    await fsp.mkdir(out, { recursive: true });
    await fsp.rename(rar, f);
    video = { f, name, size: dl.size };
  }
  console.log(`Video: ${video.name} (${gb(video.size)})`);
  const mp4 = path.join(WORK, `${path.parse(video.name).name}.mp4`);
  const conv = await toMp4(video.f, mp4);
  console.log(`Conversión: ${conv.note}`);
  if (conv.file !== video.f) fs.rmSync(video.f, { force: true });
  await upload(conv.file, video.name);
  console.log('Listo.');
}

if (process.argv.includes('--cancelado')) {
  // Paso final del flujo si GitHub lo cortó (por tiempo): avisar en Telegram.
  bot('fail', { error: 'GitHub cortó la conversión porque tardó demasiado. Probá de nuevo; si se repite, el archivo es muy pesado.' }, 2)
    .catch((e) => console.error(e.message)).finally(() => process.exit(0));
} else main().catch(async (e) => {
  const msg = e instanceof Fail ? e.message : `Error en GitHub: ${e?.message || e}`;
  console.error(e);
  try { await bot('fail', { error: msg }, 2); } catch (x) { console.error('no se pudo avisar al bot:', x.message); }
  process.exit(1);
});
