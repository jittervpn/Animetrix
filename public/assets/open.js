// Intenta abrir la app automáticamente; si el navegador lo bloquea, queda el botón.
(function () {
  var box = document.querySelector('[data-intent]');
  if (!box) return;
  var url = box.getAttribute('data-intent');
  if (url && url.indexOf('intent://') === 0) setTimeout(function () { window.location.href = url; }, 150);
})();
