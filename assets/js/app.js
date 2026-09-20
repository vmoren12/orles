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
    selected: -1
  });

  var view = { pxPerMm: 1, cells: [], cols: 0, rows: 0 };

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('sheet');
  var ctx = canvas.getContext('2d');
  var stage = $('stage');
  var statusTimer = null;

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
      renderer.highlight(ctx, composed.cells[state.selected], pxPerMm * dpr);
    }

    view.pxPerMm = pxPerMm;
    view.cells = composed.cells;
    view.cols = composed.cols;
    view.rows = composed.rows;

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
  }

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
      canvas.classList.toggle('is-grabbable', !!over && over.index < state.photos.length);
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
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') document.activeElement.blur();
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
