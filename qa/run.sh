#!/usr/bin/env bash
# Recorre la app en el emulador y junta capturas, errores (logcat) y fluidez (gfxinfo).
set -u
P=lat.animetrix.app
OUT=qa/out; mkdir -p "$OUT"
log(){ echo "== $*" | tee -a "$OUT/pasos.txt"; }
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; log "captura $1"; }
size=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1); W=${size%x*}; H=${size#*x}
log "pantalla $W x $H"
# Toca el primer elemento con ese texto (accesibilidad del WebView incluida)
tap_text(){
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml > "$OUT/ui-$2.xml"
  b=$(grep -oE "(text|content-desc)=\"$1\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" "$OUT/ui-$2.xml" | head -1 | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]')
  if [ -z "$b" ]; then log "NO encontrado: $1"; return 1; fi
  n=$(echo "$b" | grep -oE '[0-9]+' | tr '\n' ' '); set -- $n
  adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 )); log "toque: $b"
}
gfx(){ adb shell dumpsys gfxinfo $P | sed -n '/Total frames rendered/,/Number Frame deadline missed/p' > "$OUT/gfx-$1.txt"; cat "$OUT/gfx-$1.txt" | tee -a "$OUT/pasos.txt"; }

adb install -r app.apk 2>&1 | tee -a "$OUT/pasos.txt"
adb shell pm grant $P android.permission.POST_NOTIFICATIONS 2>/dev/null
adb logcat -c
log "abrir app"; adb shell am start -W -n $P/.MainActivity | tee -a "$OUT/pasos.txt"
sleep 30; shot 01-inicio
tap_text "Continuar" bienvenida || tap_text "Empezar" bienvenida || adb shell input keyevent BACK
sleep 4; shot 02-inicio-sin-modal

log "scroll inicio"; adb shell dumpsys gfxinfo $P reset >/dev/null
for i in 1 2 3 4 5 6; do adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/4)) 250; sleep 1; done
for i in 1 2 3; do adb shell input swipe $((W/2)) $((H/4)) $((W/2)) $((H*3/4)) 250; sleep 1; done
gfx scroll-inicio; shot 03-scroll

log "abrir Anime"; tap_text "Anime" tab || true; sleep 8; shot 04-anime
adb shell dumpsys gfxinfo $P reset >/dev/null
for i in 1 2 3 4; do adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/4)) 250; sleep 1; done
gfx scroll-anime

log "abrir capítulo (enlace directo)"
adb shell am start -W -a android.intent.action.VIEW -d "https://www.animetrix.lat/ver?t=anime\&id=283428\&se=1\&ep=1" $P | tee -a "$OUT/pasos.txt"
sleep 25; shot 05-ver-cine
adb shell dumpsys window | grep -E "mCurrentRotation|mRotation=" | head -3 | tee -a "$OUT/pasos.txt"
size2=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1)
log "tocar play"; adb shell input tap $((H/2)) $((W/2)); sleep 15; shot 06-reproduciendo
adb shell dumpsys gfxinfo $P reset >/dev/null; sleep 20; gfx reproduccion; shot 07-reproduciendo-20s
log "tocar menú ☰ y Ajuste"; tap_text "Mostrar opciones" cine1 || true; sleep 1; shot 08-barra
tap_text "Ampliar o ajustar el video" cine2 || true; sleep 3; shot 09-ajuste
log "atrás (sale del modo cine)"; adb shell input keyevent BACK; sleep 5; shot 10-vertical
adb shell dumpsys window | grep -E "mCurrentRotation|mRotation=" | head -3 | tee -a "$OUT/pasos.txt"
log "atrás (vuelve)"; adb shell input keyevent BACK; sleep 6; shot 11-atras

adb shell dumpsys meminfo $P | head -40 > "$OUT/memoria.txt"
adb logcat -d > "$OUT/logcat-completo.txt"
grep -E "FATAL|AndroidRuntime|ANR in|CONSOLE|Uncaught|TypeError|ReferenceError|lat.animetrix|Ads|StrictMode|E chromium|W chromium|Choreographer.*Skipped" "$OUT/logcat-completo.txt" | grep -v "^--------- " > "$OUT/logcat-importante.txt"
log "fin"
