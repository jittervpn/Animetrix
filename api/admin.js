// ==========================================================================
//  Panel de admin — encender/apagar Películas, Series y Anime.
//  Entra en /admin, escribe tu clave (ADMIN_SECRET) y usa los interruptores.
//  La clave nunca viaja en la URL: va en una cabecera y se valida en servidor.
// ==========================================================================
import { timingSafeEqual } from 'node:crypto';
import { securityHeaders, sendJson, rateLimited, logSuspicious } from '../lib/http.js';
import { getFlags, setFlag } from '../lib/flags.js';
import { TYPES } from '../lib/inkaflix.js';

function validKey(given) {
  const real = process.env.ADMIN_SECRET || '';
  if (!real || typeof given !== 'string' || given.length !== real.length) return false;
  try { return timingSafeEqual(Buffer.from(given), Buffer.from(real)); } catch { return false; }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 2048) throw new Error('grande'); chunks.push(c); }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  // GET sin clave: muestra la página (shell). La clave se pide en el navegador.
  if (req.method === 'GET') {
    securityHeaders(res, true);
    // CSP propia del panel: es una página aislada (sin contenido de usuario) y usa script en línea.
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(PAGE); return;
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return sendJson(res, 405, { error: 'Método no permitido' }); }

  securityHeaders(res, false);
  res.setHeader('Cache-Control', 'no-store');
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') { logSuspicious(req, 'admin-cross-site'); return sendJson(res, 403, { error: 'Origen no permitido' }); }
  if (rateLimited(req, 30)) { res.setHeader('Retry-After', '60'); return sendJson(res, 429, { error: 'Demasiados intentos' }); }

  if (!validKey(req.headers['x-admin-key'])) { logSuspicious(req, 'admin-bad-key'); return sendJson(res, 401, { error: 'Clave incorrecta' }); }

  let b;
  try { b = await readBody(req); } catch { return sendJson(res, 400, { error: 'Petición no válida' }); }

  // Solo leer el estado (al abrir el panel)
  if (b.action === 'get') return sendJson(res, 200, { flags: await getFlags() });

  // Cambiar un interruptor
  if (b.action === 'set' && TYPES.includes(b.type) && typeof b.on === 'boolean') {
    const flags = await setFlag(b.type, b.on);
    console.log(`[animetrix-admin] ${b.type} -> ${b.on ? 'ON' : 'OFF'}`);
    return sendJson(res, 200, { flags });
  }
  return sendJson(res, 400, { error: 'Acción no válida' });
}

const PAGE = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Admin · Animetrix</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#07080c;color:#eef1f7;
  min-height:100dvh;display:grid;place-items:center;padding:24px}
.card{width:min(440px,100%);background:#0f1118;border:1px solid #20242f;border-radius:20px;padding:26px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:#9aa3b2;font-size:14px;margin:0 0 22px}
label{display:block;font-size:13px;font-weight:700;color:#9aa3b2;margin:0 0 6px}
input[type=password]{width:100%;padding:13px 15px;border-radius:12px;border:1px solid #20242f;background:#0b0d13;color:#eef1f7;font:inherit}
button{font:inherit;cursor:pointer}
.btn{width:100%;margin-top:14px;padding:13px;border-radius:12px;border:0;background:#c8ff2e;color:#07080c;font-weight:800}
.btn:disabled{opacity:.5}
.err{color:#ff6b6b;font-size:14px;margin:12px 0 0;min-height:18px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-top:1px solid #20242f}
.row:first-of-type{border-top:0}
.row b{font-size:17px}
.row .st{font-size:12.5px;font-weight:700}
.on{color:#5bd66a}.off{color:#ff8f8f}
.sw{position:relative;width:54px;height:30px;flex:none;border-radius:999px;background:#2a2f3c;transition:background .2s;border:0}
.sw.active{background:#3aa84b}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .2s}
.sw.active::after{transform:translateX(24px)}
.sw:disabled{opacity:.6}
.hide{display:none}
.foot{margin-top:20px;font-size:12px;color:#6b7280;text-align:center}
.foot a{color:#9aa3b2}
</style></head><body>
<div class="card">
  <div id="login">
    <h1>Panel de admin</h1>
    <p class="sub">Enciende o apaga cada sección de Animetrix.</p>
    <label for="k">Clave de administrador</label>
    <input id="k" type="password" autocomplete="current-password" placeholder="••••••••••••">
    <button class="btn" id="enter">Entrar</button>
    <p class="err" id="e1"></p>
  </div>
  <div id="panel" class="hide">
    <h1>Secciones</h1>
    <p class="sub">Un cambio se aplica en todo el sitio y la app en ~20 segundos.</p>
    <div id="rows"></div>
    <p class="err" id="e2"></p>
    <p class="foot">Sesión solo en este dispositivo · <a href="#" id="out">Salir</a></p>
  </div>
</div>
<script>
const NAMES={movie:'Películas',serie:'Series',anime:'Anime'};
const $=s=>document.querySelector(s);
let KEY=sessionStorage.getItem('ax_admin')||'';
async function call(body){
  const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},body:JSON.stringify(body)});
  if(r.status===401){throw new Error('401')}
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Error');
  return d;
}
function render(flags){
  const box=$('#rows');box.textContent='';
  for(const t of ['movie','serie','anime']){
    const on=flags[t]!==false;
    const row=document.createElement('div');row.className='row';
    const left=document.createElement('div');
    const b=document.createElement('b');b.textContent=NAMES[t];
    const st=document.createElement('div');st.className='st '+(on?'on':'off');st.textContent=on?'Activa':'Desactivada';
    left.append(b,st);
    const sw=document.createElement('button');sw.className='sw'+(on?' active':'');sw.setAttribute('aria-label',NAMES[t]);
    sw.onclick=async()=>{
      sw.disabled=true;$('#e2').textContent='';
      try{const d=await call({action:'set',type:t,on:!on});render(d.flags)}
      catch(ex){if(ex.message==='401'){logout()}else{$('#e2').textContent=ex.message;sw.disabled=false}}
    };
    row.append(left,sw);box.append(row);
  }
}
function logout(){KEY='';sessionStorage.removeItem('ax_admin');$('#panel').classList.add('hide');$('#login').classList.remove('hide');$('#e1').textContent='La sesión expiró, entra de nuevo.'}
async function open(){
  try{const d=await call({action:'get'});$('#login').classList.add('hide');$('#panel').classList.remove('hide');render(d.flags)}
  catch(ex){if(ex.message==='401'){$('#e1').textContent='Clave incorrecta'}else{$('#e1').textContent=ex.message}KEY='';sessionStorage.removeItem('ax_admin')}
}
$('#enter').onclick=()=>{KEY=$('#k').value.trim();if(!KEY)return;sessionStorage.setItem('ax_admin',KEY);$('#enter').disabled=true;open().finally(()=>{$('#enter').disabled=false})};
$('#k').addEventListener('keydown',e=>{if(e.key==='Enter')$('#enter').click()});
$('#out').onclick=e=>{e.preventDefault();logout()};
if(KEY)open();
</script>
</body></html>`;
