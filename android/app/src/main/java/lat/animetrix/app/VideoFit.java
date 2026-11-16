package lat.animetrix.app;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * Ajuste del video en pantalla completa (como "ampliar" en Netflix).
 * Se inyecta una regla CSS mínima en el reproductor (solo cambia object-fit del <video>),
 * y la app le indica "cover" (llenar la pantalla) o "contain" (video completo).
 */
final class VideoFit {
    private VideoFit() {}

    static final String COVER = "cover";
    static final String CONTAIN = "contain";

    /** Script del reproductor: escucha la orden de la página y la reenvía a sus iframes internos. */
    private static final String PLAYER_JS =
        "(function(){if(window.__axFit)return;window.__axFit=1;var mode='contain';var st=null;" +
        "function apply(){if(!st){st=document.createElement('style');}" +
        "st.textContent='video{object-fit:'+mode+' !important;}';" +
        "var p=document.head||document.documentElement;if(p&&st.parentNode!==p)p.appendChild(st);}" +
        "window.addEventListener('message',function(e){var d=e.data;" +
        "if(!d||typeof d!=='object'||!d.axFit||e.source!==window.parent)return;" +
        "mode=d.axFit==='cover'?'cover':'contain';apply();" +
        "var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){try{f[i].contentWindow.postMessage({axFit:mode},'*');}catch(x){}}});" +
        "document.addEventListener('DOMContentLoaded',apply);apply();})();";

    static boolean install(WebView web) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false;
        try {
            WebViewCompat.addDocumentStartJavaScript(web, PLAYER_JS, Collections.singleton("*"));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Envía el modo a todos los reproductores de la página actual. */
    static void apply(WebView web, String mode) {
        String m = COVER.equals(mode) ? COVER : CONTAIN;
        web.evaluateJavascript(
            "(function(){var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){" +
            "try{f[i].contentWindow.postMessage({axFit:'" + m + "'},'*');}catch(e){}}})();", null);
    }

    /** Contenedor de pantalla completa que detecta el gesto de pellizcar sin bloquear los controles del video. */
    static final class Holder extends FrameLayout {
        interface Listener { void onPinch(boolean zoomIn); }
        private final ScaleGestureDetector detector;
        private float total = 1f;
        private boolean scaling;

        Holder(Context c, Listener l) {
            super(c);
            setBackgroundColor(0xFF000000);
            detector = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScaleBegin(ScaleGestureDetector d) { total = 1f; scaling = true; return true; }
                @Override public boolean onScale(ScaleGestureDetector d) { total *= d.getScaleFactor(); return true; }
                @Override public void onScaleEnd(ScaleGestureDetector d) {
                    scaling = false;
                    if (total > 1.12f) l.onPinch(true);
                    else if (total < 0.88f) l.onPinch(false);
                }
            });
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent ev) {
            detector.onTouchEvent(ev);
            // Con dos dedos es un pellizco: no se pasa al reproductor (evita pausas o adelantos accidentales).
            if (scaling || ev.getPointerCount() > 1) {
                if (ev.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN) {
                    MotionEvent cancel = MotionEvent.obtain(ev);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    super.dispatchTouchEvent(cancel);
                    cancel.recycle();
                }
                return true;
            }
            return super.dispatchTouchEvent(ev);
        }
    }
}
