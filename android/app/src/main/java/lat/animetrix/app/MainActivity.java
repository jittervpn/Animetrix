package lat.animetrix.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PictureInPictureParams;
import android.util.Rational;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.util.Locale;

/**
 * Animetrix para Android.
 * Seguridad:
 *  - Solo abre https://animetrix.lat (y www). Cualquier otro sitio que intente
 *    cargarse en la app (anuncios, redirecciones) se bloquea.
 *  - Ventanas emergentes bloqueadas, enlaces intent:// / market:// bloqueados.
 *  - Bloqueo de anuncios a nivel de red (también dentro del reproductor).
 *  - Sin acceso a archivos, sin interfaz JavaScript↔Android, sin contenido mixto,
 *    sin permisos de cámara/micrófono/ubicación, solo HTTPS, Navegación Segura activa.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://www.animetrix.lat/";
    private static final String TELEGRAM = "https://t.me/animetrixlat";

    private WebView web;
    private ProgressBar progress;
    private View offline;
    private FrameLayout root;
    private View loader;
    private boolean firstPageShown;

    private View fullscreenView;
    private VideoFit.Holder fullscreenHolder;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    private AdBanner banner;
    private long lastBackPress;
    private long lastAdToast;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        root = findViewById(R.id.root);
        web = findViewById(R.id.web);
        progress = findViewById(R.id.progress);
        offline = findViewById(R.id.offline);
        loader = findViewById(R.id.loader);
        findViewById(R.id.retry).setOnClickListener(v -> retry());

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Android 15 dibuja la app debajo de la barra de estado y la de navegación (edge-to-edge).
        // Se reserva ese espacio para que nada quede tapado, en todos los Android.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets in = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                l = in.left; t = in.top; r = in.right; b = Math.max(in.bottom, ime.bottom);
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            if (fullscreenView != null || cine) { l = t = r = b = 0; }   // video en pantalla completa / modo cine: sin márgenes
            v.setPadding(l, t, r, b);
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                       // "Mi lista" y "Seguir viendo"
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);                        // sin acceso a archivos del teléfono
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(true);                  // window.open → onCreateWindow (bloqueado)
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setGeolocationEnabled(false);
        s.setSupportZoom(false);
        // El tamaño de letra del sistema descuadraba el diseño en celulares con letra grande.
        s.setTextZoom(100);
        // AnimetrixCine/1: la web muestra la barra del modo cine y el botón "Ampliar" (solo en versiones que lo soportan).
        s.setUserAgentString(s.getUserAgentString() + " AnimetrixApp/" + BuildConfig.VERSION_NAME + " AnimetrixCine/1");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) s.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);      // el reproductor y los anuncios de Google las necesitan

        // Conecta el visor con el SDK de Google para que AdSense funcione dentro de la app
        // (requisito de Google para mostrar anuncios web en apps).
        try { com.google.android.gms.ads.MobileAds.registerWebView(web); } catch (Throwable ignored) { }

        // Que se sienta como app y no como página: sin menú al mantener presionado,
        // sin barras de desplazamiento ni efecto rebote.
        web.setOnLongClickListener(v -> true);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        VideoFit.install(web);
        web.setWebViewClient(new SafeClient());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl(getIntent()));
        }

        // Notificaciones: canales, permiso (Android 13+), revisión periódica y revisión al abrir.
        Notifier.createChannels(this);
        Notifier.schedule(this);
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getSharedPreferences("notify", MODE_PRIVATE).getBoolean("asked", false)) {
            getSharedPreferences("notify", MODE_PRIVATE).edit().putBoolean("asked", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
        maybeInviteTelegram();

        // Banner de AdMob (se enciende/apaga y configura desde animetrix.lat/admin).
        banner = new AdBanner(this, findViewById(R.id.content), findViewById(R.id.ad_slot));
        banner.start();

        new Thread(() -> {
            Notifier.Result r = Notifier.check(getApplicationContext());
            if (r.latestCode > BuildConfig.VERSION_CODE && r.updateUrl != null) runOnUiThread(() -> offerUpdate(r));
        }, "animetrix-open-check").start();
    }

    /* ------------------------------------------------ opciones del menú lateral */

    /** Acciones nativas pedidas desde el menú (enlaces /app-accion?a=…, sin puente JavaScript). */
    private void appAction(String a) {
        if (a == null) return;
        switch (a) {
            case "cine-on":  if (onPlayer) { cineWanted = true;  setCine(true); }  break;
            case "cine-off": if (onPlayer) { cineWanted = false; setCine(false); } break;
            case "ajuste":   setFit(VideoFit.COVER.equals(currentFit()) ? VideoFit.CONTAIN : VideoFit.COVER, true); break;
            case "compartir": {
                String text = "🍿 Mira películas, series y anime gratis en Animetrix\n\n📲 Descarga la app: https://www.animetrix.lat/app\n✈️ Canal: " + TELEGRAM;
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "Animetrix").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, getString(R.string.share_via)));
                break;
            }
            case "notificaciones": {
                Intent i;
                if (Build.VERSION.SDK_INT >= 26) {
                    i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                } else {
                    i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                }
                try { startActivity(i); } catch (Exception e) { toast("No se pudieron abrir los ajustes"); }
                break;
            }
            case "actualizar": {
                toast("Buscando actualizaciones…");
                new Thread(() -> {
                    Notifier.Result r = Notifier.check(getApplicationContext());
                    runOnUiThread(() -> {
                        if (r.latestCode > BuildConfig.VERSION_CODE && r.updateUrl != null) showUpdate(r);
                        else if (r.latestCode > 0) toast("✅ Ya tienes la última versión (" + BuildConfig.VERSION_NAME + ")");
                        else toast("No se pudo comprobar. Revisa tu conexión.");
                    });
                }, "animetrix-manual-check").start();
                break;
            }
            case "limpiar": {
                // Solo la caché de imágenes y páginas: "Mi lista" y el historial se conservan.
                web.clearCache(true);
                toast("🧹 Caché borrada. Tu lista y tu historial se conservan.");
                web.loadUrl(HOME);
                break;
            }
            default: break;
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /** Aviso dentro de la app cuando hay una versión nueva (una vez por versión). */
    private void offerUpdate(Notifier.Result r) {
        if (isFinishing() || isDestroyed()) return;
        android.content.SharedPreferences p = getSharedPreferences("notify", MODE_PRIVATE);
        if (p.getInt("update_dialog", 0) == r.latestCode) return;
        p.edit().putInt("update_dialog", r.latestCode).apply();
        showUpdate(r);
    }

    private void showUpdate(Notifier.Result r) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle(R.string.update_title)
            .setMessage(getString(R.string.update_dialog, r.latestName))
            .setPositiveButton(R.string.update_now, (d, w) -> {
                if (Notifier.isTrustedDownload(r.updateUrl)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(r.updateUrl)));
                }
            })
            .setNegativeButton(R.string.later, null)
            .show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null && isOwnHttps(data)) web.loadUrl(data.toString());
    }

    private String startUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return (data != null && isOwnHttps(data)) ? data.toString() : HOME;
    }

    private static boolean isOwnHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("animetrix.lat") || h.endsWith(".animetrix.lat");
    }

    private static boolean isOwnHttps(Uri u) {
        return "https".equalsIgnoreCase(u.getScheme()) && isOwnHost(u.getHost());
    }

    /** true mientras se ve la página del reproductor (/ver): solo ahí actúa el bloqueador de anuncios. */
    private volatile boolean onPlayer;

    // Modo cine: al abrir un capítulo (/ver) la app pasa sola a horizontal y pantalla completa.
    private boolean cine;           // estado aplicado
    private boolean cineWanted = true;
    private String cineUrl;         // página /ver actual (un capítulo nuevo vuelve a activar el modo cine)

    private void trackPage(String url) {
        if (url == null) return;
        Uri u = Uri.parse(url);
        boolean wasPlayer = onPlayer;
        onPlayer = isOwnHost(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/ver");
        if (banner != null) banner.setOnPlayer(onPlayer);
        if (onPlayer) {
            if (!url.equals(cineUrl)) { cineUrl = url; cineWanted = true; }
            setCine(cineWanted);
        } else {
            cineUrl = null;
            setCine(false);
            if (wasPlayer && fullscreenView == null) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /** Aplica el ajuste guardado (Ampliar/Ajustar) al video en modo cine; se repite porque el reproductor carga después. */
    private void fitCineSoon() {
        for (long d : new long[] { 0, 1200, 3500, 8000 }) {
            web.postDelayed(() -> { if (cine && fullscreenView == null) VideoFit.apply(web, currentFit()); }, d);
        }
    }

    private void setCine(boolean on) {
        cine = on;
        if (fullscreenView != null) return;   // el video nativo a pantalla completa manda; al salir se reaplica
        applyCine();
    }

    private void applyCine() {
        setCutoutMode(cine);   // en modo cine el video usa también la zona de la cámara
        if (cine) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setFullscreenBars(true);
            fitCineSoon();
        } else {
            // En el reproductor fuera del modo cine: vertical, para ver la lista de episodios.
            setRequestedOrientation(onPlayer ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setFullscreenBars(false);
            VideoFit.apply(web, VideoFit.CONTAIN);
        }
        if (banner != null) banner.setFullscreen(cine);
        root.requestApplyInsets();
    }

    /** ¿La petición viene del reproductor de video (página /ver o el iframe de InkaCat)? */
    private boolean fromPlayer(WebResourceRequest req) {
        if (onPlayer) return true;
        String ref = req.getRequestHeaders() == null ? null : req.getRequestHeaders().get("Referer");
        return ref != null && ref.contains("inkaflix.space");
    }

    /** Clic en un anuncio de Google: se abre en el navegador. */
    private static boolean isGoogleAdClick(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        return "https".equalsIgnoreCase(u.getScheme()) && (h.equals("googleadservices.com") || h.endsWith(".googleadservices.com")
            || h.endsWith(".doubleclick.net") || h.endsWith(".googlesyndication.com")
            || ((h.equals("www.google.com") || h.startsWith("www.google.")) && u.getPath() != null && u.getPath().startsWith("/aclk")));
    }

    private static boolean isTelegram(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        return "https".equalsIgnoreCase(u.getScheme()) && (h.equals("t.me") || h.equals("telegram.me") || h.equals("telegram.dog"));
    }

    /** Abre Telegram (la app si está instalada, si no el navegador). */
    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo abrir el enlace", Toast.LENGTH_SHORT).show();
        }
    }

    /** Invitación (una sola vez, a partir de la 3ª apertura) a unirse al canal de Telegram. */
    private void maybeInviteTelegram() {
        android.content.SharedPreferences p = getSharedPreferences("app", MODE_PRIVATE);
        int opens = p.getInt("opens", 0) + 1;
        p.edit().putInt("opens", opens).apply();
        if (opens < 3 || p.getBoolean("tg_invited", false)) return;
        p.edit().putBoolean("tg_invited", true).apply();
        web.postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.tg_title)
                .setMessage(R.string.tg_text)
                .setPositiveButton(R.string.tg_join, (d, w) -> openExternal(Uri.parse(TELEGRAM)))
                .setNegativeButton(R.string.not_now, null)
                .show();
        }, 4000);
    }

    /** Menú nativo "Compartir" de Android con el enlace que abre la app (o la web si no la tienen). */
    private void shareTitle(Uri u) {
        String t = u.getQueryParameter("t");
        String id = u.getQueryParameter("id");
        String title = u.getQueryParameter("title");
        if (t == null || !t.matches("movie|serie|anime") || id == null || !id.matches("\\d{1,9}")) return;
        if (title == null) title = "Animetrix";
        title = title.length() > 100 ? title.substring(0, 100) : title;
        String link = "https://www.animetrix.lat/abrir?t=" + t + "&id=" + id;
        String text = "🎬 Mira " + title + " en Animetrix\n" + link + "\n\n📲 Descarga la app: https://www.animetrix.lat/app";
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, title)
            .putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(send, getString(R.string.share_via)));
    }

    /* ---------------------------------------------- imagen en imagen (PiP) */

    private PictureInPictureParams pipParams(boolean auto) {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(auto).setSeamlessResizeEnabled(true);
        return b.build();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Si está viendo un video en pantalla completa y sale de la app, sigue en una ventanita flotante.
        if (fullscreenView != null && Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31) {
            try { enterPictureInPictureMode(pipParams(false)); } catch (Exception ignored) {}
        }
    }

    private void hideLoader() {
        if (firstPageShown) return;
        firstPageShown = true;
        loader.animate().alpha(0f).setDuration(220).withEndAction(() -> loader.setVisibility(View.GONE)).start();
    }

    private void adBlockedToast() {
        long now = System.currentTimeMillis();
        if (now - lastAdToast > 4000) {
            lastAdToast = now;
            Toast.makeText(this, R.string.ad_blocked, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void retry() {
        offline.setVisibility(View.GONE);
        String url = web.getUrl();
        if (url == null || !isOwnHttps(Uri.parse(url))) web.loadUrl(HOME); else web.reload();
    }

    /* ------------------------------------------------------------------ navegación */

    private class SafeClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);

            if (!req.isForMainFrame()) {
                // Marcos internos (reproductor o anuncios de Google): navegación normal, salvo esquemas raros.
                // Los anuncios solo se bloquean dentro del reproductor de video.
                if (!scheme.equals("https") && !scheme.equals("about") && !scheme.equals("blob") && !scheme.equals("data")) return true;
                return fromPlayer(req) && AdBlocker.isAd(u.getHost());
            }
            // Ventana principal: solo animetrix.lat por HTTPS. Telegram se abre en su app (solo si el usuario tocó).
            // Todo lo demás es un anuncio o redirección → bloqueado.
            if (isOwnHttps(u) && "/compartir".equals(u.getPath())) { shareTitle(u); return true; }
            if (isOwnHttps(u) && "/app-accion".equals(u.getPath())) { appAction(u.getQueryParameter("a")); return true; }
            // Antes de abrir el reproductor: intersticial de AdMob (si está activo y ya pasó el tiempo mínimo).
            if (isOwnHttps(u) && u.getPath() != null && u.getPath().startsWith("/ver") && banner != null
                && banner.showBeforePlayer(() -> { if (web != null) web.loadUrl(u.toString()); })) return true;
            if (isOwnHttps(u)) return false;
            if (isTelegram(u) && req.hasGesture()) { openExternal(u); return true; }
            // Fuera del reproductor, un toque en un anuncio de Google se abre en el navegador.
            if (!onPlayer && req.hasGesture() && "https".equals(scheme)) { openExternal(u); return true; }
            adBlockedToast();
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (fromPlayer(req) && AdBlocker.isAd(u.getHost())) return AdBlocker.empty();
            return super.shouldInterceptRequest(view, req);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            trackPage(url);
            offline.setVisibility(View.GONE);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            trackPage(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (cine) fitCineSoon();
            hideLoader();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
            if (req.isForMainFrame()) { offline.setVisibility(View.VISIBLE); hideLoader(); }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel(); // nunca aceptar certificados inválidos
            offline.setVisibility(View.VISIBLE);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // El motor web se cerró (poca memoria): se reinicia la pantalla en vez de cerrar la app.
            ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            web = null;
            recreate();
            return true;
        }
    }

    /* ------------------------------------------------------- pantalla completa y permisos */

    private class Chrome extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int p) {
            progress.setProgress(p);
            progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            // Enlaces "abrir en otra ventana": solo se permiten Telegram (en su app) y Animetrix (en la misma pantalla).
            // Cualquier otra ventana emergente es un anuncio → bloqueada.
            if (!isUserGesture) { if (onPlayer) adBlockedToast(); return false; }
            WebView probe = new WebView(MainActivity.this);
            probe.setWebViewClient(new WebViewClient() {
                private boolean handled;
                private void handle(WebView v, Uri u) {
                    if (handled) return;
                    handled = true;
                    if (isTelegram(u)) openExternal(u);
                    else if (isOwnHttps(u)) web.loadUrl(u.toString());
                    else if (isGoogleAdClick(u) || (!onPlayer && "https".equalsIgnoreCase(u.getScheme()))) openExternal(u); // anuncio de Google tocado
                    else adBlockedToast();
                    v.stopLoading();
                    v.post(v::destroy);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { handle(v, r.getUrl()); return true; }
                @Override public void onPageStarted(WebView v, String url, Bitmap f) { handle(v, Uri.parse(url)); }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(probe);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny(); // sin cámara ni micrófono
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false); // sin ubicación
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
            fullscreenView = view;
            fullscreenCallback = callback;
            fullscreenHolder = new VideoFit.Holder(MainActivity.this, zoomIn -> setFit(zoomIn ? VideoFit.COVER : VideoFit.CONTAIN, true));
            fullscreenHolder.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            root.addView(fullscreenHolder, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            setCutoutMode(true);
            fullscreenHolder.addPill(() -> setFit(VideoFit.COVER.equals(currentFit()) ? VideoFit.CONTAIN : VideoFit.COVER, false));
            setFit(currentFit(), false);
            fullscreenHolder.showPill();
            // El reproductor reacomoda el video al entrar en pantalla completa: se vuelve a aplicar.
            web.postDelayed(() -> { if (fullscreenView != null) VideoFit.apply(web, currentFit()); }, 500);
            web.postDelayed(() -> { if (fullscreenView != null) VideoFit.apply(web, currentFit()); }, 1500);
            android.content.SharedPreferences ap = getSharedPreferences("app", MODE_PRIVATE);
            if (!ap.getBoolean("fit_hint", false)) {
                ap.edit().putBoolean("fit_hint", true).apply();
                Toast.makeText(MainActivity.this, R.string.fit_hint, Toast.LENGTH_LONG).show();
            }
            web.setVisibility(View.GONE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 31) setPictureInPictureParams(pipParams(true));
            setFullscreenBars(true);
            if (banner != null) banner.setFullscreen(true);
            root.requestApplyInsets();
        }

        @Override
        public void onHideCustomView() {
            exitFullscreen();
        }
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        if (fullscreenHolder != null) { fullscreenHolder.removeAllViews(); root.removeView(fullscreenHolder); fullscreenHolder = null; }
        else root.removeView(fullscreenView);
        fullscreenView = null;
        setCutoutMode(false);
        VideoFit.apply(web, VideoFit.CONTAIN);
        web.setVisibility(View.VISIBLE);
        if (Build.VERSION.SDK_INT >= 31) setPictureInPictureParams(pipParams(false));
        if (onPlayer) {
            applyCine();   // vuelve al modo cine (horizontal) o a vertical, según estaba
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setFullscreenBars(false);
            if (banner != null) banner.setFullscreen(false);
            root.requestApplyInsets();
        }
        if (fullscreenCallback != null) { fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
    }

    /** Modo del video en pantalla completa: llenar (cover) o completo (contain). */
    private String currentFit() {
        return getSharedPreferences("app", MODE_PRIVATE).getString("video_fit", VideoFit.COVER);
    }

    private void setFit(String mode, boolean announce) {
        getSharedPreferences("app", MODE_PRIVATE).edit().putString("video_fit", mode).apply();
        VideoFit.apply(web, mode);
        if (fullscreenHolder != null) fullscreenHolder.setPillText(VideoFit.COVER.equals(mode) ? "⤡  Ajustar" : "⤢  Ampliar");
        if (announce) Toast.makeText(this, VideoFit.COVER.equals(mode) ? R.string.fit_cover : R.string.fit_contain, Toast.LENGTH_SHORT).show();
    }

    /** En pantalla completa el video usa también la zona del notch / cámara. */
    private void setCutoutMode(boolean fullscreen) {
        if (Build.VERSION.SDK_INT < 28) return;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.layoutInDisplayCutoutMode = fullscreen
            ? (Build.VERSION.SDK_INT >= 30 ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                                           : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES)
            : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
        getWindow().setAttributes(lp);
    }

    @SuppressWarnings("deprecation")
    private void setFullscreenBars(boolean on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c == null) return;
            if (on) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                c.show(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    /* ------------------------------------------------------------- ciclo de vida */

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (fullscreenView != null) { exitFullscreen(); return; }
        // Atrás en modo cine: primero vuelve a la vista vertical con los episodios.
        if (onPlayer && cine) { cineWanted = false; setCine(false); return; }
        if (offline.getVisibility() == View.VISIBLE && isOnline()) { retry(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) { super.onBackPressed(); return; }
        lastBackPress = now;
        Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override protected void onPause() {
        super.onPause();
        boolean pip = Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode();
        if (!pip) web.onPause();   // en imagen en imagen el video sigue reproduciéndose
        if (banner != null) banner.onPause();
        CookieManager.getInstance().flush();
    }
    @Override protected void onResume() {
        super.onResume();
        web.onResume();
        if (banner != null) banner.onResume();
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        if (banner != null) banner.onSizeChanged();   // giro de pantalla: banner al nuevo ancho
    }

    @Override
    protected void onDestroy() {
        if (banner != null) banner.onDestroy();
        if (web != null) {
            web.stopLoading();
            web.setWebChromeClient(null);
            web.setWebViewClient(null);
            web.destroy();
        }
        super.onDestroy();
    }
}
