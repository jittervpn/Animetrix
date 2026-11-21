// ==========================================================================
//  Panel de admin — encender/apagar Películas, Series y Anime,
//  y configurar el banner de AdMob de la app Android.
//  Entra en /admin, escribe tu clave (ADMIN_SECRET) y usa los interruptores.
//  La clave nunca viaja en la URL: va en una cabecera y se valida en servidor.
// ==========================================================================
import { timingSafeEqual } from 'node:crypto';
import { securityHeaders, sendJson, rateLimited, logSuspicious } from '../lib/http.js';
import { getFlags, setFlag } from '../lib/flags.js';
import { TYPES } from '../lib/inkaflix.js';
import { getAds, setAds, publicView } from '../lib/ads.js';

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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

  try {
    // Solo leer el estado (al abrir el panel)
    if (b.action === 'get') {
      const [flags, ads] = await Promise.all([getFlags(), getAds()]);
      return sendJson(res, 200, { flags, ads });
    }

    // Guardar la configuración de AdMob
    if (b.action === 'ads' && b.ads && typeof b.ads === 'object') {
      let ads;
      try { ads = await setAds(b.ads); } catch (e) {
        if (e && e.userError) return sendJson(res, 400, { error: e.message });
        throw e;
      }
      const v = publicView(ads);
      console.log(`[animetrix-admin] admob -> ${v.enabled ? 'ON' : 'OFF'}${ads.test ? ' (prueba)' : ''}`);
      return sendJson(res, 200, { ads });
    }

    // Cambiar un interruptor
    if (b.action === 'set' && TYPES.includes(b.type) && typeof b.on === 'boolean') {
      const flags = await setFlag(b.type, b.on);
      console.log(`[animetrix-admin] ${b.type} -> ${b.on ? 'ON' : 'OFF'}`);
      return sendJson(res, 200, { flags });
    }
  } catch (e) {
    console.error('[animetrix-admin] error:', e.message);
    return sendJson(res, 502, { error: 'No se pudo guardar el cambio, intenta de nuevo' });
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
.sec{margin-top:26px;padding-top:22px;border-top:1px solid #20242f}
.sec h2{font-size:18px;margin:0 0 4px}
.field{margin-top:14px}
.field input[type=text],.field select{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #20242f;background:#0b0d13;color:#eef1f7;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.field select{font-family:inherit}
.field input.bad{border-color:#ff6b6b}
.hint{font-size:12px;color:#6b7280;margin:5px 0 0}
.pill{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:#2a2f3c;color:#cfd5e1;margin-left:6px;vertical-align:middle}
.pill.live{background:#1f4d27;color:#8ff59c}.pill.test{background:#4d3f12;color:#ffd75e}
.ok{color:#5bd66a;font-size:14px;margin:12px 0 0;min-height:18px}
.note{font-size:12.5px;color:#9aa3b2;background:#0b0d13;border:1px solid #20242f;border-radius:12px;padding:10px 12px;margin-top:14px}
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

    <div class="sec" id="admob">
      <h2>AdMob · Banner <span class="pill" id="adst">—</span></h2>
      <p class="sub" style="margin:0">Banner de la app Android. Los cambios llegan a la app en ~1 minuto, sin publicar un APK nuevo.</p>
      <div class="row" style="border-top:0">
        <div><b>Mostrar banner</b><div class="st" id="adon">—</div></div>
        <button class="sw" id="sw-en" aria-label="Mostrar banner"></button>
      </div>
      <div class="row">
        <div><b>Modo prueba</b><div class="st" style="color:#9aa3b2">Anuncios de prueba de Google</div></div>
        <button class="sw" id="sw-test" aria-label="Modo prueba"></button>
      </div>
      <div class="field">
        <label for="appid">ID de la app (App ID)</label>
        <input id="appid" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ca-app-pub-0000000000000000~0000000000">
        <p class="hint">AdMob → Apps → Configuración de la app. Lleva <b>~</b>.</p>
      </div>
      <div class="field">
        <label for="unit">ID del bloque de anuncios (Banner)</label>
        <input id="unit" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ca-app-pub-0000000000000000/0000000000">
        <p class="hint">AdMob → Bloques de anuncios → Banner. Lleva <b>/</b>.</p>
      </div>
      <div class="field">
        <label for="pos">Posición</label>
        <select id="pos"><option value="bottom">Abajo</option><option value="top">Arriba</option></select>
      </div>
      <div class="row" style="margin-top:8px">
        <div><b>Ocultar en el reproductor</b><div class="st" style="color:#9aa3b2">No mostrar mientras se ve un video</div></div>
        <button class="sw" id="sw-play" aria-label="Ocultar en el reproductor"></button>
      </div>
      <p class="note" id="appnote">El App ID va dentro del APK: si lo cambias, se aplica en el próximo build de la app (Actions → App Android → Run workflow).</p>
      <button class="btn" id="save">Guardar AdMob</button>
      <p class="err" id="e3"></p><p class="ok" id="o3"></p>
    </div>
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
const APP_RE=/^ca-app-pub-\\d{10,20}~\\d{6,14}$/,UNIT_RE=/^ca-app-pub-\\d{10,20}\\/\\d{6,14}$/;
let ADS={};
function setSw(el,on){el.classList.toggle('active',!!on);el.dataset.on=on?'1':''}
function swOn(el){return el.dataset.on==='1'}
function adsStatus(){
  const en=swOn($('#sw-en')),test=swOn($('#sw-test'));
  const st=$('#adst');
  if(!en){st.textContent='Apagado';st.className='pill'}
  else if(test){st.textContent='Prueba';st.className='pill test'}
  else{st.textContent='En vivo';st.className='pill live'}
  const on=$('#adon');on.textContent=en?'Activo':'Desactivado';on.className='st '+(en?'on':'off');
}
function renderAds(a){
  ADS=a||{};
  setSw($('#sw-en'),ADS.enabled);setSw($('#sw-test'),ADS.test!==false);setSw($('#sw-play'),ADS.hideOnPlayer!==false);
  $('#appid').value=ADS.appId||'';$('#unit').value=ADS.bannerId||'';$('#pos').value=ADS.position||'bottom';
  $('#appid').classList.remove('bad');$('#unit').classList.remove('bad');
  adsStatus();
}
for(const id of ['#sw-en','#sw-test','#sw-play'])$(id).onclick=()=>{setSw($(id),!swOn($(id)));adsStatus();$('#o3').textContent=''};
function checkField(el,re){const v=el.value.trim();const bad=!!v&&!re.test(v);el.classList.toggle('bad',bad);return !bad}
$('#appid').oninput=()=>checkField($('#appid'),APP_RE);
$('#unit').oninput=()=>checkField($('#unit'),UNIT_RE);
$('#save').onclick=async()=>{
  $('#e3').textContent='';$('#o3').textContent='';
  if(!checkField($('#appid'),APP_RE)){$('#e3').textContent='Revisa el App ID (formato ca-app-pub-…~…)';return}
  if(!checkField($('#unit'),UNIT_RE)){$('#e3').textContent='Revisa el ID del banner (formato ca-app-pub-…/…)';return}
  const ads={enabled:swOn($('#sw-en')),test:swOn($('#sw-test')),hideOnPlayer:swOn($('#sw-play')),
    appId:$('#appid').value.trim(),bannerId:$('#unit').value.trim(),position:$('#pos').value};
  const appChanged=ads.appId!==(ADS.appId||'');
  $('#save').disabled=true;
  try{const d=await call({action:'ads',ads});renderAds(d.ads);
    $('#o3').textContent=appChanged?'Guardado. El nuevo App ID se aplica en el próximo build del APK.':'Guardado ✓'}
  catch(ex){if(ex.message==='401'){logout()}else{$('#e3').textContent=ex.message}}
  finally{$('#save').disabled=false}
};
function logout(){KEY='';sessionStorage.removeItem('ax_admin');$('#panel').classList.add('hide');$('#login').classList.remove('hide');$('#e1').textContent='La sesión expiró, entra de nuevo.'}
async function open(){
  try{const d=await call({action:'get'});$('#login').classList.add('hide');$('#panel').classList.remove('hide');render(d.flags);renderAds(d.ads)}
  catch(ex){if(ex.message==='401'){$('#e1').textContent='Clave incorrecta'}else{$('#e1').textContent=ex.message}KEY='';sessionStorage.removeItem('ax_admin')}
}
$('#enter').onclick=()=>{KEY=$('#k').value.trim();if(!KEY)return;sessionStorage.setItem('ax_admin',KEY);$('#enter').disabled=true;open().finally(()=>{$('#enter').disabled=false})};
$('#k').addEventListener('keydown',e=>{if(e.key==='Enter')$('#enter').click()});
$('#out').onclick=e=>{e.preventDefault();logout()};
if(KEY)open();
</script>
</body></html>`;
