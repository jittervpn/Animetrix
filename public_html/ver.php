<?php
declare(strict_types=1);

/*
 * Página del reproductor: /ver.php?t=movie&id=950387
 *                        /ver.php?t=serie&id=230424&se=1&ep=10
 */
require dirname(__DIR__) . '/app/inkaflix.php';
require dirname(__DIR__) . '/app/layout.php';

$type = ax_type($_GET['t'] ?? null);
$tmdb = ax_int($_GET['id'] ?? null, 1, 99999999);
if ($type === null || $tmdb === null) {
    http_response_code(404);
    ax_page_start('No encontrado');
    echo '<main id="app" class="app"><section class="empty"><h1>Título no encontrado</h1><p><a class="btn" href="/">Volver al inicio</a></p></section></main>';
    ax_page_end();
    exit;
}
$se = $type === 'movie' ? null : (ax_int($_GET['se'] ?? '1', 0, 500) ?? 1);
$ep = $type === 'movie' ? null : (ax_int($_GET['ep'] ?? '1', 0, 100000) ?? 1);

$info = null;
try {
    $info = (new Inkaflix())->title($type, $tmdb);
} catch (Throwable $e) {
    error_log('[animetrix] ver.php: ' . $e->getMessage());
}
$name = $info['title'] ?? 'Reproduciendo';

// Episodios anterior / siguiente
$prev = $next = null;
$seasons = $info['seasons'] ?? [];
if ($type !== 'movie' && $seasons) {
    $list = [];
    foreach ($seasons as $s) {
        foreach ($s['episodes'] as $e) {
            $list[] = [$s['n'], $e['n'], $e['title']];
        }
    }
    foreach ($list as $i => [$s, $e]) {
        if ($s === $se && $e === $ep) {
            $prev = $list[$i - 1] ?? null;
            $next = $list[$i + 1] ?? null;
            break;
        }
    }
} elseif ($type !== 'movie') {
    $prev = $ep > 1 ? [$se, $ep - 1, null] : null;
    $next = [$se, $ep + 1, null];
}

$link = fn(array $x): string => '/ver.php?' . http_build_query(['t' => $type, 'id' => $tmdb, 'se' => $x[0], 'ep' => $x[1]]);
$epLabel = $type === 'movie' ? '' : sprintf('T%d · E%d', $se, $ep);
$embed = ax_embed_url($type, $tmdb, $se, $ep);
$sandbox = ax_config()['player_sandbox']
    ? ' sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"' : '';

ax_page_start(trim($name . ' ' . $epLabel), 'watch', $info['overview'] ?? '');
?>
<main id="app" class="app watch-page"
      data-watch='<?= ax_e(json_encode(['type' => $type, 'tmdb' => $tmdb, 'title' => $name, 'poster' => $info['poster'] ?? null, 'year' => $info['year'] ?? null, 'se' => $se, 'ep' => $ep])) ?>'>
  <div class="player-wrap">
    <div class="player">
      <iframe src="<?= ax_e($embed) ?>" title="Reproductor: <?= ax_e($name) ?>"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowfullscreen referrerpolicy="origin" loading="eager"<?= $sandbox ?>></iframe>
    </div>
  </div>

  <section class="watch-info">
    <div class="watch-head">
      <a class="back" href="/#/titulo/<?= ax_e($type) ?>/<?= $tmdb ?>" aria-label="Volver a la ficha">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
      </a>
      <div>
        <p class="eyebrow"><?= ax_e(['movie' => 'Película', 'serie' => 'Serie', 'anime' => 'Anime'][$type]) ?><?= $info['year'] ?? null ? ' · ' . (int) $info['year'] : '' ?></p>
        <h1><?= ax_e($name) ?> <?php if ($epLabel): ?><span class="ep-tag"><?= ax_e($epLabel) ?></span><?php endif; ?></h1>
      </div>
      <button class="btn ghost" type="button" id="favBtn" aria-pressed="false">
        <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Mi lista</span>
      </button>
    </div>

    <?php if ($type !== 'movie'): ?>
    <div class="ep-nav">
      <?php if ($prev): ?><a class="btn ghost" href="<?= ax_e($link($prev)) ?>">‹ Anterior</a><?php endif; ?>
      <?php if ($next): ?><a class="btn primary" href="<?= ax_e($link($next)) ?>">Siguiente: T<?= (int) $next[0] ?> · E<?= (int) $next[1] ?> ›</a><?php endif; ?>
    </div>
    <?php endif; ?>

    <?php if (!empty($info['overview'])): ?><p class="overview"><?= ax_e($info['overview']) ?></p><?php endif; ?>

    <?php if ($type !== 'movie' && $seasons): ?>
    <div class="episodes" data-current="<?= (int) $se ?>-<?= (int) $ep ?>">
      <div class="season-tabs" role="tablist">
        <?php foreach ($seasons as $s): ?>
          <button type="button" role="tab" data-season="<?= (int) $s['n'] ?>" aria-selected="<?= $s['n'] === $se ? 'true' : 'false' ?>">Temporada <?= (int) $s['n'] ?></button>
        <?php endforeach; ?>
      </div>
      <?php foreach ($seasons as $s): ?>
      <ol class="ep-list" data-season-list="<?= (int) $s['n'] ?>"<?= $s['n'] === $se ? '' : ' hidden' ?>>
        <?php foreach ($s['episodes'] as $e): $cur = $s['n'] === $se && $e['n'] === $ep; ?>
        <li><a href="<?= ax_e($link([$s['n'], $e['n']])) ?>"<?= $cur ? ' aria-current="true"' : '' ?>>
          <span class="ep-n"><?= (int) $e['n'] ?></span>
          <span class="ep-t"><?= ax_e($e['title'] ?? ('Episodio ' . $e['n'])) ?></span>
        </a></li>
        <?php endforeach; ?>
      </ol>
      <?php endforeach; ?>
    </div>
    <?php elseif ($type !== 'movie'): ?>
    <form class="ep-picker" method="get" action="/ver.php">
      <input type="hidden" name="t" value="<?= ax_e($type) ?>"><input type="hidden" name="id" value="<?= $tmdb ?>">
      <label>Temporada <input type="number" name="se" min="0" max="500" value="<?= (int) $se ?>"></label>
      <label>Episodio <input type="number" name="ep" min="0" max="100000" value="<?= (int) $ep ?>"></label>
      <button class="btn primary">Ir</button>
    </form>
    <?php endif; ?>

    <p class="hint">¿No carga el video? Recarga la página o prueba en unos minutos: el servidor puede estar ocupado.</p>
  </section>
</main>
<?php
ax_page_end();
