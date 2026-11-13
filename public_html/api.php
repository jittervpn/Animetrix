<?php
declare(strict_types=1);

/*
 * Proxy público: /api.php?a=catalog&type=movie&page=1&q=...
 *                /api.php?a=title&type=serie&tmdb=123
 * El navegador nunca ve la API key: este archivo la añade del lado del servidor.
 */
require dirname(__DIR__) . '/app/inkaflix.php';

ax_security_headers(false);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://' . ax_config()['site_host']);
header('Vary: Origin');

function out(int $status, array $data, int $maxAge = 0): never
{
    http_response_code($status);
    header($maxAge > 0 ? "Cache-Control: public, max-age={$maxAge}" : 'Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    out(405, ['error' => 'Método no permitido']);
}

// Bloquea peticiones de otros sitios (hotlinking del proxy).
$secFetch = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if ($secFetch !== '' && !in_array($secFetch, ['same-origin', 'none'], true)) {
    out(403, ['error' => 'Origen no permitido']);
}

$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!RateLimit::hit((string) $ip, (int) ax_config()['rate_limit'])) {
    header('Retry-After: 60');
    out(429, ['error' => 'Demasiadas peticiones, espera un minuto']);
}

$action = $_GET['a'] ?? '';
$type = ax_type($_GET['type'] ?? null);
if ($type === null) {
    out(400, ['error' => 'Tipo no válido']);
}

try {
    $api = new Inkaflix();
    switch ($action) {
        case 'catalog':
            $page = ax_int($_GET['page'] ?? '1', 1, 1000) ?? 1;
            $q = is_string($_GET['q'] ?? null) ? $_GET['q'] : '';
            $q = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F<>]+/u', '', $q) ?? ''), 0, 60);
            out(200, $api->catalog($type, $page, $q), 120);

        case 'title':
            $tmdb = ax_int($_GET['tmdb'] ?? null, 1, 99999999);
            if ($tmdb === null) {
                out(400, ['error' => 'ID no válido']);
            }
            out(200, $api->title($type, $tmdb), 300);

        default:
            out(400, ['error' => 'Acción no válida']);
    }
} catch (ApiError $e) {
    out($e->status === 404 ? 404 : 502, ['error' => $e->status === 404 ? 'No encontrado' : 'Servicio no disponible, intenta más tarde']);
} catch (Throwable $e) {
    error_log('[animetrix] ' . $e->getMessage());
    out(500, ['error' => 'Error interno']);
}
