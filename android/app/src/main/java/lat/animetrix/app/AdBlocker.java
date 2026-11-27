package lat.animetrix.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.util.Locale;

/**
 * Bloqueador de anuncios a nivel de red (como un adblock de navegador).
 * Funciona también dentro del reproductor de InkaCat, porque la app intercepta
 * todas las peticiones del visor web, incluidas las de iframes de otros dominios.
 */
final class AdBlocker {
    private AdBlocker() {}

    /** Dominios de redes de anuncios, pop-unders y rastreo (se bloquean también sus subdominios). */
    private static final String[] AD_DOMAINS = {
        // Google Ads / rastreo
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
        // (imasdk.googleapis.com ya no se bloquea: los reproductores que usan Google IMA se quedaban
        // esperando su script y el video no arrancaba nunca.)
        "google-analytics.com", "googletagmanager.com", "googletagservices.com",
        // Pop-unders y redirecciones típicas de reproductores
        "popads.net", "popcash.net", "propellerads.com", "propu.sh", "onclickads.net", "onclkds.com",
        "adsterra.com", "adsterratools.com", "highperformanceformat.com", "profitablegatecpm.com",
        "effectivegatecpm.com", "profitableratecpm.com", "highcpmgate.com", "exoclick.com", "exosrv.com",
        "exdynsrv.com", "juicyads.com", "hilltopads.net", "hilltopads.com", "clickadu.com", "trafficjunky.net",
        "trafficstars.com", "tsyndicate.com", "a-ads.com", "adcash.com", "admaven.com", "ad-maven.com",
        "mgid.com", "adskeeper.com", "monetag.com", "galaksion.com", "bidvertiser.com", "revcontent.com",
        "taboola.com", "outbrain.com", "zeroredirect1.com", "zeroredirect2.com", "pushame.com", "richads.com",
        "rollerads.com", "evadav.com", "pushground.com", "dolohen.com", "acint.net", "adnxs.com",
        "adform.net", "criteo.com", "criteo.net", "pubmatic.com", "rubiconproject.com", "openx.net",
        "yieldmo.com", "smartadserver.com", "amazon-adsystem.com", "adsrvr.org", "casalemedia.com",
        "lijit.com", "sharethrough.com", "media.net", "bebi.com", "ylliX.net", "adspyglass.com",
        "realsrv.com", "magsrv.com", "popmyads.com", "ads.yahoo.com", "adtng.com", "cpmstar.com",
        "displayvertising.com", "pemsrv.com", "whos.amung.us", "histats.com",
        // Servidor "Free vip" (vidara.to): Adcash (aclib) y su dominio de redirecciones. Cada toque
        // en el video disparaba anuncios nuevos y la memoria del celular subía ~13 MB/s hasta el cierre.
        "acscdn.com", "sammierkelima.com", "adcash.network", "aclib.net"
    };

    /**
     * Se bloquean siempre, incluso en modo suave: son los anuncios de Adcash que llenaban la memoria
     * del celular hasta cerrar la app ("Free vip").
     */
    private static final String[] HARD_DOMAINS = { "acscdn.com", "sammierkelima.com", "adcash.network", "aclib.net" };

    /* ---------------------------------------------------------------- modos */

    /** Bloqueo completo (por defecto). */
    static final String STRICT = "on";
    /** Bloqueo suave: solo los anuncios que cuelgan la app; las ventanas emergentes y redirecciones siguen bloqueadas. */
    static final String SOFT = "soft";
    /** Sin bloqueo por red (las ventanas emergentes y redirecciones siguen bloqueadas). */
    static final String OFF = "off";

    /** Modo elegido desde el servidor (/api/app-config → "adblock"), para corregir sin publicar un APK nuevo. */
    private static volatile String remote = STRICT;
    /** Hasta cuándo se usa el modo suave porque el reproductor solo anduvo así en este celular. */
    private static volatile long softUntil;
    private static SharedPreferences prefs;

    static void init(Context c) {
        prefs = c.getApplicationContext().getSharedPreferences("app", Context.MODE_PRIVATE);
        remote = norm(prefs.getString("adblock_remote", STRICT));
        softUntil = prefs.getLong("adblock_soft_until", 0);
    }

    private static String norm(String m) { return SOFT.equals(m) || OFF.equals(m) ? m : STRICT; }

    static void setRemote(String m) {
        remote = norm(m);
        if (prefs != null) prefs.edit().putString("adblock_remote", remote).apply();
    }

    /** El video arrancó con bloqueo suave después de fallar con el completo: se recuerda 3 días. */
    static void rememberSoft() {
        softUntil = System.currentTimeMillis() + 3L * 24 * 3600_000L;
        if (prefs != null) prefs.edit().putLong("adblock_soft_until", softUntil).apply();
    }

    /** Modo con el que arranca una página nueva del reproductor. */
    static String startMode() {
        if (!STRICT.equals(remote)) return remote;
        return System.currentTimeMillis() < softUntil ? SOFT : STRICT;
    }

    /** ¿Se bloquea esta petición con este modo? */
    static boolean blocks(String mode, android.net.Uri u) {
        if (u == null || OFF.equals(mode)) return false;
        if (SOFT.equals(mode)) return inList(u.getHost(), HARD_DOMAINS) || hardPath(u);
        return isAd(u);
    }

    private static boolean hardPath(android.net.Uri u) {
        String p = u.getPath() == null ? "" : u.getPath().toLowerCase(Locale.ROOT);
        return p.endsWith("/aclib.js");
    }

    private static boolean inList(String host, String[] list) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        for (String d : list) {
            String dd = d.toLowerCase(Locale.ROOT);
            if (h.equals(dd) || h.endsWith("." + dd)) return true;
        }
        return false;
    }

    /** Rutas de scripts de anuncios conocidos aunque se sirvan desde dominios nuevos. */
    private static final String[] AD_PATHS = { "/script/aclib.js", "/aclib.js", "/script/suv5.js" };

    static boolean isAd(android.net.Uri u) {
        if (u == null) return false;
        if (isAd(u.getHost())) return true;
        String p = u.getPath() == null ? "" : u.getPath().toLowerCase(Locale.ROOT);
        for (String a : AD_PATHS) if (p.endsWith(a)) return true;
        return false;
    }

    /** Palabras que delatan scripts de anuncios aunque cambien de dominio. */
    private static final String[] AD_HINTS = { "popunder", "popads", "adsterra", "propeller", "clickunder" };

    static boolean isAd(String host) {
        if (host == null) return false;
        if (inList(host, AD_DOMAINS)) return true;
        String h = host.toLowerCase(Locale.ROOT);
        for (String w : AD_HINTS) if (h.contains(w)) return true;
        return false;
    }

    /**
     * Respuesta vacía que reemplaza al anuncio bloqueado. Para scripts se responde JavaScript vacío
     * (el reproductor ve que "cargó" y sigue, en vez de quedarse esperando un error).
     */
    static WebResourceResponse empty(android.net.Uri u) {
        String p = u == null || u.getPath() == null ? "" : u.getPath().toLowerCase(Locale.ROOT);
        String type = p.endsWith(".js") || p.contains("/js/") || p.contains("script") ? "application/javascript" : "text/plain";
        WebResourceResponse r = new WebResourceResponse(type, "utf-8", new ByteArrayInputStream(new byte[0]));
        java.util.Map<String, String> h = new java.util.HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");   // un fetch() bloqueado no termina en error de CORS
        h.put("Cache-Control", "no-store");
        r.setResponseHeaders(h);
        r.setStatusCodeAndReasonPhrase(200, "OK");
        return r;
    }
}
