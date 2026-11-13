// Genera public/index.html a partir de la plantilla común (ejecutar tras cambiar lib/layout.js).
import { writeFileSync } from 'node:fs';
import { pageStart, pageEnd } from '../lib/layout.js';

const html = pageStart({ bodyClass: 'home' }) + `<main id="app" class="app" aria-live="polite">
  <div class="boot"><span class="spinner" aria-hidden="true"></span></div>
</main>
<div class="modal" id="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <article class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mTitle" tabindex="-1"></article>
</div>
<noscript><p class="noscript">Activa JavaScript para usar el catálogo.</p></noscript>
` + pageEnd();
writeFileSync(new URL('../public/index.html', import.meta.url), html);
console.log('public/index.html generado');
