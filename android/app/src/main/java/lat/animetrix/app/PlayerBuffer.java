package lat.animetrix.app;

import android.content.Context;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * Límite de búfer para el servidor "Free vip" (vidara.to, JW Player dentro del reproductor de InkaCat).
 *
 * Ese reproductor nunca descarta el video ya visto: el búfer crecía todo el capítulo y, sumado a los
 * anuncios que dispara cada toque, en un moto g05 la memoria bajaba ~13 MB/s hasta que Android cerraba
 * la app. El script (assets/player_buffer.js) se inyecta solo en ese reproductor y borra lo ya visto
 * (deja 10 s atrás), también al pausar, sin que el reproductor lo note.
 * Probado en Chrome sobre Free vip real: búfer fijo en ~30-40 s y memoria estable con 17 pausas en 2 min.
 */
final class PlayerBuffer {
    private PlayerBuffer() {}

    /** Orígenes donde se aplica (el reproductor de "Free vip"). */
    private static final String[] ORIGINS = { "https://vidara.to", "https://*.vidara.to" };

    static boolean install(Context ctx, WebView web) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false;
        try (InputStream in = ctx.getAssets().open("player_buffer.js"); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            Set<String> rules = new HashSet<>();
            for (String o : ORIGINS) rules.add(o);
            WebViewCompat.addDocumentStartJavaScript(web, bo.toString(StandardCharsets.UTF_8.name()), rules);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
