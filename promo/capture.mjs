// Saca capturas de animetrix.lat como si fuera la app en un celular (1080x2400).
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'out'; fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://www.animetrix.lat/';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 AnimetrixApp/1.2.18';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, locale: 'es-AR',
  recordVideo: { dir: OUT + '/rec', size: { width: 720, height: 1600 } } });
await ctx.addInitScript(() => { try { localStorage.setItem('ax_welcomed', 'true'); localStorage.setItem('ax_app_banner_until', String(Date.now() + 9e9)); } catch {} });
const pg = await ctx.newPage();
const settle = async (ms = 2500) => { await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(ms); };
const shot = async (name) => { await pg.screenshot({ path: `${OUT}/${name}.png` }); console.log('captura', name); };
const go = async (hash) => { await pg.goto(BASE + hash); await settle(); };

// Sembrar "Mi lista" y "Seguir viendo" con títulos reales del catálogo
await go('#/anime');
const items = await pg.$$eval('a.card', (as) => as.slice(0, 12).map((a) => {
  const m = a.getAttribute('href').match(/#\/titulo\/(\w+)\/(\d+)/);
  const img = a.querySelector('img');
  return m && { type: m[1], tmdb: Number(m[2]), title: a.getAttribute('aria-label'), year: null, poster: img ? img.src : null };
}).filter(Boolean));
console.log('titulos', items.length);
await pg.evaluate((it) => {
  localStorage.setItem('ax_list', JSON.stringify(it.slice(3, 11)));
  localStorage.setItem('ax_history', JSON.stringify(it.slice(0, 5).map((x, i) => ({ ...x, se: 1, ep: i + 2, at: Date.now() - i * 1e6 }))));
}, items);

await go('#/'); await shot('01-inicio');
await pg.mouse.wheel(0, 700); await pg.waitForTimeout(1500); await shot('02-inicio-filas');
await go('#/anime'); await shot('03-anime');
await go('#/series'); await shot('04-series');
await go('#/peliculas'); await shot('05-peliculas');
if (items[0]) { await go(`#/titulo/${items[0].type}/${items[0].tmdb}`); await shot('06-ficha');
  await pg.mouse.wheel(0, 650); await pg.waitForTimeout(1500); await shot('07-ficha-episodios'); }
await go('#/buscar/naruto'); await shot('08-buscar');
await go('#/mi-lista'); await shot('09-mi-lista');

// Clip de navegación (para el video)
await go('#/');
for (let i = 0; i < 8; i++) { await pg.mouse.wheel(0, 180); await pg.waitForTimeout(350); }
await pg.waitForTimeout(800);
await pg.close(); await ctx.close(); await b.close();
