package lat.animetrix.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Notificaciones de Animetrix (solo en la app).
 * Consulta https://www.animetrix.lat/api/notify y compara con lo que ya conocía:
 *  - títulos nuevos  → "Nueva película / serie / anime"
 *  - más episodios   → "Nuevo episodio de …"
 *  - aviso activo    → "Estamos actualizando…"
 *  - versión nueva   → "Actualización disponible"
 * No usa servicios de terceros: no se comparte ningún dato del usuario.
 */
final class Notifier {
    private Notifier() {}

    static final String CH_NEW = "estrenos";
    static final String CH_NEWS = "avisos";
    private static final String ENDPOINT = "https://www.animetrix.lat/api/notify";
    private static final String SITE = "https://www.animetrix.lat";
    private static final int JOB_ID = 4201;
    private static final int MAX_BYTES = 2 * 1024 * 1024;

    /** Datos de la última consulta, para el aviso de actualización dentro de la app. */
    static final class Result { int latestCode; String latestName; String updateUrl; }

    static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel a = new NotificationChannel(CH_NEW, c.getString(R.string.ch_new), NotificationManager.IMPORTANCE_DEFAULT);
        a.setDescription(c.getString(R.string.ch_new_desc));
        NotificationChannel b = new NotificationChannel(CH_NEWS, c.getString(R.string.ch_news), NotificationManager.IMPORTANCE_HIGH);
        b.setDescription(c.getString(R.string.ch_news_desc));
        nm.createNotificationChannel(a);
        nm.createNotificationChannel(b);
    }

    /** Programa la revisión cada ~30 minutos, solo con internet; sobrevive a reinicios. */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, CheckJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(30 * 60 * 1000L)
            .setPersisted(true)
            .build();
        js.schedule(job);
    }

    /** Hace la consulta y muestra las notificaciones que correspondan. Llamar fuera del hilo principal. */
    static synchronized Result check(Context c) {
        Result out = new Result();
        JSONObject data;
        try { data = new JSONObject(fetch()); } catch (Exception e) { return out; }

        SharedPreferences p = c.getSharedPreferences("notify", Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = p.edit();

        // ---- catálogo: títulos y episodios nuevos
        JSONArray items = data.optJSONArray("items");
        if (items != null && items.length() > 0) {
            JSONObject known;
            try { known = new JSONObject(p.getString("known", "{}")); } catch (Exception e) { known = new JSONObject(); }
            boolean baseline = !p.getBoolean("baseline", false);
            List<JSONObject> added = new ArrayList<>();
            List<JSONObject> episodes = new ArrayList<>();
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                String k = it.optString("k", "");
                if (k.isEmpty()) continue;
                int e = it.optInt("e", 0);
                if (!known.has(k)) added.add(it);
                else if (e > known.optInt(k, 0) && known.optInt(k, 0) > 0) episodes.add(it);
                try { known.put(k, Math.max(e, known.optInt(k, 0))); } catch (Exception ignored) {}
            }
            ed.putString("known", known.toString()).putBoolean("baseline", true);
            if (!baseline) {   // la primera vez solo se guarda lo que hay, sin avisar
                if (!added.isEmpty()) notifyAdded(c, added);
                for (int i = 0; i < Math.min(3, episodes.size()); i++) notifyEpisode(c, episodes.get(i));
            }
        }

        // ---- aviso del equipo (mantenimiento, "estamos actualizando")
        JSONObject notice = data.optJSONObject("notice");
        if (notice != null) {
            String id = notice.optString("id", "");
            if (!id.isEmpty() && !id.equals(p.getString("notice_id", ""))) {
                show(c, CH_NEWS, 300, notice.optString("title", "Animetrix"), notice.optString("body", ""), openSite(c, SITE + "/", 300), null);
                ed.putString("notice_id", id);
            }
        }

        // ---- versión nueva de la app
        JSONObject app = data.optJSONObject("app");
        if (app != null) {
            int code = app.optInt("code", 0);
            String url = app.optString("url", "");
            if (code > BuildConfig.VERSION_CODE && isTrustedDownload(url)) {
                out.latestCode = code; out.latestName = app.optString("name", ""); out.updateUrl = url;
                if (p.getInt("update_notified", 0) != code) {
                    show(c, CH_NEWS, 301, c.getString(R.string.update_title), c.getString(R.string.update_text, out.latestName),
                        openBrowser(c, url, 301), null);
                    ed.putInt("update_notified", code);
                }
            }
        }
        ed.apply();
        return out;
    }

    /* --------------------------------------------------------------- avisos */

    private static String label(String type) {
        switch (type) {
            case "movie": return "🎬 Nueva película";
            case "serie": return "📺 Nueva serie";
            case "anime": return "⭐ Nuevo anime";
            default: return "Nuevo en Animetrix";
        }
    }

    private static void notifyAdded(Context c, List<JSONObject> added) {
        if (added.size() == 1) {
            JSONObject it = added.get(0);
            String type = it.optString("ty"); int id = it.optInt("id");
            show(c, CH_NEW, 100, label(type), it.optString("t") + " ya está disponible en Animetrix",
                openSite(c, SITE + "/#/titulo/" + type + "/" + id, 100), null);
            return;
        }
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < Math.min(6, added.size()); i++) lines.add(added.get(i).optString("t"));
        String body = String.join(", ", lines.subList(0, Math.min(2, lines.size())))
            + (added.size() > 2 ? " y " + (added.size() - 2) + " más" : "");
        show(c, CH_NEW, 101, "🎉 " + added.size() + " estrenos nuevos en Animetrix", body, openSite(c, SITE + "/", 101), lines);
    }

    private static void notifyEpisode(Context c, JSONObject it) {
        String type = it.optString("ty"); int id = it.optInt("id");
        int nid = 200 + Math.abs((type + id).hashCode() % 90);
        show(c, CH_NEW, nid, "▶ Nuevo episodio de " + it.optString("t"),
            "Ya está disponible el episodio " + it.optInt("e") + ". ¡Toca para verlo!",
            openSite(c, SITE + "/#/titulo/" + type + "/" + id, nid), null);
    }

    private static void show(Context c, String channel, int id, String title, String body, PendingIntent tap, List<String> lines) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_animetrix)
            .setColor(0xFFC8FF2E)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .setShowWhen(true);
        if (lines != null && !lines.isEmpty()) {
            Notification.InboxStyle st = new Notification.InboxStyle().setSummaryText("Animetrix");
            for (String l : lines) st.addLine(l);
            b.setStyle(st);
        } else {
            b.setStyle(new Notification.BigTextStyle().bigText(body));
        }
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) { /* permiso denegado */ }
    }

    private static PendingIntent openSite(Context c, String url, int req) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openBrowser(Context c, String url, int req) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Solo se aceptan descargas de la app desde el repositorio oficial en GitHub. */
    static boolean isTrustedDownload(String url) {
        try {
            Uri u = Uri.parse(url);
            return "https".equals(u.getScheme()) && "github.com".equals(u.getHost())
                && u.getPath() != null && u.getPath().toLowerCase(Locale.ROOT).startsWith("/jittervpn/animetrix/releases/");
        } catch (Exception e) { return false; }
    }

    /* --------------------------------------------------------------- red */

    private static String fetch() throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        try {
            con.setConnectTimeout(10000);
            con.setReadTimeout(15000);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("User-Agent", "AnimetrixApp/" + BuildConfig.VERSION_NAME + " (notify)");
            if (con.getResponseCode() != 200) throw new Exception("HTTP " + con.getResponseCode());
            try (InputStream in = con.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192]; int n, total = 0;
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
