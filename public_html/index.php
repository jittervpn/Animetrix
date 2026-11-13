<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/layout.php';

ax_page_start('', 'home');
?>
<main id="app" class="app" aria-live="polite">
  <div class="boot"><span class="spinner" aria-hidden="true"></span></div>
</main>
<div class="modal" id="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <article class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mTitle" tabindex="-1"></article>
</div>
<noscript><p class="noscript">Activa JavaScript para usar el catálogo.</p></noscript>
<?php
ax_page_end();
