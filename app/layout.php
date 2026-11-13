<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function ax_page_start(string $title, string $bodyClass = '', string $description = ''): void
{
    ax_security_headers(true);
    header('Content-Type: text/html; charset=utf-8');
    $site = ax_config()['site_name'];
    $full = $title === '' ? $site . ' — Películas, series y anime online' : $title . ' · ' . $site;
    $desc = $description !== '' ? $description : 'Mira películas, series y anime en ' . $site . '. Estrenos, catálogo completo y tu lista personal.';
    $v = (string) (@filemtime(AX_ROOT . '/public_html/assets/app.js') ?: 1);
    ?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title><?= ax_e($full) ?></title>
<meta name="description" content="<?= ax_e($desc) ?>">
<meta name="theme-color" content="#07080c">
<meta property="og:title" content="<?= ax_e($full) ?>">
<meta property="og:description" content="<?= ax_e($desc) ?>">
<meta property="og:type" content="website">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://image.tmdb.org" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/app.css?v=<?= ax_e($v) ?>">
<script src="/assets/app.js?v=<?= ax_e($v) ?>" defer></script>
</head>
<body class="<?= ax_e($bodyClass) ?>">
<a class="skip" href="#app">Saltar al contenido</a>
<header class="topbar" id="topbar">
  <a class="brand" href="/" aria-label="<?= ax_e($site) ?> inicio">
    <img src="/assets/logo.svg" alt="" width="30" height="30">
    <span><?= ax_e($site) ?></span>
  </a>
  <nav class="nav" aria-label="Secciones">
    <a href="/#/" data-nav="home">Inicio</a>
    <a href="/#/peliculas" data-nav="movie">Películas</a>
    <a href="/#/series" data-nav="serie">Series</a>
    <a href="/#/anime" data-nav="anime">Anime</a>
    <a href="/#/mi-lista" data-nav="list">Mi lista</a>
  </nav>
  <form class="search" role="search" action="/" id="searchForm">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="q" name="q" type="search" placeholder="Buscar títulos…" maxlength="60" autocomplete="off" aria-label="Buscar">
  </form>
</header>
<?php
}

function ax_page_end(): void
{
    $site = ax_config()['site_name'];
    ?>
<nav class="tabbar" aria-label="Navegación móvil">
  <a href="/#/" data-nav="home"><svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/></svg>Inicio</a>
  <a href="/#/peliculas" data-nav="movie"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4"/></svg>Películas</a>
  <a href="/#/series" data-nav="serie"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="m9 3 3 3 3-3"/></svg>Series</a>
  <a href="/#/anime" data-nav="anime"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6L20 9.5l-4 4.1.9 5.9L12 16.8 7.1 19.5l.9-5.9-4-4.1 5.4-.9z"/></svg>Anime</a>
  <a href="/#/mi-lista" data-nav="list"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Mi lista</a>
</nav>
<footer class="foot">
  <p><strong><?= ax_e($site) ?></strong> · Reproductor provisto por InkaFlix. Este sitio no aloja archivos de video.</p>
  <p>© <?= date('Y') ?> <?= ax_e($site) ?></p>
</footer>
</body>
</html>
<?php
}
