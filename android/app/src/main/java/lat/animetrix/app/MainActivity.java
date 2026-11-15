package lat.animetrix.app;

import android.annotation.SuppressLint;
import android.app.Activity;
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

    private WebView web;
    private ProgressBar progress;
    private View offline;
    private FrameLayout root;

    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

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
        findViewById(R.id.retry).setOnClickListener(v -> retry());

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

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
        s.setUserAgentString(s.getUserAgentString() + " AnimetrixApp/" + BuildConfig.VERSION_NAME);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) s.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);      // el reproductor de InkaFlix las necesita

        web.setWebViewClient(new SafeClient());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl(getIntent()));
        }
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
                // Dentro del reproductor: se permite su navegación normal, salvo anuncios y esquemas raros.
                if (!scheme.equals("https") && !scheme.equals("about") && !scheme.equals("blob") && !scheme.equals("data")) return true;
                return AdBlocker.isAd(u.getHost());
            }
            // Ventana principal: solo animetrix.lat por HTTPS. Todo lo demás es un anuncio o redirección → bloqueado.
            if (isOwnHttps(u)) return false;
            adBlockedToast();
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (AdBlocker.isAd(u.getHost())) return AdBlocker.empty();
            return super.shouldInterceptRequest(view, req);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            offline.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
            if (req.isForMainFrame()) offline.setVisibility(View.VISIBLE);
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
            adBlockedToast(); // ventanas emergentes = anuncios
            return false;
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
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.setVisibility(View.GONE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setImmersive(true);
        }

        @Override
        public void onHideCustomView() {
            exitFullscreen();
        }
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        web.setVisibility(View.VISIBLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setImmersive(false);
        if (fullscreenCallback != null) { fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
    }

    @SuppressWarnings("deprecation")
    private void setImmersive(boolean on) {
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

    @Override protected void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.setWebChromeClient(null);
            web.setWebViewClient(null);
            web.destroy();
        }
        super.onDestroy();
    }
}
