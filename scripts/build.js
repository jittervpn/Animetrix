// Compila los assets: minifica JS/CSS con esbuild, les pone un hash en el nombre
// (caché de 1 año sin riesgo) y regenera public/index.html + lib/assets.js.
// Uso: npm run assets   (ejecutar tras cambiar src/ o lib/layout.js)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdirSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const out = root + 'public/assets/';

for (const f of readdirSync(out)) if (/^app\.[0-9a-f]{10}\.(js|css)$/.test(f)) unlinkSync(out + f);

const names = {};
for (const ext of ['js', 'css']) {
  const r = await build({
    entryPoints: [root + 'src/app.' + ext], bundle: false, minify: true, write: false,
    target: ext === 'js' ? ['es2020'] : ['chrome90', 'safari14'], legalComments: 'none',
  });
  const code = r.outputFiles[0].contents;
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 10);
  names[ext] = `/assets/app.${hash}.${ext}`;
  writeFileSync(root + 'public' + names[ext], code);
  console.log(names[ext], (code.length / 1024).toFixed(1) + ' KB');
}
writeFileSync(root + 'lib/assets.js', `// Generado por scripts/build.js — no editar a mano.\nexport const ASSETS = ${JSON.stringify(names)};\n`);

const { pageStart, pageEnd } = await import(root + 'lib/layout.js?' + Date.now());
const html = pageStart({ bodyClass: 'home', preloadHome: true }) + `<main id="app" class="app" aria-live="polite">
  <div class="hero sk-hero"></div>
</main>
<div class="modal" id="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <article class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mTitle" tabindex="-1"></article>
</div>
<noscript><p class="noscript">Activa JavaScript para usar el catálogo.</p></noscript>
` + pageEnd();
writeFileSync(root + 'public/index.html', html);
console.log('public/index.html generado');
