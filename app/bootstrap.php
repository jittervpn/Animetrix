<?php
declare(strict_types=1);

/*
 * Animetrix — arranque común: configuración, cabeceras de seguridad y utilidades.
 * Esta carpeta (app/) debe quedar FUERA de public_html.
 */

if (PHP_SAPI !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

const AX_TYPES = ['movie', 'serie', 'anime'];
define('AX_ROOT', dirname(__DIR__));
define('AX_STORAGE', AX_ROOT . '/storage');

function ax_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $defaults = [
        'api_key' => '', 'site_host' => 'animetrix.lat', 'site_name' => 'Animetrix',
        'cache_ttl' => 10, 'rate_limit' => 90, 'player_sandbox' => false, 'demo' => false,
    ];
    $file = __DIR__ . '/config.php';
    $user = is_file($file) ? (require $file) : [];
    $cfg = array_merge($defaults, is_array($user) ? $user : []);
    if ($cfg['api_key'] === '' && getenv('INKAFLIX_KEY')) {
        $cfg['api_key'] = (string) getenv('INKAFLIX_KEY');
    }
    return $cfg;
}

/** Genera (una vez por petición) el nonce para scripts inline. */
function ax_nonce(): string
{
    static $n = null;
    return $n ??= rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
}

function ax_security_headers(bool $html = true): void
{
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    header('Cross-Origin-Opener-Policy: same-origin');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
    if ($html) {
        $nonce = ax_nonce();
        header("Content-Security-Policy: default-src 'self'; "
            . "script-src 'self' 'nonce-{$nonce}'; "
            . "style-src 'self' https://fonts.googleapis.com; "
            . "font-src 'self' https://fonts.gstatic.com; "
            . "img-src 'self' data: https://image.tmdb.org; "
            . "frame-src https://api.inkaflix.space; "
            . "connect-src 'self'; object-src 'none'; base-uri 'none'; "
            . "form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests");
        header('X-Frame-Options: SAMEORIGIN');
    } else {
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    }
}

function ax_e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Entero en rango o null. */
function ax_int(mixed $v, int $min, int $max): ?int
{
    if (is_string($v) && preg_match('/^\d{1,9}$/', $v)) {
        $v = (int) $v;
    }
    return (is_int($v) && $v >= $min && $v <= $max) ? $v : null;
}

function ax_type(mixed $v): ?string
{
    return (is_string($v) && in_array($v, AX_TYPES, true)) ? $v : null;
}

/** Solo permite pósters/fondos de TMDB por https. */
function ax_img(mixed $url): ?string
{
    if (!is_string($url) || $url === '') {
        return null;
    }
    if (str_starts_with($url, '/')) {
        $url = 'https://image.tmdb.org/t/p/w500' . $url;
    }
    return preg_match('#^https://image\.tmdb\.org/t/p/[a-z0-9]+/[A-Za-z0-9_\-]+\.(jpg|jpeg|png|webp)$#', $url) ? $url : null;
}

/** Texto plano limpio y acotado. */
function ax_text(mixed $s, int $max = 300): ?string
{
    if (!is_string($s) && !is_int($s) && !is_float($s)) {
        return null;
    }
    $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', strip_tags((string) $s)) ?? '');
    if ($s === '') {
        return null;
    }
    return mb_strlen($s) > $max ? mb_substr($s, 0, $max - 1) . '…' : $s;
}

/** URL del reproductor (se arma solo en el servidor). */
function ax_embed_url(string $type, int $tmdb, ?int $se = null, ?int $ep = null): string
{
    $q = ['tmdb' => $tmdb];
    if ($type !== 'movie') {
        $q['se'] = $se ?? 1;
        $q['ep'] = $ep ?? 1;
    }
    $q['view_key'] = ax_config()['api_key'];
    return 'https://api.inkaflix.space/e/' . $type . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986);
}
