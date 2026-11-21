package lat.animetrix.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

import org.json.JSONObject;

/**
 * Intersticial de AdMob antes de reproducir un video (la "pre-roll" de la app).
 *
 * Se carga de antemano; al abrir el reproductor (/ver), si hay uno listo y ya pasó el
 * tiempo mínimo configurado en /admin, se muestra y al cerrarlo empieza el video.
 * Si no hay anuncio listo, el video abre directo: nunca se hace esperar al usuario.
 */
final class AdInterstitial {

    private static final long MAX_AGE_MS = 55 * 60_000L;   // AdMob invalida un intersticial cargado tras 1 h

    private final Activity act;
    private final SharedPreferences prefs;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private String unit;
    private long everyMs = 5 * 60_000L;
    private InterstitialAd ad;
    private long loadedAt;
    private boolean loading;
    private boolean showing;
    private int failures;
    private boolean destroyed;

    AdInterstitial(Activity act, SharedPreferences prefs) {
        this.act = act;
        this.prefs = prefs;
    }

    /** Aplica la config de /api/app-config (objeto "inter", o null si está apagado). */
    void configure(JSONObject c, String appId) {
        String u = c == null ? "" : c.optString("unit", "");
        boolean test = c != null && c.optBoolean("test", true);
        boolean ok = u.startsWith("ca-app-pub-") && u.contains("/") && (test || samePublisher(u, appId));
        if (!ok) { unit = null; ad = null; return; }
        everyMs = Math.max(1, Math.min(120, c.optInt("every", 5))) * 60_000L;
        if (!u.equals(unit)) { unit = u; ad = null; failures = 0; }
        preload();
    }

    /**
     * Llamar antes de abrir el reproductor. Si muestra el anuncio devuelve true y ejecuta
     * {@code then} al cerrarlo; si no, devuelve false y la navegación sigue normal.
     */
    boolean showBefore(Runnable then) {
        if (unit == null || showing || destroyed) return false;
        if (System.currentTimeMillis() - prefs.getLong("inter_last", 0) < everyMs) return false;
        if (ad == null || System.currentTimeMillis() - loadedAt > MAX_AGE_MS) { ad = null; preload(); return false; }

        InterstitialAd a = ad;
        ad = null;
        showing = true;
        a.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdShowedFullScreenContent() {
                prefs.edit().putLong("inter_last", System.currentTimeMillis()).apply();
            }
            @Override public void onAdDismissedFullScreenContent() { done(then); }
            @Override public void onAdFailedToShowFullScreenContent(AdError e) { done(then); }
        });
        a.show(act);
        return true;
    }

    void onDestroy() {
        destroyed = true;
        ui.removeCallbacksAndMessages(null);
        ad = null;
    }

    private void done(Runnable then) {
        showing = false;
        if (!destroyed) then.run();
        preload();   // deja el siguiente listo
    }

    private void preload() {
        if (unit == null || ad != null || loading || destroyed) return;
        loading = true;
        final String forUnit = unit;
        InterstitialAd.load(act, forUnit, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(InterstitialAd loaded) {
                loading = false;
                if (destroyed || !forUnit.equals(unit)) return;
                ad = loaded; loadedAt = System.currentTimeMillis(); failures = 0;
            }
            @Override public void onAdFailedToLoad(LoadAdError e) {
                loading = false;
                // Reintento con espera creciente (1, 2, 4… hasta 15 min).
                if (failures < 6 && !destroyed) {
                    long wait = Math.min(900_000L, 60_000L << failures++);
                    ui.postDelayed(AdInterstitial.this::preload, wait);
                }
            }
        });
    }

    private static boolean samePublisher(String unitId, String appId) {
        if (appId == null) return false;
        int a = unitId.indexOf('/'), b = appId.indexOf('~');
        return a > 0 && b > 0 && unitId.substring(0, a).equals(appId.substring(0, b));
    }
}
