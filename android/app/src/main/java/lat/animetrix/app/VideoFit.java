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
    /** Script del reproductor: aplica el ajuste directamente en cada <video> (gana a los estilos del reproductor). */
    /** Script del reproductor: aplica el ajuste en cada <video> y restaura sus valores originales. */
    private static final String PLAYER_JS =
        "(function(){" +
        "if(window.__axFit)return;window.__axFit=1;var mode='contain';" +
        "var P=['object-fit','width','height','max-width','max-height','min-width','min-height'];" +
        "var V={'object-fit':'cover','width':'100%','height':'100%','max-width':'none','max-height':'none','min-width':'100%','min-height':'100%'};" +
        "function fitOne(v){try{var s=v.style;" +
        " if(mode==='cover'){" +
        "  if(!v.__axOrig){v.__axOrig={};for(var i=0;i<P.length;i++)v.__axOrig[P[i]]=[s.getPropertyValue(P[i]),s.getPropertyPriority(P[i])];}" +
        "  for(var j=0;j<P.length;j++){if(s.getPropertyValue(P[j])!==V[P[j]]||s.getPropertyPriority(P[j])!=='important')s.setProperty(P[j],V[P[j]],'important');}" +
        " }else if(v.__axOrig){var o=v.__axOrig;v.__axOrig=null;" +
        "  for(var k=0;k<P.length;k++){var x=o[P[k]];if(x&&x[0])s.setProperty(P[k],x[0],x[1]);else s.removeProperty(P[k]);}}" +
        "}catch(e){}}" +
        "function fitAll(){var v=document.getElementsByTagName('video');for(var i=0;i<v.length;i++)fitOne(v[i]);}" +
        "function relay(){var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){try{f[i].contentWindow.postMessage({axFit:mode},'*');}catch(x){}}}" +
        "var mo=null;function watch(){if(mo||!window.MutationObserver||!document.documentElement)return;" +
        " mo=new MutationObserver(function(){if(mode==='cover')fitAll();});" +
        " mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});}" +
        "window.addEventListener('message',function(e){var d=e.data;" +
        " if(!d||typeof d!=='object'||!d.axFit||e.source!==window.parent)return;" +
        " mode=d.axFit==='cover'?'cover':'contain';" +
        " if(mo){mo.disconnect();mo=null;} fitAll(); relay(); if(mode==='cover')watch();});" +
        "document.addEventListener('fullscreenchange',function(){fitAll();});" +
        "document.addEventListener('webkitfullscreenchange',function(){fitAll();});" +
        "})();";

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

        private android.widget.TextView pill;
        private final Runnable hidePill = () -> { if (pill != null) pill.animate().alpha(0f).setDuration(250).withEndAction(() -> pill.setVisibility(GONE)).start(); };

        /** Botón "Ampliar / Ajustar" que aparece al tocar la pantalla y se oculta solo. */
        void addPill(Runnable onClick) {
            pill = new android.widget.TextView(getContext());
            int p = (int) (getResources().getDisplayMetrics().density * 12);
            pill.setPadding(p + p / 2, p - 2, p + p / 2, p - 2);
            pill.setTextColor(0xFFFFFFFF);
            pill.setTextSize(14);
            pill.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setColor(0xB3000000); bg.setCornerRadius(p * 4); bg.setStroke(2, 0x66FFFFFF);
            pill.setBackground(bg);
            pill.setOnClickListener(v -> { onClick.run(); showPill(); });
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, android.view.Gravity.TOP | android.view.Gravity.END);
            lp.setMargins(0, p * 2, p * 2, 0);
            addView(pill, lp);
        }
        void setPillText(String t) { if (pill != null) pill.setText(t); }
        void showPill() {
            if (pill == null) return;
            pill.bringToFront();
            pill.animate().cancel();
            pill.setVisibility(VISIBLE); pill.setAlpha(1f);
            removeCallbacks(hidePill); postDelayed(hidePill, 3500);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent ev) {
            if (ev.getActionMasked() == MotionEvent.ACTION_DOWN && pill != null && pill.getVisibility() != VISIBLE) showPill();
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
