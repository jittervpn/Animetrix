package lat.animetrix.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Banner de AdMob, controlado desde el panel /admin del sitio.
 *
 * La configuración (encendido, ID del banner, posición, modo prueba, ocultar en el
 * reproductor) llega de https://www.animetrix.lat/api/app-config, así que se cambia
 * sin publicar un APK nuevo. La última configuración se guarda en el teléfono para
 * que el banner aparezca al instante en la próxima apertura.
 *
 * El banner es una vista nativa aparte del WebView: el bloqueador de anuncios del
 * reproductor no lo toca, y nunca tapa la web (va arriba o abajo de ella).
 */
final class AdBanner {

    private static final String ENDPOINT = "https://www.animetrix.lat/api/app-config";
    private static final int MAX_BYTES = 16 * 1024;
    private static final long REFRESH_MS = 10 * 60_000L;   // vuelve a leer la config cada 10 min (al volver a la app)
    private static boolean sdkStarted;

    private final Activity act;
    private final LinearLayout content;
    private final FrameLayout slot;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;

    private AdView adView;
    private String loadedUnit;
    private int loadedWidthDp;
    private boolean loaded;
    private int failures;
    private long fetchedAt;

    // Configuración vigente
    private boolean enabled;
    private String unit;
    private boolean top;
    private boolean hideOnPlayer = true;

    // Estado de la pantalla
    private boolean onPlayer;
    private boolean fullscreen;
    private boolean destroyed;

    AdBanner(Activity act, LinearLayout content, FrameLayout slot) {
        this.act = act;
        this.content = content;
        this.slot = slot;
        this.prefs = act.getSharedPreferences("ads", Activity.MODE_PRIVATE);
    }

    /** Arranca con la última config conocida y pide la actual al servidor. */
    void start() {
        String saved = prefs.getString("cfg", null);
        if (saved != null) {
            try { apply(new JSONObject(saved)); } catch (Exception ignored) { }
        }
        refresh();
    }

    /** Vuelve a pedir la configuración (en segundo plano). */
    void refresh() {
        fetchedAt = System.currentTimeMillis();
        new Thread(() -> {
            try {
                JSONObject ads = new JSONObject(fetch()).optJSONObject("ads");
                if (ads == null) return;
                prefs.edit().putString("cfg", ads.toString()).apply();
                ui.post(() -> apply(ads));
            } catch (Exception ignored) { /* sin red: se queda con la última config */ }
        }, "animetrix-ads-config").start();
    }

    void onResume() {
        if (adView != null) adView.resume();
        if (System.currentTimeMillis() - fetchedAt > REFRESH_MS) refresh();
    }

    void onPause() {
        if (adView != null) adView.pause();
    }

    void onDestroy() {
        destroyed = true;
        ui.removeCallbacksAndMessages(null);
        dropAd();
    }

    /** Cambió la página: en /ver (reproductor) se puede ocultar. */
    void setOnPlayer(boolean player) {
        if (onPlayer == player) return;
        onPlayer = player;
        updateVisibility();
    }

    /** Video en pantalla completa: el banner nunca se muestra. */
    void setFullscreen(boolean on) {
        fullscreen = on;
        updateVisibility();
    }

    /** Giro de pantalla o cambio de tamaño: el banner adaptable se vuelve a calcular. */
    void onSizeChanged() {
        if (!enabled || unit == null) return;
        slot.post(() -> { if (widthDp() != loadedWidthDp) { dropAd(); ensureAd(); } });
    }

    /* ------------------------------------------------------------ interno */

    private void apply(JSONObject c) {
        if (destroyed) return;
        boolean en = c.optBoolean("enabled", false);
        String u = c.optString("banner", "");
        boolean test = c.optBoolean("test", true);
        if (!u.startsWith("ca-app-pub-") || !u.contains("/")) en = false;
        // Un banner real solo sirve si es de la misma cuenta que el App ID con que se compiló el APK.
        if (en && !test && !samePublisher(u, BuildConfig.ADMOB_APP_ID)) en = false;

        enabled = en;
        top = "top".equals(c.optString("position", "bottom"));
        hideOnPlayer = c.optBoolean("hideOnPlayer", true);
        placeSlot();

        if (!enabled) { unit = null; dropAd(); updateVisibility(); return; }
        if (!u.equals(unit)) { unit = u; dropAd(); failures = 0; }
        ensureAd();
        updateVisibility();
    }

    private static boolean samePublisher(String unitId, String appId) {
        if (appId == null) return false;
        int a = unitId.indexOf('/'), b = appId.indexOf('~');
        return a > 0 && b > 0 && unitId.substring(0, a).equals(appId.substring(0, b));
    }

    private void placeSlot() {
        int want = top ? 0 : content.getChildCount() - 1;
        if (content.indexOfChild(slot) != want) {
            content.removeView(slot);
            content.addView(slot, top ? 0 : content.getChildCount());
        }
    }

    private void ensureAd() {
        if (adView != null || unit == null || destroyed) return;
        startSdk();
        int w = widthDp();
        AdView v = new AdView(act);
        v.setAdUnitId(unit);
        v.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(act, w));
        v.setAdListener(new AdListener() {
            @Override public void onAdLoaded() {
                loaded = true; failures = 0; updateVisibility();
            }
            @Override public void onAdFailedToLoad(LoadAdError err) {
                loaded = false; updateVisibility();
                // Reintento con espera creciente (1, 2, 4… hasta 10 min). AdMob además refresca solo.
                if (failures < 6) {
                    long wait = Math.min(600_000L, 60_000L << failures++);
                    ui.postDelayed(() -> { if (adView == v && !destroyed) v.loadAd(new AdRequest.Builder().build()); }, wait);
                }
            }
        });
        slot.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.Gravity.CENTER_HORIZONTAL));
        adView = v;
        loadedUnit = unit;
        loadedWidthDp = w;
        loaded = false;
        v.loadAd(new AdRequest.Builder().build());
    }

    private void dropAd() {
        if (adView == null) return;
        slot.removeView(adView);
        adView.destroy();
        adView = null;
        loadedUnit = null;
        loaded = false;
        slot.setVisibility(View.GONE);
    }

    private void updateVisibility() {
        boolean show = enabled && adView != null && loaded && !fullscreen && !(hideOnPlayer && onPlayer);
        slot.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    private int widthDp() {
        DisplayMetrics dm = act.getResources().getDisplayMetrics();
        int px = content.getWidth() > 0 ? content.getWidth() : dm.widthPixels;
        return Math.max(320, (int) (px / dm.density));
    }

    private void startSdk() {
        if (sdkStarted) return;
        sdkStarted = true;
        // Se inicia en segundo plano (Google lo recomienda para no frenar la apertura).
        new Thread(() -> MobileAds.initialize(act.getApplicationContext(), s -> { }), "animetrix-ads-init").start();
    }

    private static String fetch() throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        try {
            con.setConnectTimeout(8000);
            con.setReadTimeout(10000);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("User-Agent", "AnimetrixApp/" + BuildConfig.VERSION_NAME + " (ads)");
            if (con.getResponseCode() != 200) throw new Exception("HTTP " + con.getResponseCode());
            try (InputStream in = con.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                byte[] buf = new byte[4096]; int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) throw new Exception("respuesta demasiado grande");
                    bo.write(buf, 0, n);
                }
                return bo.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            con.disconnect();
        }
    }
}
