package lat.animetrix.app;

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
        "google-analytics.com", "googletagmanager.com", "googletagservices.com", "imasdk.googleapis.com",
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
        String h = host.toLowerCase(Locale.ROOT);
        for (String d : AD_DOMAINS) {
            String dd = d.toLowerCase(Locale.ROOT);
            if (h.equals(dd) || h.endsWith("." + dd)) return true;
        }
        for (String w : AD_HINTS) if (h.contains(w)) return true;
        return false;
    }

    /** Respuesta vacía que reemplaza al anuncio bloqueado. */
    static WebResourceResponse empty() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }
}
