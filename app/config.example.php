<?php
/**
 * Copia este archivo como app/config.php en el servidor y pon tu API key.
 * app/config.php está en .gitignore: NUNCA se sube al repositorio.
 *
 * Alternativa: define la variable de entorno INKAFLIX_KEY y deja 'api_key' vacío.
 */
return [
    // API key de InkaFlix (panel → API Keys). Restringida al dominio animetrix.lat.
    'api_key'    => '',

    // Dominio público del sitio (sin https://). Se usa en cabeceras de seguridad.
    'site_host'  => 'animetrix.lat',
    'site_name'  => 'Animetrix',

    // Minutos que se guarda en caché cada respuesta del catálogo.
    'cache_ttl'  => 10,

    // Peticiones máximas por IP y minuto al proxy /api.php.
    'rate_limit' => 90,

    // true = el reproductor se carga con sandbox (bloquea pop-ups de anuncios).
    // Si el video no carga con true, déjalo en false.
    'player_sandbox' => false,

    // true = usa datos de ejemplo (para probar sin conexión a InkaFlix).
    'demo' => false,
];
