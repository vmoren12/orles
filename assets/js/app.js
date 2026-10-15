/* Orles — estat de l'aplicació, interfície i interacció amb la pàgina. */

(function (Orla) {
  'use strict';

  var layout = Orla.layout;
  var renderer = Orla.renderer;
  var exporter = Orla.exporter;

  var STORAGE_KEY = 'orles.settings.v1';
  var MAX_ZOOM = 3;

  var defaults = {
    pageSize: 'A4',
    orientation: 'portrait',
    margin: 15,
    bgColor: '#ffffff',
    bgPattern: 'none',
    bgPatternColor: '#141414',
    bgPatternOpacity: 0.12,
    bgPatternScale: 1,
    bgBorder: 'none',
    bgBorderColor: '#141414',
    bgBorderOpacity: 0.55,
    bgBorderScale: 1,
    bgImageFit: 'cover',
    bgImageOpacity: 0.35,
    matrix: '4x5',
    aspect: '3:4',
    shape: 'rect',
    gap: 6,
    frame: true,
    centerLast: true,
    title: '',
    subtitle: '',
    footer: '',
    font: 'serif',
    titleScale: 1,
    nameScale: 1,
    textColor: '#141414',
    showNames: true,
    rule: true,
    sealPos: 'left',
    sealSize: 22,
    dpi: 300
  };

  var state = Object.assign({}, defaults, {
    photos: [],
    sealImg: null,
    bgImage: null,
    selected: -1
  });

  var view = { pxPerMm: 1, cells: [], cols: 0, rows: 0 };

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('sheet');
  var ctx = canvas.getContext('2d');
  var stage = $('stage');
  var handle = $('swapHandle');
  var statusTimer = null;

  var hoverIndex = -1;  // foto sota el punter (per situar-hi la nansa)
  var swap = null;      // intercanvi en curs: { from, to, px, py }

  /* ---------- Utilitats ---------- */

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setStatus(message) {
    $('status').textContent = message || '';
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(function () { $('status').textContent = ''; }, 4000);
  }

  function nameFromFile(filename) {
    var base = filename.replace(/\.[^.]+$/, '');
    base = base.replace(/^\s*\d{1,3}\s*[-_.)]\s*/, '');
    base = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return base.replace(/\S+/g, function (word) {
      return word.charAt(0).toLocaleUpperCase('ca') + word.slice(1);
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name)); };
      img.src = url;
    });
  }

  /* ---------- Persistència de la configuració ---------- */

  function saveSettings() {
    try {
      var data = {};
      Object.keys(defaults).forEach(function (key) { data[key] = state[key]; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) { /* espai no disponible: no és crític */ }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      Object.keys(defaults).forEach(function (key) {
        if (data[key] !== undefined && data[key] !== null) state[key] = data[key];
      });
      // El marc clàssic era un estampat; ara és una senefa.
      if (state.bgPattern === 'frame') {
        state.bgPattern = 'none';
        if (data.bgBorder === undefined) state.bgBorder = 'frame';
      }
    } catch (err) { /* configuració il·legible: s'usen els valors per defecte */ }
  }

  /* ---------- Dibuix ---------- */

  function render() {
    var composed = layout.compute(state, 'screen');
    var page = composed.page;

    var padding = 56;
    var availW = Math.max(120, stage.clientWidth - padding);
    var availH = Math.max(120, stage.clientHeight - padding);
    var pxPerMm = Math.min(availW / page.w, availH / page.h);
    var dpr = window.devicePixelRatio || 1;

    canvas.style.width = (page.w * pxPerMm) + 'px';
    canvas.style.height = (page.h * pxPerMm) + 'px';
    canvas.width = Math.round(page.w * pxPerMm * dpr);
    canvas.height = Math.round(page.h * pxPerMm * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    renderer.draw(ctx, composed.ops, pxPerMm * dpr);

    if (state.selected >= 0 && composed.cells[state.selected]) {
      renderer.highlight(ctx, composed.cells[state.selected], pxPerMm * dpr, dpr);
    }
    if (swap) {
      renderer.swapPreview(ctx, composed.cells, swap, state.photos, state.shape, pxPerMm * dpr, dpr);
    }

    view.pxPerMm = pxPerMm;
    view.cells = composed.cells;
    view.cols = composed.cols;
    view.rows = composed.rows;
    placeHandle();

    var count = state.photos.length;
    $('photoCount').textContent = count === 1
      ? '1 fotografia · ' + composed.cols + ' × ' + composed.rows
      : count + ' fotografies · ' + composed.cols + ' × ' + composed.rows;
  }

  var renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render();
    });
  }

  /* ---------- Fitxes i selecció ---------- */

  function syncInspector() {
    var photo = state.photos[state.selected];
    var box = $('inspector');
    if (!photo) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('inspectorTitle').textContent = 'Fotografia ' + (state.selected + 1) + ' de ' + state.photos.length;
    $('cellName').value = photo.name;
    $('zoom').value = photo.zoom;
    $('zoomOut').textContent = Math.round(photo.zoom * 100) + ' %';
  }

  function select(index) {
    state.selected = (index >= 0 && index < state.photos.length) ? index : -1;
    syncInspector();
    requestRender();
  }

  function cellAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var mx = (clientX - rect.left) / view.pxPerMm;
    var my = (clientY - rect.top) / view.pxPerMm;
    for (var i = 0; i < view.cells.length; i++) {
      var c = view.cells[i];
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) return c;
    }
    return null;
  }

  /* ---------- Fotografies ---------- */

  async function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) return;
    files.sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ca', { numeric: true, sensitivity: 'base' });
    });

    var failed = 0;
    for (var i = 0; i < files.length; i++) {
      try {
        var loaded = await loadImage(files[i]);
        state.photos.push({
          img: loaded.img,
          url: loaded.url,
          name: nameFromFile(files[i].name),
          zoom: 1,
          offX: 0,
          offY: 0
        });
      } catch (err) {
        failed++;
      }
    }
    requestRender();
    setStatus(failed ? failed + ' fitxers no s\'han pogut llegir.' : files.length + ' fotografies afegides.');
  }

  function removePhoto(index) {
    var photo = state.photos[index];
    if (!photo) return;
    if (photo.url) URL.revokeObjectURL(photo.url);
    state.photos.splice(index, 1);
    select(Math.min(index, state.photos.length - 1));
  }

  function movePhoto(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= state.photos.length) return;
    var moved = state.photos.splice(index, 1)[0];
    state.photos.splice(target, 0, moved);
    select(target);
  }

  function clearPhotos() {
    state.photos.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); });
    state.photos = [];
    select(-1);
    setStatus('S\'han tret totes les fotografies.');
  }

  /* ---------- Enllaç dels controls ---------- */

  function bindValue(id, key, parse, format) {
    var el = $(id);
    var out = $(id + 'Out');
    var apply = function () {
      state[key] = parse ? parse(el.type === 'checkbox' ? el.checked : el.value) : el.value;
      if (out && format) out.textContent = format(state[key]);
      saveSettings();
      requestRender();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', apply);
    return {
      el: el,
      sync: function () {
        if (el.type === 'checkbox') el.checked = state[key];
        else el.value = state[key];
        if (out && format) out.textContent = format(state[key]);
      }
    };
  }

  var mm = function (v) { return v + ' mm'; };
  var pct = function (v) { return Math.round(v * 100) + ' %'; };
  var num = Number;
  var bool = function (v) { return !!v; };

  var controls = [
    bindValue('pageSize', 'pageSize'),
    bindValue('margin', 'margin', num, mm),
    bindValue('bgColor', 'bgColor'),
    bindValue('bgPatternColor', 'bgPatternColor'),
    bindValue('bgPatternOpacity', 'bgPatternOpacity', num, pct),
    bindValue('bgPatternScale', 'bgPatternScale', num, pct),
    bindValue('bgBorderColor', 'bgBorderColor'),
    bindValue('bgBorderOpacity', 'bgBorderOpacity', num, pct),
    bindValue('bgBorderScale', 'bgBorderScale', num, pct),
    bindValue('bgImageFit', 'bgImageFit'),
    bindValue('bgImageOpacity', 'bgImageOpacity', num, pct),
    bindValue('matrix', 'matrix'),
    bindValue('aspect', 'aspect'),
    bindValue('shape', 'shape'),
    bindValue('gap', 'gap', num, mm),
    bindValue('frame', 'frame', bool),
    bindValue('centerLast', 'centerLast', bool),
    bindValue('title', 'title'),
    bindValue('subtitle', 'subtitle'),
    bindValue('footer', 'footer'),
    bindValue('font', 'font'),
    bindValue('titleScale', 'titleScale', num, pct),
    bindValue('nameScale', 'nameScale', num, pct),
    bindValue('textColor', 'textColor'),
    bindValue('showNames', 'showNames', bool),
    bindValue('rule', 'rule', bool),
    bindValue('sealPos', 'sealPos'),
    bindValue('sealSize', 'sealSize', num, mm),
    bindValue('dpi', 'dpi', num)
  ];

  function syncControls() {
    controls.forEach(function (c) { c.sync(); });
    var radio = document.querySelector('input[name="orientation"][value="' + state.orientation + '"]');
    if (radio) radio.checked = true;
    syncBackgroundUi();
  }

  /* ---------- Fons ---------- */

  var swatches = Array.prototype.slice.call(document.querySelectorAll('#bgSwatches .swatch[data-color]'));
  var customSwatch = document.querySelector('#bgSwatches .swatch-custom');

  swatches.forEach(function (btn) { btn.style.setProperty('--swatch', btn.dataset.color); });

  function luminance(hex) {
    var v = parseInt(String(hex).replace('#', ''), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].reduce(function (sum, c, i) {
      c /= 255;
      c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return sum + c * [0.2126, 0.7152, 0.0722][i];
    }, 0);
  }

  function warnContrast() {
    var a = luminance(state.bgColor);
    var b = luminance(state.textColor);
    var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 3) setStatus('Amb aquest fons, el text es llegirà malament: canvia\'n el color a «Textos».');
  }

  /** Pinta la miniatura d'un estampat o d'una senefa amb els colors actuals. */
  function paintThumb(thumb, kind, value) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = thumb.clientWidth;
    var cssH = thumb.clientHeight;
    if (!cssW || !cssH) return; // el desplegable és tancat: ja es pintarà en obrir-lo
    thumb.width = Math.round(cssW * dpr);
    thumb.height = Math.round(cssH * dpr);
    var tctx = thumb.getContext('2d');
    tctx.fillStyle = state.bgColor;
    tctx.fillRect(0, 0, thumb.width, thumb.height);
    if (kind === 'pattern') {
      var areaW = 30; // mil·límetres de pàgina representats a la miniatura
      var s = thumb.width / areaW;
      tctx.globalAlpha = Math.max(state.bgPatternOpacity, 0.35);
      renderer.drawPattern(tctx, value, areaW, thumb.height / s, s, state.bgPatternColor, 0.7);
    } else {
      var bw = 26;
      var bs = thumb.width / bw;
      tctx.globalAlpha = Math.max(state.bgBorderOpacity, 0.6);
      renderer.drawBorder(tctx, value, bw, thumb.height / bs, bs, state.bgBorderColor, 0.5, 1.5);
    }
    tctx.globalAlpha = 1;
  }

  /**
   * Desplegable amb miniatures agrupades per categories.
   * @param {string} id contenidor .picker
   * @param {Array} groups catàleg ({ title, items: [[valor, nom]] })
   * @param {string} key clau de l'estat que modifica
   * @param {string} kind 'pattern' o 'border'
   */
  function createPicker(id, groups, key, kind) {
    var root = $(id);
    var toggle = root.querySelector('.picker-toggle');
    var menu = root.querySelector('.picker-menu');
    var names = {};
    var buttons = [];

    groups.forEach(function (group) {
      var title = document.createElement('div');
      title.className = 'picker-group';
      title.textContent = group.title;
      var grid = document.createElement('div');
      grid.className = 'picker-grid';
      group.items.forEach(function (item) {
        names[item[0]] = item[1];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pattern';
        btn.title = item[1];
        btn.dataset.value = item[0];
        btn.setAttribute('role', 'radio');
        btn.appendChild(document.createElement('canvas'));
        btn.appendChild(document.createElement('span')).textContent = item[1];
        btn.addEventListener('click', function () {
          state[key] = item[0];
          saveSettings();
          close();
          toggle.focus();
          syncBackgroundUi();
          requestRender();
        });
        grid.appendChild(btn);
        buttons.push(btn);
      });
      if (groups.length > 1) menu.appendChild(title);
      menu.appendChild(grid);
    });

    function paint() {
      paintThumb(toggle.querySelector('canvas'), kind, state[key]);
      if (menu.hidden) return;
      buttons.forEach(function (btn) { paintThumb(btn.querySelector('canvas'), kind, btn.dataset.value); });
    }

    function open() {
      pickers.forEach(function (p) { if (p !== api) p.close(); });
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      paint();
      var current = menu.querySelector('[aria-checked="true"]');
      if (current) {
        current.focus();
        current.scrollIntoView({ block: 'nearest' });
      }
    }

    function close() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      if (menu.hidden) open(); else close();
    });

    var api = {
      root: root,
      isOpen: function () { return !menu.hidden; },
      close: close,
      focus: function () { toggle.focus(); },
      paint: paint,
      sync: function () {
        if (!names[state[key]]) state[key] = 'none';
        buttons.forEach(function (btn) {
          btn.setAttribute('aria-checked', btn.dataset.value === state[key] ? 'true' : 'false');
        });
        root.querySelector('.picker-value').textContent = names[state[key]];
        paint();
      }
    };
    return api;
  }

  var pickers = [
    createPicker('patternPicker', Orla.templates.PATTERNS, 'bgPattern', 'pattern'),
    createPicker('borderPicker', Orla.templates.BORDERS, 'bgBorder', 'border')
  ];

  // Tanca els desplegables en fer clic fora.
  document.addEventListener('pointerdown', function (e) {
    pickers.forEach(function (p) { if (p.isOpen() && !p.root.contains(e.target)) p.close(); });
  });

  function syncBackgroundUi() {
    var color = String(state.bgColor).toLowerCase();
    var matched = false;
    swatches.forEach(function (btn) {
      var on = btn.dataset.color === color;
      matched = matched || on;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    customSwatch.classList.toggle('is-custom', !matched);
    customSwatch.style.background = matched ? '' : color;

    pickers.forEach(function (p) { p.sync(); });
    $('patternOptions').hidden = state.bgPattern === 'none';
    $('borderOptions').hidden = state.bgBorder === 'none';
    $('bgImageOptions').hidden = !state.bgImage;
    $('addBgImage').textContent = state.bgImage ? 'Canvia la imatge de fons' : 'Carrega una imatge de fons';
  }

  swatches.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.bgColor = btn.dataset.color;
      $('bgColor').value = state.bgColor;
      saveSettings();
      syncBackgroundUi();
      requestRender();
      warnContrast();
    });
  });

  $('bgColor').addEventListener('input', syncBackgroundUi);
  $('bgColor').addEventListener('change', warnContrast);
  ['bgPatternColor', 'bgPatternOpacity'].forEach(function (id) {
    $(id).addEventListener('input', pickers[0].paint);
  });
  ['bgBorderColor', 'bgBorderOpacity'].forEach(function (id) {
    $(id).addEventListener('input', pickers[1].paint);
  });

  function clearBgImage() {
    if (state.bgImage && state.bgImage.dataUrl) URL.revokeObjectURL(state.bgImage.dataUrl);
    state.bgImage = null;
  }

  $('addBgImage').addEventListener('click', function () { $('fileBgImage').click(); });
  $('fileBgImage').addEventListener('change', async function (e) {
    if (!e.target.files[0]) return;
    try {
      var loaded = await loadImage(e.target.files[0]);
      clearBgImage();
      state.bgImage = loaded.img;
      state.bgImage.dataUrl = loaded.url;
      syncBackgroundUi();
      requestRender();
    } catch (err) {
      setStatus('No s\'ha pogut llegir la imatge de fons.');
    }
    e.target.value = '';
  });

  $('clearBgImage').addEventListener('click', function () {
    clearBgImage();
    syncBackgroundUi();
    requestRender();
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="orientation"]'), function (radio) {
    radio.addEventListener('change', function () {
      if (!radio.checked) return;
      state.orientation = radio.value;
      saveSettings();
      requestRender();
    });
  });

  /* ---------- Botons ---------- */

  $('addPhotos').addEventListener('click', function () { $('filePhotos').click(); });
  $('filePhotos').addEventListener('change', function (e) {
    addFiles(e.target.files);
    e.target.value = '';
  });

  $('clearPhotos').addEventListener('click', function () {
    if (!state.photos.length) return;
    if (confirm('Vols treure totes les fotografies?')) clearPhotos();
  });

  $('addSeal').addEventListener('click', function () { $('fileSeal').click(); });
  $('fileSeal').addEventListener('change', async function (e) {
    if (!e.target.files[0]) return;
    try {
      var loaded = await loadImage(e.target.files[0]);
      if (state.sealImg && state.sealImg.dataUrl) URL.revokeObjectURL(state.sealImg.dataUrl);
      state.sealImg = loaded.img;
      state.sealImg.dataUrl = loaded.url;
      requestRender();
    } catch (err) {
      setStatus('No s\'ha pogut llegir el segell.');
    }
    e.target.value = '';
  });

  $('clearSeal').addEventListener('click', function () {
    if (state.sealImg && state.sealImg.dataUrl) URL.revokeObjectURL(state.sealImg.dataUrl);
    state.sealImg = null;
    requestRender();
  });

  $('reset').addEventListener('click', function () {
    if (!confirm('Vols restablir la configuració? Les fotografies es mantenen.')) return;
    Object.keys(defaults).forEach(function (key) { state[key] = defaults[key]; });
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignorat */ }
    syncControls();
    requestRender();
    setStatus('Configuració restablerta.');
  });

  /* ---------- Fitxa de la fotografia ---------- */

  $('closeInspector').addEventListener('click', function () { select(-1); });

  $('cellName').addEventListener('input', function () {
    var photo = state.photos[state.selected];
    if (!photo) return;
    photo.name = this.value;
    requestRender();
  });

  $('zoom').addEventListener('input', function () {
    var photo = state.photos[state.selected];
    if (!photo) return;
    photo.zoom = Number(this.value);
    $('zoomOut').textContent = Math.round(photo.zoom * 100) + ' %';
    requestRender();
  });

  $('recenter').addEventListener('click', function () {
    var photo = state.photos[state.selected];
    if (!photo) return;
    photo.zoom = 1;
    photo.offX = 0;
    photo.offY = 0;
    syncInspector();
    requestRender();
  });

  $('replace').addEventListener('click', function () { $('fileReplace').click(); });
  $('fileReplace').addEventListener('change', async function (e) {
    var photo = state.photos[state.selected];
    if (!photo || !e.target.files[0]) return;
    try {
      var loaded = await loadImage(e.target.files[0]);
      if (photo.url) URL.revokeObjectURL(photo.url);
      photo.img = loaded.img;
      photo.url = loaded.url;
      photo.zoom = 1;
      photo.offX = 0;
      photo.offY = 0;
      requestRender();
    } catch (err) {
      setStatus('No s\'ha pogut llegir la imatge.');
    }
    e.target.value = '';
  });

  $('moveBack').addEventListener('click', function () { movePhoto(state.selected, -1); });
  $('moveFwd').addEventListener('click', function () { movePhoto(state.selected, 1); });
  $('remove').addEventListener('click', function () { removePhoto(state.selected); });

  /* ---------- Interacció amb la pàgina ---------- */

  var drag = null;

  canvas.addEventListener('pointerdown', function (e) {
    var cell = cellAt(e.clientX, e.clientY);
    if (!cell) {
      select(-1);
      return;
    }
    if (cell.index >= state.photos.length) {
      select(-1);
      $('filePhotos').click();
      return;
    }
    select(cell.index);
    drag = { x: e.clientX, y: e.clientY, cell: cell, moved: false };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) {
      var over = cellAt(e.clientX, e.clientY);
      var onPhoto = !!over && over.index < state.photos.length;
      canvas.classList.toggle('is-grabbable', onPhoto);
      var index = onPhoto ? over.index : -1;
      if (index !== hoverIndex) {
        hoverIndex = index;
        placeHandle();
      }
      return;
    }
    var photo = state.photos[state.selected];
    if (!photo) return;

    var dx = (e.clientX - drag.x) / view.pxPerMm;
    var dy = (e.clientY - drag.y) / view.pxPerMm;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 0.2) drag.moved = true;

    var crop = layout.cropFor(photo.img, drag.cell.w, drag.cell.h, photo.zoom, photo.offX, photo.offY);
    var iw = photo.img.naturalWidth;
    var ih = photo.img.naturalHeight;
    if (iw - crop.sw > 0.5) photo.offX = clamp(photo.offX - (dx / drag.cell.w) * crop.sw / (iw - crop.sw), -0.5, 0.5);
    if (ih - crop.sh > 0.5) photo.offY = clamp(photo.offY - (dy / drag.cell.h) * crop.sh / (ih - crop.sh), -0.5, 0.5);
    requestRender();
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    canvas.classList.remove('is-grabbing');
    if (e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('pointerleave', function (e) {
    if (drag || e.relatedTarget === handle) return;
    hoverIndex = -1;
    placeHandle();
  });

  /* ---------- Intercanvi de fotos amb la nansa de la cantonada ---------- */

  /** Situa la nansa a la cantonada de la foto sota el punter o, si no n'hi ha, de la seleccionada. */
  function placeHandle() {
    var index = swap ? swap.from : (hoverIndex >= 0 ? hoverIndex : state.selected);
    var cell = view.cells[index];
    if (!cell || index >= state.photos.length || state.photos.length < 2) {
      handle.hidden = true;
      return;
    }
    var s = view.pxPerMm;
    var size = clamp(Math.round(cell.w * s * 0.28), 20, 28);
    var inset = clamp(cell.w * s * 0.05, 2, 6);
    handle.style.setProperty('--handle', size + 'px');
    handle.style.left = (canvas.offsetLeft + canvas.clientLeft + cell.x * s + inset) + 'px';
    handle.style.top = (canvas.offsetTop + canvas.clientTop + cell.y * s + inset) + 'px';
    handle.dataset.index = index;
    handle.hidden = false;
  }

  function updateSwap(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    swap.px = (clientX - rect.left) / view.pxPerMm;
    swap.py = (clientY - rect.top) / view.pxPerMm;
    var over = cellAt(clientX, clientY);
    swap.to = over && over.index < state.photos.length ? over.index : -1;
    requestRender();
  }

  function endSwap(commit) {
    if (!swap) return;
    var from = swap.from;
    var to = swap.to;
    swap = null;
    document.body.classList.remove('is-swapping');
    if (commit && to >= 0 && to !== from) {
      var moved = state.photos[from];
      state.photos[from] = state.photos[to];
      state.photos[to] = moved;
      hoverIndex = to;
      select(to);
      setStatus('S\'han intercanviat les fotografies ' + (from + 1) + ' i ' + (to + 1) + '.');
    } else {
      requestRender();
    }
  }

  handle.addEventListener('pointerdown', function (e) {
    var from = Number(handle.dataset.index);
    if (!state.photos[from] || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    if (state.selected !== from) select(from);
    swap = { from: from, to: -1, px: 0, py: 0 };
    document.body.classList.add('is-swapping');
    updateSwap(e.clientX, e.clientY);
  });

  handle.addEventListener('pointermove', function (e) {
    if (swap) updateSwap(e.clientX, e.clientY);
  });

  handle.addEventListener('pointerup', function () { endSwap(true); });
  handle.addEventListener('pointercancel', function () { endSwap(false); });
  handle.addEventListener('lostpointercapture', function () { endSwap(false); });

  handle.addEventListener('pointerleave', function (e) {
    if (swap || e.relatedTarget === canvas) return;
    hoverIndex = -1;
    placeHandle();
  });

  handle.addEventListener('wheel', function (e) {
    // La roda sobre la nansa també amplia la foto, com sobre la resta de la casella.
    canvas.dispatchEvent(new WheelEvent('wheel', e));
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('wheel', function (e) {
    var cell = cellAt(e.clientX, e.clientY);
    if (!cell || cell.index >= state.photos.length) return;
    e.preventDefault();
    if (cell.index !== state.selected) select(cell.index);
    var photo = state.photos[cell.index];
    photo.zoom = clamp(photo.zoom * (1 - e.deltaY * 0.0015), 1, MAX_ZOOM);
    syncInspector();
    requestRender();
  }, { passive: false });

  canvas.addEventListener('dblclick', function (e) {
    var cell = cellAt(e.clientX, e.clientY);
    if (cell && cell.index < state.photos.length) {
      select(cell.index);
      $('fileReplace').click();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var openPicker = pickers.filter(function (p) { return p.isOpen(); })[0];
      if (openPicker) {
        openPicker.close();
        openPicker.focus();
        return;
      }
    }
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (swap) {
      if (e.key === 'Escape') endSwap(false);
      return;
    }
    var photo = state.photos[state.selected];
    if (e.key === 'Escape') { select(-1); return; }
    if (!photo) return;

    var step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowLeft') { photo.offX = clamp(photo.offX + step, -0.5, 0.5); }
    else if (e.key === 'ArrowRight') { photo.offX = clamp(photo.offX - step, -0.5, 0.5); }
    else if (e.key === 'ArrowUp') { photo.offY = clamp(photo.offY + step, -0.5, 0.5); }
    else if (e.key === 'ArrowDown') { photo.offY = clamp(photo.offY - step, -0.5, 0.5); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { removePhoto(state.selected); return; }
    else return;
    e.preventDefault();
    requestRender();
  });

  /* ---------- Arrossegar i deixar anar ---------- */

  var dragDepth = 0;

  stage.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth++;
    $('dropzone').hidden = false;
  });

  stage.addEventListener('dragover', function (e) { e.preventDefault(); });

  stage.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('dropzone').hidden = true;
  });

  stage.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    $('dropzone').hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  /* ---------- Exportació ---------- */

  async function withOverlay(task, doneMessage) {
    $('overlay').hidden = false;
    await exporter.yieldToUi();
    try {
      await task();
      setStatus(doneMessage);
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Hi ha hagut un error en exportar.');
    } finally {
      $('overlay').hidden = true;
    }
  }

  $('exportPdf').addEventListener('click', function () {
    if (!state.photos.length && !confirm('No hi ha cap fotografia. Vols exportar igualment?')) return;
    withOverlay(function () { return exporter.toPdf(state, state.dpi); }, 'PDF generat.');
  });

  $('exportPng').addEventListener('click', function () {
    withOverlay(function () { return exporter.toPng(state, state.dpi); }, 'PNG generat.');
  });

  /* ---------- Posada en marxa ---------- */

  if (window.ResizeObserver) {
    new ResizeObserver(requestRender).observe(stage);
  } else {
    window.addEventListener('resize', requestRender);
  }

  loadSettings();
  syncControls();
  render();

  /* Punt d'entrada mínim per a depuració i proves automatitzades. */
  Orla.app = {
    state: state,
    render: requestRender,
    addFiles: addFiles,
    select: select
  };
})(window.Orla);
