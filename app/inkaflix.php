<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Cliente de la API JSON de InkaFlix, solo para uso en el servidor.
 * - La API key viaja únicamente en la cabecera Authorization (nunca al navegador).
 * - Respuestas en caché en disco.
 * - Todo lo que sale hacia el navegador pasa por una lista blanca de campos.
 */
final class Inkaflix
{
    private const BASE = 'https://api.inkaflix.space';

    /** Valores de "type" que se prueban en la API para cada sección. */
    private const TYPE_ALIASES = [
        'movie' => ['movie'],
        'serie' => ['serie', 'series', 'tv'],
        'anime' => ['anime'],
    ];

    public function catalog(string $type, int $page, string $q = ''): array
    {
        if (ax_config()['demo']) {
            return Demo::catalog($type, $page, $q);
        }
        $raw = $this->getWithAliases('/api/v1/catalog', $type, ['page' => $page] + ($q !== '' ? ['q' => $q] : []));
        $items = [];
        foreach ((array) ($raw['items'] ?? $raw['results'] ?? $raw['data'] ?? []) as $it) {
            if (is_array($it) && ($n = self::normItem($it, $type))) {
                $items[] = $n;
            }
        }
        return [
            'page'     => ax_int($raw['page'] ?? $page, 1, 100000) ?? $page,
            'per_page' => ax_int($raw['per_page'] ?? 20, 1, 500) ?? 20,
            'total'    => ax_int($raw['total'] ?? count($items), 0, 10000000) ?? count($items),
            'items'    => $items,
        ];
    }

    public function title(string $type, int $tmdb): array
    {
        if (ax_config()['demo']) {
            return Demo::title($type, $tmdb);
        }
        $raw = $this->getWithAliases('/api/v1/title', $type, ['tmdb' => $tmdb]);
        foreach (['item', 'title', 'data', 'result'] as $k) {
            if (isset($raw[$k]) && is_array($raw[$k]) && !array_is_list($raw[$k])) {
                $raw = $raw[$k] + $raw;
                break;
            }
        }
        $base = self::normItem($raw + ['tmdb' => $tmdb], $type) ?? ['type' => $type, 'tmdb' => $tmdb, 'title' => 'Sin título'];
        $base['overview'] = ax_text($raw['overview'] ?? $raw['description'] ?? $raw['sinopsis'] ?? $raw['synopsis'] ?? null, 1200);
        $base['backdrop'] = ax_img($raw['backdrop'] ?? $raw['backdrop_path'] ?? $raw['cover'] ?? null);
        $genres = [];
        foreach ((array) ($raw['genres'] ?? $raw['generos'] ?? []) as $g) {
            $g = is_array($g) ? ($g['name'] ?? null) : $g;
            if ($t = ax_text($g, 40)) {
                $genres[] = $t;
            }
        }
        $base['genres'] = array_slice($genres, 0, 6);
        $base['seasons'] = $type === 'movie' ? [] : self::normSeasons($raw);
        return $base;
    }

    // ---------------------------------------------------------------- HTTP

    private function getWithAliases(string $path, string $type, array $params): array
    {
        $aliases = self::TYPE_ALIASES[$type];
        $hint = Cache::get('alias_' . $type, 86400);
        if (is_string($hint) && in_array($hint, $aliases, true)) {
            array_unshift($aliases, $hint);
            $aliases = array_values(array_unique($aliases));
        }
        $last = null;
        foreach ($aliases as $alias) {
            try {
                $res = $this->get($path, ['type' => $alias] + $params);
                Cache::set('alias_' . $type, $alias);
                return $res;
            } catch (ApiError $e) {
                $last = $e;
                if ($e->status !== 400) {
                    throw $e; // solo reintentamos si el "type" no fue aceptado
                }
            }
        }
        throw $last ?? new ApiError(502, 'Sin respuesta');
    }

    private function get(string $path, array $params): array
    {
        $url = self::BASE . $path . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        $key = 'http_' . $url;
        $ttl = max(1, (int) ax_config()['cache_ttl']) * 60;
        $cached = Cache::get($key, $ttl);
        if (is_array($cached)) {
            return $cached;
        }
        $apiKey = ax_config()['api_key'];
        if ($apiKey === '') {
            throw new ApiError(500, 'Falta configurar la API key en app/config.php');
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 12,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_MAXFILESIZE    => 5 * 1024 * 1024,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
                'User-Agent: Animetrix/1.0 (+https://' . ax_config()['site_host'] . ')',
            ],
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            // Si la API cae, servimos la última copia aunque esté vencida.
            $stale = Cache::get($key, PHP_INT_MAX);
            if (is_array($stale)) {
                return $stale;
            }
            error_log('[animetrix] InkaFlix sin conexión: ' . $err);
            throw new ApiError(502, 'El servidor de videos no responde');
        }
        if ($status !== 200) {
            throw new ApiError($status === 404 ? 404 : ($status === 400 ? 400 : 502), 'Error de la API (' . $status . ')');
        }
        $data = json_decode((string) $body, true, 64);
        if (!is_array($data)) {
            throw new ApiError(502, 'Respuesta no válida de la API');
        }
        Cache::set($key, $data);
        return $data;
    }

    // ------------------------------------------------------- normalización

    private static function normItem(array $it, string $type): ?array
    {
        $tmdb = ax_int($it['tmdb'] ?? $it['tmdb_id'] ?? $it['id'] ?? null, 1, 99999999);
        if ($tmdb === null && isset($it['embed']) && is_string($it['embed'])) {
            $tmdb = ax_int(self::queryOf($it['embed'])['tmdb'] ?? null, 1, 99999999);
        }
        if ($tmdb === null) {
            return null;
        }
        $year = ax_int($it['year'] ?? null, 1880, 2100);
        if ($year === null && is_string($d = $it['release_date'] ?? $it['first_air_date'] ?? null)) {
            $year = ax_int(substr($d, 0, 4), 1880, 2100);
        }
        return [
            'type'     => $type,
            'tmdb'     => $tmdb,
            'title'    => ax_text($it['title'] ?? $it['name'] ?? $it['titulo'] ?? null, 140) ?? 'Sin título',
            'year'     => $year,
            'poster'   => ax_img($it['poster'] ?? $it['poster_path'] ?? $it['image'] ?? null),
            'episodes' => ax_int($it['episodes'] ?? 0, 0, 100000) ?? 0,
        ];
    }

    private static function normSeasons(array $raw): array
    {
        $flat = [];
        $push = function (array $ep, ?int $seasonHint) use (&$flat): void {
            $q = isset($ep['embed']) && is_string($ep['embed']) ? self::queryOf($ep['embed']) : [];
            $se = ax_int($ep['se'] ?? $ep['season'] ?? $ep['season_number'] ?? $ep['temporada'] ?? $q['se'] ?? $seasonHint, 0, 500);
            $en = ax_int($ep['ep'] ?? $ep['episode'] ?? $ep['episode_number'] ?? $ep['capitulo'] ?? $ep['number'] ?? $q['ep'] ?? null, 0, 100000);
            if ($se === null || $en === null) {
                return;
            }
            $flat[$se][$en] = [
                'n'     => $en,
                'title' => ax_text($ep['title'] ?? $ep['name'] ?? null, 120),
                'still' => ax_img($ep['still'] ?? $ep['still_path'] ?? $ep['image'] ?? null),
            ];
        };

        foreach ((array) ($raw['seasons'] ?? $raw['temporadas'] ?? []) as $s) {
            if (!is_array($s)) {
                continue;
            }
            $sn = ax_int($s['season'] ?? $s['se'] ?? $s['season_number'] ?? $s['number'] ?? null, 0, 500);
            foreach ((array) ($s['episodes'] ?? $s['episodios'] ?? []) as $ep) {
                if (is_array($ep)) {
                    $push($ep, $sn);
                }
            }
        }
        foreach ((array) ($raw['episodes'] ?? $raw['episodios'] ?? []) as $ep) {
            if (is_array($ep)) {
                $push($ep, 1);
            }
        }

        ksort($flat);
        $out = [];
        foreach ($flat as $sn => $eps) {
            ksort($eps);
            $out[] = ['n' => $sn, 'episodes' => array_values($eps)];
        }
        return $out;
    }

    private static function queryOf(string $url): array
    {
        $q = [];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
        return $q;
    }
}

final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, string $msg)
    {
        parent::__construct($msg);
    }
}

/** Caché simple en disco (storage/cache), fuera del webroot. */
final class Cache
{
    private static function path(string $key): string
    {
        return AX_STORAGE . '/cache/' . hash('sha256', $key) . '.json';
    }

    public static function get(string $key, int $ttl): mixed
    {
        $f = self::path($key);
        if (!is_file($f) || (time() - (int) filemtime($f)) > $ttl) {
            return null;
        }
        $v = json_decode((string) file_get_contents($f), true);
        return $v['v'] ?? null;
    }

    public static function set(string $key, mixed $value): void
    {
        $dir = AX_STORAGE . '/cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        $tmp = tempnam($dir, 'c');
        if ($tmp !== false && file_put_contents($tmp, json_encode(['v' => $value])) !== false) {
            @chmod($tmp, 0600);
            rename($tmp, self::path($key));
        }
    }
}

/** Límite de peticiones por IP (ventana de 60 s), con archivos bloqueados. */
final class RateLimit
{
    public static function hit(string $ip, int $max): bool
    {
        $dir = AX_STORAGE . '/cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        $f = $dir . '/rl_' . hash('sha256', $ip . date('YmdHi')) . '.cnt';
        $h = @fopen($f, 'c+');
        if ($h === false) {
            return true;
        }
        flock($h, LOCK_EX);
        $n = (int) stream_get_contents($h) + 1;
        ftruncate($h, 0);
        rewind($h);
        fwrite($h, (string) $n);
        flock($h, LOCK_UN);
        fclose($h);
        if (random_int(1, 200) === 1) {
            foreach (glob($dir . '/rl_*.cnt') ?: [] as $old) {
                if (time() - (int) filemtime($old) > 180) {
                    @unlink($old);
                }
            }
        }
        return $n <= $max;
    }
}

/** Datos de ejemplo para probar el diseño sin conectar con InkaFlix ('demo' => true). */
final class Demo
{
    private const NAMES = [
        'movie' => ['Horizonte Rojo', 'La Última Señal', 'Ciudad de Neón', 'El Faro', 'Ecos del Sur', 'Vértigo Azul', 'Medianoche en Lima', 'Código Fantasma'],
        'serie' => ['Distrito 9 Sur', 'Los Herederos', 'Frecuencia', 'Archivo Cero', 'Río Abajo'],
        'anime' => ['Kaze no Ken', 'Astral Drive', 'Neko Shrine', 'Shinobi Code', 'Mecha Requiem', 'Sakura Protocol'],
    ];

    public static function catalog(string $type, int $page, string $q): array
    {
        $items = [];
        foreach (self::NAMES[$type] as $i => $name) {
            if ($q !== '' && stripos($name, $q) === false) {
                continue;
            }
            $items[] = ['type' => $type, 'tmdb' => 1000 + $i + 100 * array_search($type, AX_TYPES, true),
                'title' => $name, 'year' => 2019 + $i % 7, 'poster' => null, 'episodes' => $type === 'movie' ? 0 : 12];
        }
        return ['page' => $page, 'per_page' => 20, 'total' => count($items), 'items' => $page === 1 ? $items : []];
    }

    public static function title(string $type, int $tmdb): array
    {
        $idx = ($tmdb - 1000) % 100;
        $name = self::NAMES[$type][$idx] ?? 'Título de ejemplo';
        $seasons = [];
        if ($type !== 'movie') {
            foreach ([1, 2] as $s) {
                $eps = [];
                for ($e = 1; $e <= ($s === 1 ? 12 : 8); $e++) {
                    $eps[] = ['n' => $e, 'title' => 'Episodio ' . $e, 'still' => null];
                }
                $seasons[] = ['n' => $s, 'episodes' => $eps];
            }
        }
        return ['type' => $type, 'tmdb' => $tmdb, 'title' => $name, 'year' => 2023, 'poster' => null, 'episodes' => 20,
            'overview' => 'Sinopsis de ejemplo. Activa tu API key y desactiva el modo demo para ver el catálogo real.',
            'backdrop' => null, 'genres' => ['Acción', 'Drama'], 'seasons' => $seasons];
    }
}
