package lat.animetrix.app;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Diagnóstico de cierres: al abrir la app se envía a /api/reporte por qué se cerró la vez anterior
 * (motivo que guarda Android 11+: falta de memoria, error, ANR…; errores de Java; cierres del motor web).
 * Sin datos personales: solo el motivo técnico, el modelo de celular y la página abierta.
 */
final class CrashReport {
    private CrashReport() {}

    private static final String ENDPOINT = "https://www.animetrix.lat/api/reporte";
    private static final String PREFS = "diag";

    /** Guarda el error de Java que va a cerrar la app (se envía en la próxima apertura). */
    static void installHandler(Context ctx) {
        Context app = ctx.getApplicationContext();
        Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        if (prev instanceof Handler) return;
        Thread.setDefaultUncaughtExceptionHandler(new Handler(app, prev));
    }

    private static final class Handler implements Thread.UncaughtExceptionHandler {
        private final Context app; private final Thread.UncaughtExceptionHandler prev;
        Handler(Context app, Thread.UncaughtExceptionHandler prev) { this.app = app; this.prev = prev; }
        @Override public void uncaughtException(Thread t, Throwable e) {
            try {
                StringWriter sw = new StringWriter(); e.printStackTrace(new PrintWriter(sw));
                String s = sw.toString();
                app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString("java_crash", s.length() > 4000 ? s.substring(0, 4000) : s)
                    .putLong("java_crash_at", System.currentTimeMillis()).commit();
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        }
    }

    /** El motor web se cerró (se llama desde onRenderProcessGone). */
    static void rendererGone(Context ctx, boolean crashed, int priority, String url) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("render_gone", (crashed ? "crash" : "killed") + "|" + priority + "|" + (url == null ? "" : url))
            .putLong("render_gone_at", System.currentTimeMillis()).commit();
    }

    /** Página actual (para saber dónde ocurrió el cierre). */
    static void page(Context ctx, String url) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("last_url", url).apply();
    }

    // Historial de memoria en el reproductor: últimas 40 mediciones (cada ~1 s se toma, cada 4 s se guarda).
    private static final java.util.ArrayDeque<String> samples = new java.util.ArrayDeque<>();
    private static int sampleCount;
    static void sample(Context ctx, long rssKb, long availKb) {
        samples.addLast((System.currentTimeMillis() / 1000 % 100000) + ":" + (rssKb / 1024) + "/" + (availKb / 1024));
        while (samples.size() > 40) samples.removeFirst();
        if (++sampleCount % 4 == 0) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("mem_tl", String.join(" ", samples)).apply();
        }
    }

    /** Envía ya un aviso de memoria (la guardia recargó el reproductor o hubo un pico alto). */
    static void memoryNow(Context ctx, String kind, long rssKb, long limitKb, String url) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                ActivityManager am = (ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo(); am.getMemoryInfo(mi);
                JSONArray items = new JSONArray().put(new JSONObject().put("kind", kind).put("reason", "MEMORY")
                    .put("rssKb", rssKb).put("pssKb", limitKb).put("at", System.currentTimeMillis()).put("url", url)
                    .put("desc", "libre del sistema: " + (mi.availMem / (1024 * 1024)) + " MB"));
                post(new JSONObject().put("v", BuildConfig.VERSION_NAME).put("sdk", Build.VERSION.SDK_INT)
                    .put("model", Build.MANUFACTURER + " " + Build.MODEL).put("ramMb", mi.totalMem / (1024 * 1024))
                    .put("lowRam", am.isLowRamDevice()).put("items", items).toString());
            } catch (Throwable ignored) { }
        }, "animetrix-diag-mem").start();
    }

    /** Junta lo pendiente y lo envía en segundo plano. */
    static void sendPending(Context ctx) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                String lastUrl = p.getString("last_url", null);
                JSONArray items = new JSONArray();

                String jc = p.getString("java_crash", null);
                if (jc != null) items.put(new JSONObject().put("kind", "java").put("reason", "CRASH").put("at", p.getLong("java_crash_at", 0)).put("trace", jc).put("url", lastUrl));
                String rg = p.getString("render_gone", null);
                if (rg != null) {
                    String[] a = rg.split("\\|", 3);
                    items.put(new JSONObject().put("kind", "renderer").put("reason", a[0]).put("sub", a.length > 1 ? a[1] : "").put("at", p.getLong("render_gone_at", 0)).put("url", a.length > 2 ? a[2] : ""));
                }

                String tl = p.getString("mem_tl", null);
                long since = p.getLong("exit_seen", 0), newest = since;
                if (Build.VERSION.SDK_INT >= 30) {
                    ActivityManager am = (ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
                    List<ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(app.getPackageName(), 0, 5);
                    for (ApplicationExitInfo e : list) {
                        if (e.getTimestamp() <= since) continue;
                        newest = Math.max(newest, e.getTimestamp());
                        int r = e.getReason();
                        String d = e.getDescription();
                        if (d != null && d.contains("isolated not needed")) continue;   // proceso auxiliar del navegador: normal
                        if (r == ApplicationExitInfo.REASON_USER_REQUESTED || r == ApplicationExitInfo.REASON_EXIT_SELF
                            || r == ApplicationExitInfo.REASON_PACKAGE_UPDATED || r == ApplicationExitInfo.REASON_USER_STOPPED) continue;
                        JSONObject o = new JSONObject().put("kind", "exit").put("reason", reasonName(r))
                            .put("status", e.getStatus()).put("importance", e.getImportance())
                            .put("pssKb", e.getPss()).put("rssKb", e.getRss()).put("at", e.getTimestamp())
                            .put("desc", e.getDescription() == null ? "" : e.getDescription()).put("url", lastUrl);
                        if (r == ApplicationExitInfo.REASON_ANR || r == ApplicationExitInfo.REASON_CRASH_NATIVE) o.put("trace", readTrace(e));
                        // Cierre por memoria: se adjunta cómo creció (seg:MB app/MB libres del celular).
                        else if (tl != null && (r == ApplicationExitInfo.REASON_LOW_MEMORY || r == ApplicationExitInfo.REASON_SIGNALED || r == ApplicationExitInfo.REASON_OTHER)) o.put("trace", "memoria " + tl);
                        items.put(o);
                    }
                }
                if (items.length() == 0) { p.edit().putLong("exit_seen", newest).apply(); return; }

                ActivityManager am = (ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo(); am.getMemoryInfo(mi);
                JSONObject body = new JSONObject().put("v", BuildConfig.VERSION_NAME).put("sdk", Build.VERSION.SDK_INT)
                    .put("model", Build.MANUFACTURER + " " + Build.MODEL).put("ramMb", mi.totalMem / (1024 * 1024))
                    .put("lowRam", am.isLowRamDevice()).put("items", items);
                if (post(body.toString())) {
                    p.edit().remove("java_crash").remove("render_gone").remove("mem_tl").putLong("exit_seen", newest).apply();
                }
            } catch (Throwable ignored) { }
        }, "animetrix-diag").start();
    }

    private static String readTrace(ApplicationExitInfo e) {
        if (Build.VERSION.SDK_INT < 30) return "";
        try (InputStream in = e.getTraceInputStream()) {
            if (in == null) return "";
            byte[] buf = new byte[4000]; int n = 0, r;
            while (n < buf.length && (r = in.read(buf, n, buf.length - n)) > 0) n += r;
            return new String(buf, 0, n, StandardCharsets.UTF_8);
        } catch (Throwable t) { return ""; }
    }

    private static String reasonName(int r) {
        switch (r) {
            case 1: return "EXIT_SELF";
            case 2: return "SIGNALED";
            case 3: return "LOW_MEMORY";
            case 4: return "CRASH";
            case 5: return "CRASH_NATIVE";
            case 6: return "ANR";
            case 7: return "INITIALIZATION_FAILURE";
            case 8: return "PERMISSION_CHANGE";
            case 9: return "EXCESSIVE_RESOURCE_USAGE";
            case 10: return "USER_REQUESTED";
            case 11: return "USER_STOPPED";
            case 12: return "DEPENDENCY_DIED";
            case 13: return "OTHER";
            case 14: return "FREEZER";
            case 15: return "PACKAGE_STATE_CHANGE";
            case 16: return "PACKAGE_UPDATED";
            default: return "UNKNOWN_" + r;
        }
    }

    private static boolean post(String json) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            con.setConnectTimeout(8000); con.setReadTimeout(10000);
            con.setRequestMethod("POST"); con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            con.setRequestProperty("User-Agent", "AnimetrixApp/" + BuildConfig.VERSION_NAME + " (diag)");
            try (OutputStream o = con.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
            return con.getResponseCode() == 200;
        } catch (Throwable t) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
