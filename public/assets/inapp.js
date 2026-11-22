// Marca la página como "dentro de la app" antes de pintarse (evita parpadeos de elementos web).
if (/AnimetrixApp\//.test(navigator.userAgent)) document.documentElement.classList.add('in-app');
if (/AnimetrixCine\//.test(navigator.userAgent)) document.documentElement.classList.add('has-cine');
