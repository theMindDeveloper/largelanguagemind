/* Large Language Mind: mounts the generated figures and wires up the page.
   Every figure is an empty <canvas> with data attributes; neural-engine.js draws it. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BG = { paper: '#EDE3CC', night: '#0A0B0D' };
  var hero = null;
  var booted = false;
  var heroCanvas = null;

  function theme() { return root.getAttribute('data-theme') === 'night' ? 'night' : 'paper'; }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function E() { return window.LLMEngine; }

  // ---------- figures ----------
  function drawPlate(el) {
    E().renderPlate(el, el.getAttribute('data-kind'), +el.getAttribute('data-seed') || 1, theme());
  }
  function drawThumb(el) {
    var seed = +el.getAttribute('data-seed') || 1;
    var type = el.getAttribute('data-type') || null;
    if (el.hasAttribute('data-specimen')) return E().renderSpecimen(el, seed, theme(), type, 0.66, 0.42);
    E().renderThumb(el, seed, el.getAttribute('data-ghost') === '1', theme(), type);
  }
  function drawLogo(el) { E().renderLogo(el, theme(), BG[theme()]); }

  function mountHero(el) {
    var beats = document.querySelector('.beats');
    hero = E().mountHero(el, {
      theme: theme(),
      variant: +el.getAttribute('data-variant') || 0,
      speed: 0.7,
      ambient: 8,
      onPhase: function (p) { if (beats) beats.setAttribute('data-phase', p); }
    });
    // Reduced motion: let the cells grow once, then hold still.
    if (reduceMotion) setTimeout(function () { if (hero) hero.setSpeed(0); }, 4200);
  }

  // The page background is tiled by the engine: only tiles near the viewport exist.
  var fields = [];
  function workerUrl() {
    // the worker loads the same engine file, cache version included
    var engine = document.querySelector('script[src*="neural-engine.js"]');
    var worker = document.querySelector('script[src*="journal.js"]');
    if (!engine || !worker) return null;
    var base = worker.src.replace(/journal\.js(\?.*)?$/, 'field-worker.js');
    var v = (worker.src.match(/\?v=[^&]*/) || [''])[0];
    return base + (v ? v + '&' : '?') + 'engine=' + encodeURIComponent(engine.src);
  }
  function mountFields() {
    fields.forEach(function (f) { if (f.h) f.h.destroy(); });
    var url = workerUrl();
    fields = $$('[data-field]').map(function (el) {
      return {
        el: el,
        h: E().mountField(el, { seed: +el.getAttribute('data-seed') || 1, density: +(el.getAttribute('data-neurons') || 1), theme: theme(), workerUrl: url })
      };
    });
  }

  function drawFigures() {
    $$('canvas[data-kind]').forEach(drawPlate);
    $$('canvas[data-thumb], canvas[data-specimen]').forEach(drawThumb);
    $$('canvas[data-logo]').forEach(drawLogo);
  }
  function drawAll() {
    drawFigures();
    mountFields();
  }

  function watchField() {
    if (!window.ResizeObserver) return;
    $$('[data-field]').forEach(function (el) {
      var lw = el.clientWidth, lh = el.clientHeight, t = 0;
      new ResizeObserver(function () {
        if (Math.abs(el.clientWidth - lw) < 2 && Math.abs(el.clientHeight - lh) < 40) return;
        lw = el.clientWidth; lh = el.clientHeight;
        clearTimeout(t); t = setTimeout(mountFields, 300);
      }).observe(el);
    });
  }

  // ---------- theme ----------
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('llm-theme', t); } catch (e) { /* private mode */ }
    $$('.theme-toggle').forEach(function (b) {
      b.textContent = t === 'night' ? 'lights on' : 'lights off';
      b.setAttribute('aria-pressed', t === 'night' ? 'true' : 'false');
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BG[t]);
    if (!E() || !booted) return;
    // spread the redraw over frames so the switch itself never stalls
    requestAnimationFrame(function () {
      fields.forEach(function (f) { f.h.setTheme(t); });
      requestAnimationFrame(function () {
        if (hero && heroCanvas) { hero.destroy(); mountHero(heroCanvas); }
        setTimeout(drawFigures, 0);
      });
    });
  }

  // ---------- article: book view or newspaper view ----------
  function readMode() { return root.getAttribute('data-read') === 'columns' ? 'columns' : 'book'; }
  function setRead(mode, keepPlace) {
    // keep the reader on the same heading when the layout reflows
    var anchor = null, offset = 0;
    if (keepPlace) {
      var heads = $$('[data-sec]');
      for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 180) anchor = heads[i];
      if (anchor) offset = anchor.getBoundingClientRect().top;
    }
    if (mode === 'columns') root.setAttribute('data-read', 'columns'); else root.removeAttribute('data-read');
    try { localStorage.setItem('llm-read', mode); } catch (e) { /* private mode */ }
    $$('.read-toggle').forEach(function (b) {
      b.textContent = mode === 'columns' ? 'book view' : 'newspaper view';
      b.setAttribute('aria-pressed', mode === 'columns' ? 'true' : 'false');
    });
    if (anchor) window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY - offset);
  }

  // ---------- home: notes filter and atlas links ----------
  function setFilter(key) {
    var rows = $$('.note-row');
    var shown = 0;
    rows.forEach(function (r) {
      var on = key === 'all' || (' ' + r.getAttribute('data-lenses') + ' ').indexOf(' ' + key + ' ') >= 0;
      r.hidden = !on;
      if (on) shown++;
    });
    $$('.filters button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filter') === key ? 'true' : 'false'); });
    var none = document.querySelector('.no-match');
    if (none) none.hidden = shown > 0;
  }

  // ---------- article: sections, numbering, figures, tables, contents ----------
  function prepareArticle(prose) {
    // Sections are h2 (or h1 if a note only uses h1).
    var level = prose.querySelector('h2') ? 'h2' : 'h1';
    var heads = $$(level, prose);
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'section-' + (i + 1);
      h.setAttribute('data-sec', '');
      var m = h.textContent.trim().match(/^(\d+(?:\.\d+)*)[.)]?\s+([\s\S]*)$/);
      h._num = m ? m[1] : '';
      h._label = (m ? m[2] : h.textContent).trim();
      if (m && h.firstChild && h.firstChild.nodeType === 3) {
        var txt = h.firstChild.nodeValue;
        var cut = txt.indexOf(m[1]) + m[1].length;
        var rest = txt.slice(cut).replace(/^[.)]?/, '');
        var span = document.createElement('span');
        span.className = 'num';
        span.textContent = m[1] + '.';
        h.firstChild.nodeValue = rest;
        h.insertBefore(span, h.firstChild);
      }
    });

    // ![image](...) followed by an *italic caption* paragraph -> numbered plate figure
    var figN = 0;
    $$('p', prose).forEach(function (p) {
      var kids = Array.prototype.filter.call(p.childNodes, function (n) { return !(n.nodeType === 3 && !n.nodeValue.trim()) && n.nodeName !== 'BR'; });
      if (!kids.length || kids[0].nodeName !== 'IMG') return;
      var imgs = [kids[0]];
      var capNode = null;
      var hasCap = kids.length > 1 && kids[1].nodeName === 'EM';
      if (hasCap) capNode = kids[1];
      if (kids.length > (hasCap ? 2 : 1)) {
        // the paragraph keeps going after the image: lift the image (and caption) out in front of it
        var rest = p;
        p = document.createElement('p');
        rest.parentNode.insertBefore(p, rest);
        p.appendChild(kids[0]);
        if (capNode) rest.removeChild(capNode);
        while (rest.firstChild && rest.firstChild.nodeType === 3 && !rest.firstChild.nodeValue.trim()) rest.removeChild(rest.firstChild);
        if (rest.firstChild && rest.firstChild.nodeType === 3) rest.firstChild.nodeValue = rest.firstChild.nodeValue.replace(/^\s+/, '');
      } else if (!hasCap) {
        var next = p.nextElementSibling;
        if (next && next.nodeName === 'P' && next.children.length === 1 && next.firstElementChild.nodeName === 'EM' && next.textContent.trim() === next.firstElementChild.textContent.trim()) {
          capNode = next.firstElementChild;
          next.parentNode.removeChild(next);
        }
      }
      figN++;
      var fig = document.createElement('figure');
      var paper = document.createElement('div');
      paper.className = 'fig-paper';
      paper.appendChild(imgs[0]);
      fig.appendChild(paper);
      var cap = document.createElement('figcaption');
      cap.innerHTML = '<span class="fig-n">fig. ' + figN + '</span>';
      var t = document.createElement('span');
      t.className = 'fig-t';
      t.textContent = capNode ? capNode.textContent.replace(/^\s*(figure|fig\.?)\s*\d*\s*[:.]\s*/i, '') : (imgs[0].getAttribute('alt') || '');
      cap.appendChild(t);
      fig.appendChild(cap);
      p.parentNode.replaceChild(fig, p);
    });

    // wide tables scroll inside their own box
    $$('table', prose).forEach(function (tb) {
      if (tb.parentNode.classList.contains('table-wrap')) return;
      var w = document.createElement('div');
      w.className = 'table-wrap';
      tb.parentNode.insertBefore(w, tb);
      w.appendChild(tb);
    });

    // contents
    var toc = document.querySelector('.toc-list');
    if (toc) {
      heads.forEach(function (h) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-target', h.id);
        b.innerHTML = '<em></em><span></span>';
        b.firstChild.textContent = h._num;
        b.lastChild.textContent = h._label;
        b.addEventListener('click', function () {
          window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 80, behavior: reduceMotion ? 'auto' : 'smooth' });
        });
        toc.appendChild(b);
      });
      if (!heads.length) toc.parentNode.hidden = true;
    }

    var bar = document.querySelector('.progress');
    var buttons = $$('.toc-list button');
    var ticking = false;
    function onScroll() {
      ticking = false;
      var act = heads.length ? heads[0].id : null;
      for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 180) act = heads[i].id;
      buttons.forEach(function (b) { b.setAttribute('aria-current', b.getAttribute('data-target') === act ? 'true' : 'false'); });
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  // ---------- boot ----------
  function boot() {
    setTheme(theme());
    $$('.theme-toggle').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(theme() === 'night' ? 'paper' : 'night'); });
    });
    setRead(readMode(), false);
    $$('.read-toggle').forEach(function (b) {
      b.addEventListener('click', function () { setRead(readMode() === 'columns' ? 'book' : 'columns', true); });
    });

    $$('.filters button').forEach(function (b) {
      b.addEventListener('click', function () { setFilter(b.getAttribute('data-filter')); });
    });
    $$('[data-see-all]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        setFilter(a.getAttribute('data-see-all'));
        var n = document.getElementById('notes');
        if (n) window.scrollTo({ top: n.getBoundingClientRect().top + window.scrollY, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });

    var prose = document.querySelector('.prose');
    if (prose) prepareArticle(prose);

    function start() {
      if (!E()) return setTimeout(start, 50);
      requestAnimationFrame(function () {
        drawAll();
        booted = true;
        watchField();
        heroCanvas = document.querySelector('canvas[data-hero]');
        if (heroCanvas) mountHero(heroCanvas);
      });
    }
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
