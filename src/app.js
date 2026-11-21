/* Animetrix — frontend. Todo el texto se inserta con textContent (sin innerHTML con datos). */
(() => {
  'use strict';

  const TYPES = { movie: 'Películas', serie: 'Series', anime: 'Anime' };
  const SINGULAR = { movie: 'Película', serie: 'Serie', anime: 'Anime' };
  const SLUG = { peliculas: 'movie', series: 'serie', anime: 'anime' };
  const SLUG_OF = { movie: 'peliculas', serie: 'series', anime: 'anime' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- DOM seguro ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  const svg = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p);
    return s;
  };
  const ICON = {
    play: 'M7 4.5v15l13-7.5z', plus: 'M12 5v14M5 12h14', check: 'm5 12 5 5 9-10',
    close: 'M6 6l12 12M18 6 6 18', left: 'M15 5l-7 7 7 7', right: 'm9 5 7 7-7 7',
  };
  const safeImg = (u) => (typeof u === 'string' && /^https:\/\/image\.tmdb\.org\//.test(u) ? u : null);
  const sized = (u, w) => u && u.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/' + w + '/');
  const big = (u) => sized(u, window.innerWidth > 900 ? 'w1280' : 'w780');

  /* ---------- almacenamiento local (por navegador) ---------- */
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem('ax_' + k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ax_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  const slim = (it) => ({ type: it.type, tmdb: it.tmdb, title: String(it.title || '').slice(0, 140), year: it.year || null, poster: safeImg(it.poster) });
  const keyOf = (it) => it.type + ':' + it.tmdb;
  const favs = {
    all: () => store.get('list', []).filter((x) => x && TYPES[x.type] && Number.isInteger(x.tmdb)),
    has: (it) => favs.all().some((x) => keyOf(x) === keyOf(it)),
    toggle(it) {
      const l = favs.all(); const i = l.findIndex((x) => keyOf(x) === keyOf(it));
      if (i >= 0) l.splice(i, 1); else l.unshift(slim(it));
      store.set('list', l.slice(0, 300)); return i < 0;
    },
  };
  const seen = {
    all: () => store.get('history', []).filter((x) => x && TYPES[x.type] && Number.isInteger(x.tmdb)),
    get: (it) => seen.all().find((x) => keyOf(x) === keyOf(it)),
    push(it, se, ep) {
      const l = seen.all().filter((x) => keyOf(x) !== keyOf(it));
      l.unshift({ ...slim(it), se: se ?? null, ep: ep ?? null, at: Date.now() });
      store.set('history', l.slice(0, 40));
    },
  };

  /* ---------- API (vía /api.php, nunca directo a InkaCat) ---------- */
  const memo = new Map();
  async function api(action, params) {
    const qs = new URLSearchParams({ a: action, ...params }).toString();
    if (memo.has(qs)) return memo.get(qs);
    const p = fetch('/api/data?' + qs, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
        return j;
      });
    memo.set(qs, p);
    p.catch(() => memo.delete(qs));
    return p;
  }

  const watchUrl = (it, se, ep) => {
    const q = new URLSearchParams({ t: it.type, id: it.tmdb });
    if (it.type !== 'movie') { q.set('se', se ?? 1); q.set('ep', ep ?? 1); }
    return '/ver?' + q;
  };

  /* ---------- utilidades de datos ---------- */
  const fmtRate = (r) => Number(r).toFixed(1);
  const rateClass = (r) => (r >= 7.5 ? 'hi' : r >= 6 ? 'mid' : 'lo');
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fmtRuntime = (m) => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min').trim();


  /* ---------- componentes ---------- */
  function poster(it, cls = 'poster') {
    const src = safeImg(it.poster);
    if (src) {
      return h('img', { class: cls, src: sized(src, 'w342'), srcset: sized(src, 'w185') + ' 185w, ' + sized(src, 'w342') + ' 342w',
        sizes: cls === 'poster' ? '(max-width: 640px) 40vw, 210px' : '170px', alt: '', loading: 'lazy', decoding: 'async', width: 342, height: 513 });
    }
    const initials = String(it.title || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return h('div', { class: cls + ' poster-ph', 'data-hue': String((it.tmdb * 47) % 360) }, h('span', {}, initials));
  }
  function card(it, extra) {
    const a = h('a', { class: 'card', href: '#/titulo/' + it.type + '/' + it.tmdb, 'aria-label': it.title },
      h('div', { class: 'card-img' }, poster(it), h('span', { class: 'card-play' }, svg(ICON.play)),
        extra ? h('span', { class: 'card-badge' }, extra) : null,
        it.rating ? h('span', { class: 'card-rate ' + rateClass(it.rating), 'aria-label': 'Rating ' + it.rating }, '★ ' + fmtRate(it.rating)) : null),
      h('div', { class: 'card-meta' },
        h('strong', {}, it.title),
        h('span', {}, [SINGULAR[it.type], it.year].filter(Boolean).join(' · '))));
    const ph = a.querySelector('.poster-ph');
    if (ph) ph.style.setProperty('--h', ph.dataset.hue);
    return a;
  }
  function row(title, items, more, extra) {
    if (!items.length) return null;
    const track = h('div', { class: 'row-track' }, items.map((it) => card(it, extra && extra(it))));
    const scroll = (d) => track.scrollBy({ left: d * track.clientWidth * 0.85, behavior: 'smooth' });
    return h('section', { class: 'row' },
      h('header', { class: 'row-head' }, h('h2', {}, title),
        more ? h('a', { class: 'row-more', href: more }, 'Ver todo ', svg(ICON.right)) : null),
      h('div', { class: 'row-body' },
        h('button', { class: 'row-arrow l', type: 'button', 'aria-label': 'Anterior', onclick: () => scroll(-1) }, svg(ICON.left)),
        track,
        h('button', { class: 'row-arrow r', type: 'button', 'aria-label': 'Siguiente', onclick: () => scroll(1) }, svg(ICON.right))));
  }
  const skeletonRow = () => h('section', { class: 'row' }, h('header', { class: 'row-head' }, h('h2', { class: 'sk sk-t' }, ' ')),
    h('div', { class: 'row-track' }, Array.from({ length: 7 }, () => h('div', { class: 'card sk-card' }, h('div', { class: 'card-img sk' })))));
  const errorBox = (msg, retry) => h('div', { class: 'empty' }, h('h2', {}, 'Algo salió mal'), h('p', {}, msg),
    retry ? h('button', { class: 'btn primary', type: 'button', onclick: retry }, 'Reintentar') : null);

  /* ---------- vistas ---------- */
  const app = () => $('#app');
  let view = null;

  async function viewHome() {
    const root = app();
    if (!$('.sk-hero', root)) root.replaceChildren(h('div', { class: 'hero sk-hero' }), skeletonRow(), skeletonRow());
    else root.append(skeletonRow(), skeletonRow());
    let d;
    try { d = await api('home', {}); } catch (e) { if (view === 'home') root.replaceChildren(errorBox('No pudimos cargar el catálogo. Revisa tu conexión.', () => route())); return; }
    if (view !== 'home') return;
    const lists = d.lists || {};
    const all = [...(lists.movie || []), ...(lists.anime || []), ...(lists.serie || [])];
    if (!all.length) { root.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'Catálogo vacío'), h('p', {}, 'Todavía no hay títulos disponibles.'))); return; }
    const feat = d.featured || all[0];
    root.replaceChildren(...[
      hero(feat), h('div', { class: 'greet', id: 'greet' }),
      row('Seguir viendo', seen.all(), null, (it) => (it.type !== 'movie' && it.ep ? 'T' + it.se + ' · E' + it.ep : null)),
      row('Películas', lists.movie || [], '#/peliculas'),
      row('Series', lists.serie || [], '#/series'),
      row('Anime', lists.anime || [], '#/anime'),
      row('Mejor valorados', [...all].filter((x) => x.rating >= 7).sort((a, b) => b.rating - a.rating).slice(0, 20)),
      row('Mi lista', favs.all(), '#/mi-lista'),
    ].filter(Boolean));
    paintGreeting();
    // Precarga en segundo plano el catálogo completo para que Películas/Anime abran al instante.
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => Object.keys(TYPES).forEach((t) => api('all', { type: t }).catch(() => {})));
  }

  function metaChips(d) {
    return [
      d.rating ? h('span', { class: 'rate-pill ' + rateClass(d.rating) }, '★ ' + fmtRate(d.rating), d.votes ? h('small', {}, ' (' + d.votes.toLocaleString('es') + ')') : null) : null,
      d.runtime ? h('span', {}, fmtRuntime(d.runtime)) : null,
      ...(d.genres || []).slice(0, 3).map((g) => h('span', {}, g)),
    ].filter(Boolean);
  }

  function hero(it) {
    const src = safeImg(it.backdrop) || safeImg(it.poster);
    const bg = h('div', { class: 'hero-bg' }, src ? h('img', { src: big(src), alt: '', fetchpriority: 'high', decoding: 'async' }) : null);
    const resume = seen.get(it);
    return h('section', { class: 'hero' }, bg, h('div', { class: 'hero-shade' }),
      h('div', { class: 'hero-content' },
        h('p', { class: 'eyebrow' }, 'Destacado · ' + SINGULAR[it.type] + (it.year ? ' · ' + it.year : '')),
        h('h1', {}, it.title),
        h('div', { class: 'hero-meta meta' }, ...metaChips(it)),
        h('p', { class: 'hero-overview' }, it.overview || ''),
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary lg', href: watchUrl(it, resume?.se, resume?.ep) }, svg(ICON.play), resume ? 'Continuar' : 'Ver ahora'),
          h('a', { class: 'btn glass lg', href: '#/titulo/' + it.type + '/' + it.tmdb }, 'Más info'))));
  }

  const filters = { movie: {}, serie: {}, anime: {} };
  async function viewGrid(type) {
    const root = app();
    const f = filters[type];
    const tabs = h('div', { class: 'chips', role: 'tablist' }, Object.entries(TYPES).map(([t, n]) =>
      h('a', { class: 'chip', href: '#/' + SLUG_OF[t], role: 'tab', 'aria-selected': String(t === type) }, n)));
    const count = h('p', { class: 'page-count' }, ' ');
    const grid = h('div', { class: 'grid' }, Array.from({ length: 12 }, () => h('div', { class: 'card sk-card' }, h('div', { class: 'card-img sk' }))));
    const bar = h('form', { class: 'filters', role: 'search', onsubmit: (e) => e.preventDefault() });
    const more = h('button', { class: 'btn ghost more', type: 'button', hidden: true }, 'Cargar más');
    root.replaceChildren(h('section', { class: 'page' }, h('h1', { class: 'page-title' }, TYPES[type]), count, tabs, bar, grid, more));

    let data;
    try { data = await api('all', { type }); } catch (e) { grid.replaceChildren(errorBox(e.message, () => viewGrid(type))); return; }
    if (view !== 'grid:' + type) return;
    const items = data.items || [];
    if (!items.length) { count.textContent = ''; bar.remove(); grid.replaceWith(h('div', { class: 'empty' }, h('p', {}, 'Aún no hay ' + TYPES[type].toLowerCase() + ' en el catálogo.'))); return; }

    const years = [...new Set(items.map((x) => x.year).filter(Boolean))].sort((a, b) => b - a);
    const genres = [...new Set(items.flatMap((x) => x.genres || []))].sort((a, b) => a.localeCompare(b, 'es'));
    const sel = (name, label, opts, val) => h('label', { class: 'fld' }, h('span', {}, label),
      h('select', { name }, opts.map(([v, t]) => h('option', { value: v, selected: String(val ?? '') === String(v) }, t))));
    bar.append(...[
      h('label', { class: 'fld grow' }, h('span', {}, 'Buscar'), h('input', { name: 'q', type: 'search', placeholder: 'Título…', maxlength: 60, value: f.q || '' })),
      sel('y', 'Año', [['', 'Todos'], ...years.map((y) => [y, y])], f.y),
      genres.length ? sel('g', 'Género', [['', 'Todos'], ...genres.map((g) => [g, g])], f.g) : null,
      data.tmdb ? sel('r', 'Rating', [['', 'Cualquiera'], ['8', '8+ ★'], ['7', '7+ ★'], ['6', '6+ ★'], ['5', '5+ ★']], f.r) : null,
      sel('o', 'Ordenar', [['new', 'Más recientes'], ...(data.tmdb ? [['top', 'Mejor valoradas']] : []), ['az', 'A – Z'], ['old', 'Más antiguas']], f.o || 'new'),
      h('button', { class: 'btn ghost reset', type: 'reset' }, 'Limpiar'),
    ].filter(Boolean));

    const toggle = h('button', { class: 'btn ghost filters-toggle', type: 'button', 'aria-expanded': 'false' });
    toggle.addEventListener('click', () => { const open = !bar.classList.contains('open'); bar.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); });
    bar.querySelector('.fld.grow').after(toggle);
    const paintToggle = () => {
      const n = ['y', 'g', 'r'].filter((k) => f[k]).length + (f.o && f.o !== 'new' ? 1 : 0);
      toggle.replaceChildren(svg('M4 6h16M7 12h10M10 18h4'), n ? 'Filtros (' + n + ')' : 'Filtros');
    };
    let shown = 0; let list = [];
    const PAGE = 30;
    const paint = (reset) => {
      if (reset) { grid.replaceChildren(); shown = 0; }
      const next = list.slice(shown, shown + PAGE);
      grid.append(...next.map((it) => card(it)));
      shown += next.length;
      more.hidden = shown >= list.length;
    };
    const apply = () => {
      const fd = new FormData(bar);
      Object.assign(f, { q: String(fd.get('q') || '').trim(), y: fd.get('y') || '', g: fd.get('g') || '', r: fd.get('r') || '', o: fd.get('o') || 'new' });
      paintToggle();
      const q = fold(f.q);
      list = items.filter((it) => (!q || fold(it.title).includes(q))
        && (!f.y || String(it.year) === String(f.y))
        && (!f.g || (it.genres || []).includes(f.g))
        && (!f.r || (it.rating || 0) >= Number(f.r)));
      const by = {
        new: (a, b) => (b.year || 0) - (a.year || 0),
        old: (a, b) => (a.year || 9999) - (b.year || 9999),
        az: (a, b) => a.title.localeCompare(b.title, 'es'),
        top: (a, b) => (b.rating || 0) - (a.rating || 0),
      }[f.o] || (() => 0);
      list = [...list].sort(by);
      count.replaceChildren(h('strong', {}, String(list.length)), list.length === items.length
        ? ' ' + (list.length === 1 ? 'título' : 'títulos') + ' disponibles'
        : ' de ' + items.length + ' títulos');
      if (!list.length) { grid.replaceChildren(h('div', { class: 'empty inline' }, h('p', {}, 'Nada coincide con esos filtros.'))); more.hidden = true; return; }
      paint(true);
    };
    let t;
    bar.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(apply, e.target.name === 'q' ? 250 : 0); });
    bar.addEventListener('change', apply);
    bar.addEventListener('reset', () => setTimeout(() => { for (const k of Object.keys(f)) delete f[k]; apply(); }, 0));
    more.addEventListener('click', () => paint(false));
    apply();
  }

  async function viewSearch(q) {
    const root = app();
    const title = () => h('h1', { class: 'page-title' }, 'Resultados para “', q, '”');
    root.replaceChildren(h('section', { class: 'page' }, title(), h('div', { class: 'grid' },
      Array.from({ length: 8 }, () => h('div', { class: 'card sk-card' }, h('div', { class: 'card-img sk' }))))));
    const res = await Promise.allSettled(Object.keys(TYPES).map((t) => api('all', { type: t })));
    if (view !== 'search:' + q) return;
    const fq = fold(q);
    const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value.items || [] : []))
      .filter((it) => fold(it.title).includes(fq) || (it.genres || []).some((g) => fold(g) === fq) || String(it.year) === q.trim());
    const sec = h('section', { class: 'page' }, title(),
      h('p', { class: 'page-count' }, h('strong', {}, String(items.length)), items.length === 1 ? ' resultado' : ' resultados'));
    sec.append(items.length ? h('div', { class: 'grid' }, items.map((it) => card(it)))
      : h('div', { class: 'empty' }, h('p', {}, 'No encontramos nada con ese nombre. Prueba con otra palabra, un año o un género.'), requestCard(q)));
    root.replaceChildren(sec);
  }

  function viewList() {
    const l = favs.all();
    const hist = seen.all();
    app().replaceChildren(h('section', { class: 'page' }, h('h1', { class: 'page-title' }, 'Mi lista'),
      l.length ? h('div', { class: 'grid' }, l.map((it) => card(it)))
        : h('div', { class: 'empty' }, h('p', {}, 'Guarda títulos con el botón “Mi lista” y aparecerán aquí.')),
      hist.length ? h('h2', { class: 'sub-title' }, 'Vistos recientemente') : null,
      hist.length ? h('div', { class: 'grid' }, hist.map((it) => card(it, it.type !== 'movie' && it.ep ? 'T' + it.se + ' · E' + it.ep : null))) : null,
      hist.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { store.set('history', []); viewList(); } }, 'Borrar historial') : null));
  }

  /* ---------- menú lateral ---------- */
  function initDrawer() {
    const d = $('#drawer'); const btn = $('#menuBtn'); if (!d || !btn) return;
    const panel = $('.drawer-panel', d);
    const close = () => {
      if (d.hidden) return;
      d.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      setTimeout(() => { d.hidden = true; }, 220);
    };
    const open = () => {
      d.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.body.classList.add('no-scroll');
      requestAnimationFrame(() => { d.classList.add('open'); panel.focus(); });
    };
    btn.addEventListener('click', () => (d.hidden ? open() : close()));
    const ver = /AnimetrixApp\/([\d.]+)/.exec(navigator.userAgent);
    if (ver) $('#appVer').textContent = 'App v' + ver[1];
    // En la web, "Compartir" usa el menú del navegador (en la app lo resuelve Android).
    $('[data-act="share-app"]', d)?.addEventListener('click', async (e) => {
      if (IN_APP) return;
      e.preventDefault();
      const data = { title: 'Animetrix', text: 'Películas, series y anime en Animetrix 🍿', url: 'https://www.animetrix.lat/' };
      try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); toast('Enlace copiado ✅'); } } catch { /* cancelado */ }
    });
    d.addEventListener('click', (e) => { if (e.target.closest('[data-dclose], a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('hashchange', close);
  }

  /* ---------- formulario de /contacto ---------- */
  function initContact() {
    const box = $('#contactForm'); if (!box) return;
    const sel = h('select', { name: 'reason', required: true, 'aria-label': 'Motivo' },
      h('option', { value: '' }, 'Elige un motivo…'),
      [['consulta', 'Consulta'], ['problema', 'Problema técnico'], ['privacidad', 'Privacidad o datos'], ['derechos', 'Derechos de autor'], ['otro', 'Otro']].map(([v, t]) => h('option', { value: v }, t)));
    if (location.hash === '#derechos') sel.value = 'derechos';
    const name = h('input', { name: 'name', maxlength: 40, placeholder: 'Nombre o empresa (opcional)', autocomplete: 'name' });
    const email = h('input', { name: 'email', type: 'email', maxlength: 100, placeholder: 'Tu correo', autocomplete: 'email' });
    const tg = h('input', { name: 'tg', maxlength: 40, placeholder: '@usuario de Telegram', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    tg.value = store.get('tg_user', '') || '';
    const msg = h('textarea', { name: 'message', maxlength: 1500, rows: 6, required: true, placeholder: 'Escribe tu mensaje (si es un aviso de derechos de autor, incluye el enlace exacto)' });
    const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
    const err = h('p', { class: 'req-msg', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Enviar mensaje');
    const f = h('form', { class: 'contact-form', novalidate: true },
      h('label', {}, 'Motivo', sel), h('label', {}, 'Nombre', name),
      h('div', { class: 'contact-row' }, h('label', {}, 'Correo', email), h('label', {}, 'Telegram', tg)),
      h('p', { class: 'muted small' }, 'Deja al menos uno de los dos para poder responderte.'),
      h('label', {}, 'Mensaje', msg), trap, err, btn);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const r = await fetch('/api/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'contacto', reason: sel.value, name: name.value, email: email.value, tg: tg.value, message: msg.value, website: trap.value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se pudo enviar');
        if (tg.value.trim()) store.set('tg_user', tg.value.trim());
        box.replaceChildren(h('div', { class: 'contact-ok' }, h('h2', {}, '¡Mensaje enviado! ✅'), h('p', {}, 'Gracias por escribirnos. Te responderemos por el medio que nos dejaste.')));
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Enviar mensaje'; }
    });
    box.replaceChildren(f);
  }

  /* ---------- ficha (modal) ---------- */
  let lastFocus = null;
  async function openTitle(type, tmdb) {
    const modal = $('#modal'); if (!modal) return;
    const cardEl = $('.modal-card', modal);
    lastFocus = document.activeElement;
    cardEl.replaceChildren(h('div', { class: 'modal-loading' }, h('span', { class: 'spinner' })));
    modal.hidden = false; document.body.classList.add('no-scroll'); cardEl.focus();
    let d;
    try { d = await api('title', { type, tmdb }); } catch (e) {
      cardEl.replaceChildren(closeBtn(), errorBox(e.message, () => openTitle(type, tmdb))); return;
    }
    if (modal.hidden) return;
    const resume = seen.get(d);
    if (d.seasons?.length) d.episodes = d.seasons.reduce((n, x) => n + x.episodes.length, 0);
    const fav = h('button', { class: 'btn glass', type: 'button', 'aria-pressed': String(favs.has(d)) });
    const paintFav = () => { const on = favs.has(d); fav.setAttribute('aria-pressed', String(on)); fav.replaceChildren(svg(on ? ICON.check : ICON.plus), on ? 'En mi lista' : 'Mi lista'); };
    fav.addEventListener('click', () => { favs.toggle(d); paintFav(); }); paintFav();

    const firstEp = d.seasons?.[0]?.episodes?.[0];
    const playHref = d.type === 'movie' ? watchUrl(d)
      : resume?.ep ? watchUrl(d, resume.se, resume.ep) : watchUrl(d, d.seasons?.[0]?.n ?? 1, firstEp?.n ?? 1);
    const playLabel = d.type === 'movie' ? 'Ver película' : resume?.ep ? 'Continuar T' + resume.se + ' · E' + resume.ep : 'Ver episodio 1';

    const cover = h('div', { class: 'm-cover' });
    const bimg = safeImg(d.backdrop) || safeImg(d.poster); if (bimg) cover.style.backgroundImage = 'url("' + big(bimg) + '")';

    cardEl.replaceChildren(...[closeBtn(), cover,
      h('div', { class: 'm-body' },
        h('div', { class: 'm-poster' }, poster(d)),
        h('div', { class: 'm-info' },
          h('p', { class: 'eyebrow' }, [SINGULAR[d.type], d.year, d.type !== 'movie' && d.episodes ? d.episodes + ' episodios' : null].filter(Boolean).join(' · ')),
          h('h2', { id: 'mTitle' }, d.title),
          d.tagline ? h('p', { class: 'tagline' }, d.tagline) : null,
          h('div', { class: 'meta' }, ...metaChips({ ...d, genres: [] })),
          d.genres?.length ? h('div', { class: 'tags' }, d.genres.map((g) => h('a', { href: '#/buscar/' + encodeURIComponent(g) }, g))) : null,
          d.overview ? h('p', { class: 'overview' }, d.overview) : null,
          h('div', { class: 'actions' }, h('a', { class: 'btn primary lg', href: playHref }, svg(ICON.play), playLabel), fav, shareBtn(d)))),
      d.type !== 'movie' ? seasonsBlock(d, resume) : null].filter(Boolean));
    const ph = cardEl.querySelector('.poster-ph'); if (ph) ph.style.setProperty('--h', ph.dataset.hue);
    document.title = d.title + ' · Animetrix';
  }

  function seasonsBlock(d, resume) {
    if (!d.seasons?.length) {
      return h('form', { class: 'ep-picker', method: 'get', action: '/ver' },
        h('input', { type: 'hidden', name: 't', value: d.type }), h('input', { type: 'hidden', name: 'id', value: d.tmdb }),
        h('label', {}, 'Temporada ', h('input', { type: 'number', name: 'se', min: 0, max: 500, value: resume?.se || 1 })),
        h('label', {}, 'Episodio ', h('input', { type: 'number', name: 'ep', min: 0, max: 100000, value: resume?.ep || 1 })),
        h('button', { class: 'btn primary' }, 'Ver'));
    }
    const active = resume?.se ?? d.seasons[0].n;
    const lists = d.seasons.map((s) => h('ol', { class: 'ep-list', 'data-season-list': s.n, hidden: s.n !== active },
      s.episodes.map((e) => h('li', {}, h('a', { href: watchUrl(d, s.n, e.n), 'aria-current': resume && resume.se === s.n && resume.ep === e.n ? 'true' : null },
        h('span', { class: 'ep-n' }, e.n), h('span', { class: 'ep-t' }, e.title || 'Episodio ' + e.n))))));
    const tabs = h('div', { class: 'season-tabs', role: 'tablist' }, d.seasons.map((s) =>
      h('button', { type: 'button', role: 'tab', 'data-season': s.n, 'aria-selected': String(s.n === active) }, 'Temporada ' + s.n)));
    const wrap = h('div', { class: 'episodes' }, tabs, lists);
    bindSeasonTabs(wrap);
    return wrap;
  }
  function bindSeasonTabs(wrap) {
    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-season]'); if (!b) return;
      $$('[data-season]', wrap).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-season-list]', wrap).forEach((l) => { l.hidden = l.dataset.seasonList !== b.dataset.season; });
    });
  }
  const closeBtn = () => h('button', { class: 'm-close', type: 'button', 'aria-label': 'Cerrar', 'data-close': true }, svg(ICON.close));
  function closeModal() {
    const modal = $('#modal'); if (!modal || modal.hidden) return;
    modal.hidden = true; document.body.classList.remove('no-scroll');
    $('.modal-card', modal).replaceChildren();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- router ---------- */
  let baseRoute = null;
  async function route() {
    let hash;
    try { hash = decodeURIComponent(location.hash.replace(/^#/, '')) || '/'; } catch { hash = '/'; }
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'titulo' && TYPES[parts[1]] && /^\d{1,9}$/.test(parts[2] || '')) {
      if (!baseRoute) { baseRoute = '/'; await render('/'); }
      openTitle(parts[1], parts[2]);
      return;
    }
    closeModal();
    if (baseRoute === hash && app().childElementCount && !$('.boot')) { document.title = 'Animetrix'; return; }
    baseRoute = hash;
    await render(hash);
  }
  async function render(hash) {
    const parts = hash.split('/').filter(Boolean);
    document.title = 'Animetrix — Películas, series y anime online';
    let nav = 'home';
    window.scrollTo({ top: 0 });
    try {
      if (!parts.length) { view = 'home'; await viewHome(); }
      else if (SLUG[parts[0]]) { nav = SLUG[parts[0]]; view = 'grid:' + nav; await viewGrid(nav); }
      else if (parts[0] === 'buscar' && parts[1]) { nav = ''; const q = parts.slice(1).join('/').slice(0, 60); view = 'search:' + q; $('#q').value = q; await viewSearch(q); }
      else if (parts[0] === 'mi-lista') { nav = 'list'; view = 'list'; viewList(); }
      else if (parts[0] === 'seguir') {
        const lw = store.get('last_watch', null);
        const last = seen.all()[0];
        if (lw && /^\/ver\?[\w=&%.-]+$/.test(lw.url || '')) { location.replace(lw.url); return; }
        if (last) { location.replace(watchUrl(last, last.se, last.ep)); return; }
        view = 'home'; await viewHome(); toast('Todavía no empezaste nada. ¡Elige algo para ver!');
      }
      else if (parts[0] === 'buscar' && !parts[1]) { nav = ''; view = 'home'; await viewHome(); setTimeout(() => $('#q')?.focus(), 200); }
      else if (parts[0] === 'azar') {
        const d = await api('home');
        const all = Object.values(d.lists || {}).flat().filter((x) => x && TYPES[x.type] && x.tmdb);
        if (!all.length) { view = 'home'; await viewHome(); return; }
        const it = all[Math.floor(Math.random() * all.length)];
        baseRoute = '/'; history.replaceState(null, '', '#/');
        view = 'home'; await viewHome();
        location.hash = '#/titulo/' + it.type + '/' + it.tmdb;
        toast('🎲 Te sugerimos: ' + String(it.title || '').slice(0, 60));
        return;
      }
      else if (parts[0] === 'pedir') { nav = 'pedir'; view = 'home'; await viewHome(); openRequest(); }
      else { view = 'home'; await viewHome(); }
    } catch (e) { app().replaceChildren(errorBox(e.message, () => render(hash))); }
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  }

  /* ---------- página del reproductor ---------- */
  function initWatch() {
    const el = $('[data-watch]'); if (!el) return false;
    let w; try { w = JSON.parse(el.dataset.watch); } catch { return true; }
    if (!TYPES[w.type]) return true;
    seen.push(w, w.se, w.ep);
    // Recordar el video abierto: si un anuncio saca al usuario, se le ofrece volver con un toque.
    store.set('last_watch', { url: location.pathname + location.search, title: String(w.title || '').slice(0, 100), type: w.type, se: w.se, ep: w.ep, t: Date.now() });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    window.addEventListener('pageshow', () => window.scrollTo(0, 0));
    const b = $('#favBtn');
    if (b) {
      const paint = () => { const on = favs.has(w); b.setAttribute('aria-pressed', String(on)); $('span', b).textContent = on ? 'En mi lista' : 'Mi lista'; };
      b.addEventListener('click', () => { favs.toggle(w); paint(); }); paint();
    }
    const eps = $('.episodes'); if (eps) bindSeasonTabs(eps);
    $('#shareBtn')?.addEventListener('click', () => share(w));
    initPlayer();
    const cur = $('.ep-list a[aria-current]');
    const list = cur?.closest('.ep-list');
    if (cur && list && list.scrollHeight > list.clientHeight) list.scrollTop = cur.offsetTop - list.offsetTop - 8;
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === w.type));
    return true;
  }

  /* ---------- reproductor: bloqueo de anuncios y modo compatible ---------- */
  /* Escudo anti-redirección: si un anuncio del reproductor intenta sacar al usuario de la página,
     el navegador pregunta "¿Salir?" y con "Quedarme" el anuncio se cancela sin recargar el video.
     Los enlaces y botones propios del sitio, y el botón Atrás, salen sin preguntar. */
  function adShield() {
    if (!$('#player')) return;
    let leaving = false;
    const leave = () => { leaving = true; };
    document.addEventListener('click', (e) => { if (e.target.closest('a[href], button[type=submit], form button')) leave(); }, true);
    document.addEventListener('submit', leave, true);
    window.addEventListener('beforeunload', (e) => {
      if (leaving) return;
      e.preventDefault(); e.returnValue = '';
    });
    window.addEventListener('pageshow', () => { leaving = false; });
    // Botón Atrás del celular: se intercepta para salir sin la pregunta.
    try {
      history.pushState({ axGuard: 1 }, '', location.href);
      window.addEventListener('popstate', () => { leave(); history.back(); }, { once: true });
    } catch { /* sin history API */ }
  }

  const IN_APP = /AnimetrixApp\//.test(navigator.userAgent);
  if (IN_APP) document.documentElement.classList.add('in-app');

  function initPlayer() {
    if (!IN_APP) adShield();
    const frame = $('#player'); if (!frame) return;
    const btn = $('#compatBtn'); const txt = $('#shieldText'); const bar = $('#playerBar');
    const sandboxValue = frame.getAttribute('sandbox');
    if (!sandboxValue) return;
    const KEY = 'player_mode_v2'; // nueva clave: todos vuelven a empezar con la protección activada
    const reload = () => { const src = frame.src; frame.src = 'about:blank'; setTimeout(() => { frame.src = src; }, 30); };
    const paint = (compat) => {
      bar.classList.toggle('compat', compat);
      txt.textContent = compat ? 'Modo compatible: un anuncio podría sacarte de la página' : 'Protección activada: los anuncios no te sacarán del video';
      btn.textContent = compat ? 'Activar protección' : '¿No carga? Usar modo compatible';
    };
    const setCompat = (compat, doReload) => {
      if (compat) frame.removeAttribute('sandbox'); else frame.setAttribute('sandbox', sandboxValue);
      store.set(KEY, compat ? 'compat' : 'safe');
      paint(compat);
      if (doReload) reload();
    };
    if (store.get(KEY, 'safe') === 'compat') setCompat(true, true); else paint(false);
    btn?.addEventListener('click', () => setCompat(frame.hasAttribute('sandbox'), true));
  }

  /* ---------- bienvenida para cada usuario ---------- */
  const cleanName = (v) => String(v || '').normalize('NFC').replace(/[^\p{L}\p{N} '._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const userName = () => cleanName(store.get('user_name', ''));
  function greeting() {
    const hr = new Date().getHours();
    const part = hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buenos días' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
    const n = userName();
    const visits = Number(store.get('visits', 0)) || 0;
    return { title: n ? `${part}, ${n}` : part, sub: visits > 1 ? '¡Qué bueno verte de nuevo! ¿Qué vemos hoy?' : '¿Qué vemos hoy?' };
  }
  function welcome() {
    if (store.get('welcomed', false)) { store.set('visits', (Number(store.get('visits', 0)) || 0) + 1); return; }
    const input = h('input', { type: 'text', name: 'name', maxlength: 24, autocomplete: 'given-name', placeholder: 'Tu nombre (opcional)', 'aria-label': 'Tu nombre' });
    const feat = (icon, title, text) => h('li', {}, h('span', { class: 'wf-ic' }, svg(icon)), h('div', {}, h('strong', {}, title), h('span', {}, text)));
    const done = (e) => {
      e?.preventDefault();
      store.set('user_name', cleanName(input.value)); store.set('welcomed', true); store.set('visits', 1);
      ov.classList.add('out'); setTimeout(() => { ov.remove(); document.body.classList.remove('no-scroll'); paintGreeting(); }, 250);
    };
    const ov = h('div', { class: 'welcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wTitle' },
      h('form', { class: 'welcome-card', onsubmit: done },
        h('img', { src: '/assets/logo.svg', alt: '', width: 64, height: 64, class: 'welcome-logo' }),
        h('p', { class: 'eyebrow' }, 'Te damos la bienvenida'),
        h('h2', { id: 'wTitle' }, '¡Hola! Esto es Animetrix'),
        h('p', { class: 'welcome-sub' }, 'Películas, series y anime en un solo lugar. ¿Cómo te llamamos?'),
        input,
        h('ul', { class: 'welcome-feat' },
          feat('M6 3h12v18l-6-4-6 4z', 'Mi lista', 'Guarda lo que quieras ver después.'),
          feat('M7 4.5v15l13-7.5z', 'Seguir viendo', 'Retoma tus series en el episodio exacto.'),
          feat('M12 3l2.6 5.6L20 9.5l-4 4.1.9 5.9L12 16.8 7.1 19.5l.9-5.9-4-4.1 5.4-.9z', 'Lo mejor valorado', 'Rating, géneros y filtros para elegir rápido.'),
          feat('M21.5 4.3 2.9 11.4c-1 .4-1 1.8.1 2.1l4.6 1.5 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.8 3.5c.7.5 1.7.1 1.9-.7l3.2-15c.2-1-.8-1.8-1.7-1.4Z', 'Canal de Telegram', '@animetrixlat: estrenos al instante.')),
        h('button', { class: 'btn primary lg', type: 'submit' }, 'Empezar a ver'),
        h('p', { class: 'welcome-legal' }, 'Al continuar aceptas los ', h('a', { href: '/terminos' }, 'Términos'), ' y la ', h('a', { href: '/privacidad' }, 'Política de privacidad'), '.')));
    document.body.append(ov); document.body.classList.add('no-scroll');
    setTimeout(() => input.focus(), 300);
  }
  function paintGreeting() {
    const el = $('#greet'); if (!el) return;
    const g = greeting();
    el.replaceChildren(h('strong', {}, g.title + ' 👋'), h('span', {}, g.sub));
  }

  /* ---------- aviso breve (toast) ---------- */
  function toast(msg) {
    $('.toast')?.remove();
    const el = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(el);
    setTimeout(() => el.classList.add('out'), 2400);
    setTimeout(() => el.remove(), 2800);
  }

  /* ---------- compartir ---------- */
  async function share(it) {
    const link = 'https://www.animetrix.lat/abrir?t=' + it.type + '&id=' + it.tmdb;
    if (IN_APP) {   // la app intercepta /compartir y abre el menú nativo de Android
      location.href = '/compartir?' + new URLSearchParams({ t: it.type, id: it.tmdb, title: String(it.title || '').slice(0, 100) });
      return;
    }
    const text = 'Mira ' + it.title + ' en Animetrix 🎬';
    try {
      if (navigator.share) { await navigator.share({ title: it.title, text, url: link }); return; }
      await navigator.clipboard.writeText(text + ' ' + link);
      toast('Enlace copiado. ¡Pégalo donde quieras!');
    } catch { /* el usuario canceló */ }
  }
  const shareBtn = (it) => h('button', { class: 'btn glass', type: 'button', 'aria-label': 'Compartir', onclick: () => share(it) },
    svg('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13'), 'Compartir');

  /* ---------- pedidos ---------- */
  function openRequest(prefill = '') {
    if ($('.req')) return;
    const f = h('form', { class: 'welcome-card req-card', novalidate: true });
    const title = h('input', { name: 'title', maxlength: 80, required: true, placeholder: 'Ej: Jujutsu Kaisen', value: prefill, autocomplete: 'off' });
    const type = h('div', { class: 'req-types', role: 'radiogroup' }, [['movie', '🎬 Película'], ['serie', '📺 Serie'], ['anime', '⭐ Anime']].map(([v, t], i) =>
      h('label', {}, h('input', { type: 'radio', name: 'type', value: v, checked: i === 2 }), h('span', {}, t))));
    const year = h('input', { name: 'year', inputmode: 'numeric', maxlength: 4, placeholder: 'Año (opcional)' });
    const note = h('textarea', { name: 'note', maxlength: 200, rows: 2, placeholder: 'Comentario (opcional): temporada, idioma…' });
    const tg = h('input', { name: 'tg', maxlength: 40, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Tu @ de Telegram (opcional)', value: store.get('tg_user', '') || '' });
    const trap = h('input', { name: 'website', tabindex: -1, autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
    const msg = h('p', { class: 'req-msg', role: 'alert' });
    const send = h('button', { class: 'btn primary lg', type: 'submit' }, 'Enviar pedido');
    const close = () => { ov.remove(); document.body.classList.remove('no-scroll'); if (location.hash === '#/pedir') history.replaceState(null, '', '#/'); };
    f.append(
      h('button', { class: 'm-close', type: 'button', 'aria-label': 'Cerrar', onclick: close }, svg(ICON.close)),
      h('p', { class: 'eyebrow' }, 'Pedidos'),
      h('h2', {}, '¿Qué quieres ver?'),
      h('p', { class: 'welcome-sub' }, 'Cuéntanos qué película, serie o anime te gustaría encontrar en Animetrix.'),
      title, type, year, note, tg,
      h('p', { class: 'req-help' }, 'Con tu @ te avisamos por Telegram cuando lo agreguemos.'),
      trap, msg, send);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const tgv = String(fd.get('tg') || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
      const body = { title: String(fd.get('title') || '').trim(), type: fd.get('type'), year: String(fd.get('year') || '').trim(), note: String(fd.get('note') || '').trim(), name: userName(), tg: tgv, website: fd.get('website') || '' };
      if (tgv && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(tgv)) { msg.textContent = 'Revisa tu usuario de Telegram (ej: @animetrixlat).'; tg.focus(); return; }
      if (body.title.length < 2) { msg.textContent = 'Escribe el nombre del título.'; title.focus(); return; }
      if (body.year && !/^\d{4}$/.test(body.year)) { msg.textContent = 'El año debe tener 4 números.'; year.focus(); return; }
      send.disabled = true; send.textContent = 'Enviando…'; msg.textContent = '';
      try {
        const r = await fetch('/api/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'No se pudo enviar');
        store.set('tg_user', tgv ? '@' + tgv : '');
        f.replaceChildren(h('div', { class: 'req-ok' }, h('span', {}, '✅'), h('h2', {}, '¡Pedido enviado!'),
          h('p', { class: 'welcome-sub' }, 'Gracias. Si lo agregamos, te llegará una notificación y lo publicaremos en el canal.'),
          h('button', { class: 'btn primary lg', type: 'button', onclick: close }, 'Listo')));
      } catch (err) {
        msg.textContent = err.message; send.disabled = false; send.textContent = 'Enviar pedido';
      }
    });
    const ov = h('div', { class: 'welcome req', role: 'dialog', 'aria-modal': 'true' }, f);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.body.append(ov); document.body.classList.add('no-scroll');
    setTimeout(() => title.focus(), 250);
  }
  const requestCard = (q = '') => h('button', { class: 'req-cta', type: 'button', onclick: () => openRequest(q) },
    h('span', { class: 'req-ic' }, '📥'),
    h('span', { class: 'tg-tx' }, h('strong', {}, q ? 'Pedir “' + q + '”' : '¿No encuentras lo que buscas?'), h('span', {}, 'Pídelo y lo buscamos para agregarlo')),
    h('span', { class: 'btn ghost' }, 'Pedir'));

  /* ---------- invitación a la app (solo en la web) ---------- */
  function appBanner() {
    if (IN_APP || !/Android/i.test(navigator.userAgent)) return;
    const until = Number(store.get('app_banner_until', 0)) || 0;
    if (Date.now() < until) return;
    const close = h('button', { class: 'resume-x', type: 'button', 'aria-label': 'Cerrar' }, svg(ICON.close));
    const el = h('div', { class: 'app-banner', role: 'complementary' },
      h('img', { src: '/assets/logo.svg', alt: '', width: 40, height: 40 }),
      h('div', { class: 'app-banner-tx' }, h('strong', {}, 'Descarga la app de Animetrix'), h('span', {}, 'Sin anuncios y con avisos de estrenos')),
      h('a', { class: 'btn primary', href: '/app' }, 'Instalar'), close);
    close.addEventListener('click', () => { store.set('app_banner_until', Date.now() + 3 * 864e5); el.remove(); });
    document.body.append(el);
  }

  /* ---------- botón flotante "Volver al video" ---------- */
  function resumeBanner() {
    const lw = store.get('last_watch', null);
    if (!lw || typeof lw.url !== 'string' || !/^\/ver\?[\w=&%.-]+$/.test(lw.url) || Date.now() - lw.t > 45 * 60e3) return;
    const label = lw.title + (lw.type !== 'movie' && lw.ep ? ' · T' + lw.se + ' E' + lw.ep : '');
    const close = h('button', { class: 'resume-x', type: 'button', 'aria-label': 'Cerrar' }, svg(ICON.close));
    const el = h('div', { class: 'resume', role: 'status' },
      h('a', { class: 'resume-go', href: lw.url }, h('span', { class: 'resume-ic' }, svg(ICON.play)),
        h('span', { class: 'resume-tx' }, h('small', {}, 'Volver al video'), h('strong', {}, label))),
      close);
    close.addEventListener('click', () => { store.set('last_watch', null); el.remove(); });
    document.body.append(el);
  }

  /* ---------- arranque ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const top = $('#topbar');
    const onScroll = () => top && top.classList.toggle('solid', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    const form = $('#searchForm'); const input = $('#q');
    let t;
    const go = () => { const q = input.value.trim().replace(/[<>]/g, '').slice(0, 60); if (q.length >= 2) location.href = '/#/buscar/' + encodeURIComponent(q); };
    form?.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(t); go(); });
    input?.addEventListener('input', () => { clearTimeout(t); if ($('#modal')) t = setTimeout(go, 450); });

    initDrawer();
    if (initWatch()) return;
    if (document.body.classList.contains('legal-body')) { initContact(); resumeBanner(); return; }

    // Precarga la ficha cuando el usuario apunta o toca una tarjeta.
    const intent = (e) => {
      const a = e.target.closest && e.target.closest('a.card'); if (!a) return;
      const m = /#\/titulo\/(\w+)\/(\d+)/.exec(a.getAttribute('href') || ''); if (m) api('title', { type: m[1], tmdb: m[2] }).catch(() => {});
    };
    document.addEventListener('pointerover', intent, { passive: true });
    document.addEventListener('touchstart', intent, { passive: true });
    document.addEventListener('focusin', intent);

    const modal = $('#modal');
    modal?.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        location.hash = '#' + (baseRoute || '/');
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hidden) $('[data-close]', modal)?.click(); });
    window.addEventListener('hashchange', route);
    route();
    resumeBanner();
    welcome();
    appBanner();
  });
})();
