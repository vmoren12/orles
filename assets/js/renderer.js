/* Orles — dibuix de la llista d'operacions sobre un canvas. */

window.Orla = window.Orla || {};

window.Orla.renderer = (function (layout) {
  'use strict';

  /** Traça el contorn d'una casella segons la forma triada. */
  function shapePath(ctx, op, s) {
    var x = op.x * s, y = op.y * s, w = op.w * s, h = op.h * s;
    ctx.beginPath();
    if (op.shape === 'ellipse') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (op.shape === 'round') {
      var r = Math.min((op.radius || 0) * s, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  /* ---------- Fons ---------- */

  /** Generador pseudoaleatori determinista: el confeti surt igual a la pantalla i al PDF. */
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function star(ctx, cx, cy, r) {
    ctx.moveTo(cx, cy - r);
    for (var i = 1; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  /**
   * Dibuixa un estampat decoratiu sobre l'àrea (w × h mm) amb origen a 0,0.
   * Totes les mesures són en mil·límetres i s'escalen amb `k`.
   */
  function drawPattern(ctx, kind, w, h, s, color, k, inset) {
    var x, y, i, step;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';

    if (kind === 'dots') {
      step = 6 * k;
      ctx.beginPath();
      for (y = step / 2, i = 0; y < h + step; y += step * 0.866, i++) {
        for (x = (i % 2 ? step / 2 : 0); x < w + step; x += step) {
          ctx.moveTo((x + 0.45 * k) * s, y * s);
          ctx.arc(x * s, y * s, 0.45 * k * s, 0, Math.PI * 2);
        }
      }
      ctx.fill();

    } else if (kind === 'grid') {
      step = 8 * k;
      ctx.lineWidth = Math.max(0.5, 0.15 * s);
      ctx.beginPath();
      for (x = step / 2; x < w; x += step) { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, h * s); }
      for (y = step / 2; y < h; y += step) { ctx.moveTo(0, y * s); ctx.lineTo(w * s, y * s); }
      ctx.stroke();

    } else if (kind === 'diagonal' || kind === 'diamonds') {
      step = (kind === 'diamonds' ? 10 : 5) * k;
      ctx.lineWidth = Math.max(0.5, 0.2 * s);
      ctx.beginPath();
      for (x = -h; x < w + h; x += step) {
        ctx.moveTo(x * s, h * s);
        ctx.lineTo((x + h) * s, 0);
        if (kind === 'diamonds') {
          ctx.moveTo(x * s, 0);
          ctx.lineTo((x + h) * s, h * s);
        }
      }
      ctx.stroke();

    } else if (kind === 'waves') {
      step = 7 * k;
      var amp = 1.1 * k;
      var len = 14 * k;
      ctx.lineWidth = Math.max(0.5, 0.25 * s);
      ctx.beginPath();
      for (y = step / 2; y < h + step; y += step) {
        ctx.moveTo(0, y * s);
        for (x = 0; x <= w + len / 2; x += len / 2) {
          var up = Math.round(x / (len / 2)) % 2 ? 1 : -1;
          ctx.quadraticCurveTo((x + len / 4) * s, (y + up * amp * 2) * s, (x + len / 2) * s, y * s);
        }
      }
      ctx.stroke();

    } else if (kind === 'stars') {
      step = 18 * k;
      ctx.beginPath();
      for (y = step / 2, i = 0; y < h + step; y += step * 0.75, i++) {
        for (x = (i % 2 ? step / 2 : 0); x < w + step; x += step) {
          star(ctx, x * s, y * s, 2.2 * k * s);
        }
      }
      ctx.fill();

    } else if (kind === 'confetti') {
      var rnd = seeded(1979);
      var count = Math.round(w * h / (55 * k * k));
      ctx.lineWidth = Math.max(0.5, 0.35 * k * s);
      for (i = 0; i < count; i++) {
        x = rnd() * w;
        y = rnd() * h;
        var size = (0.6 + rnd() * 0.9) * k;
        var kindPiece = rnd();
        var angle = rnd() * Math.PI;
        ctx.beginPath();
        if (kindPiece < 0.4) {
          ctx.arc(x * s, y * s, size * 0.45 * s, 0, Math.PI * 2);
          ctx.fill();
        } else if (kindPiece < 0.75) {
          ctx.moveTo((x - Math.cos(angle) * size) * s, (y - Math.sin(angle) * size) * s);
          ctx.lineTo((x + Math.cos(angle) * size) * s, (y + Math.sin(angle) * size) * s);
          ctx.stroke();
        } else {
          ctx.moveTo((x + Math.cos(angle) * size) * s, (y + Math.sin(angle) * size) * s);
          ctx.lineTo((x + Math.cos(angle + 2.1) * size) * s, (y + Math.sin(angle + 2.1) * size) * s);
          ctx.lineTo((x + Math.cos(angle + 4.2) * size) * s, (y + Math.sin(angle + 4.2) * size) * s);
          ctx.closePath();
          ctx.fill();
        }
      }

    } else if (kind === 'frame') {
      var d = inset || 6;
      var gapLine = 1.6 * k;
      ctx.lineWidth = Math.max(0.75, 0.6 * k * s);
      ctx.strokeRect(d * s, d * s, (w - 2 * d) * s, (h - 2 * d) * s);
      ctx.lineWidth = Math.max(0.5, 0.2 * k * s);
      var d2 = d + gapLine;
      ctx.strokeRect(d2 * s, d2 * s, (w - 2 * d2) * s, (h - 2 * d2) * s);
      var r = 1.6 * k;
      [[d, d], [w - d, d], [d, h - d], [w - d, h - d]].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p[0] * s, (p[1] - r) * s);
        ctx.lineTo((p[0] + r) * s, p[1] * s);
        ctx.lineTo(p[0] * s, (p[1] + r) * s);
        ctx.lineTo((p[0] - r) * s, p[1] * s);
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.restore();
  }

  /** Pinta el fons complet (color, imatge i estampat) en coordenades locals. */
  function paintBackground(ctx, op, s) {
    ctx.fillStyle = op.color;
    ctx.fillRect(0, 0, op.w * s, op.h * s);

    if (op.image) {
      ctx.save();
      ctx.globalAlpha = op.imageOpacity;
      var img = op.image;
      if (op.imageFit === 'tile') {
        var tw = op.w / 4;
        var th = tw * (img.naturalHeight / img.naturalWidth);
        for (var ty = 0; ty < op.h; ty += th) {
          for (var tx = 0; tx < op.w; tx += tw) {
            ctx.drawImage(img, tx * s, ty * s, tw * s, th * s);
          }
        }
      } else if (op.imageFit === 'contain') {
        var ratio = Math.min(op.w / img.naturalWidth, op.h / img.naturalHeight);
        var cw = img.naturalWidth * ratio;
        var ch = img.naturalHeight * ratio;
        ctx.drawImage(img, (op.w - cw) / 2 * s, (op.h - ch) / 2 * s, cw * s, ch * s);
      } else {
        var c = layout.cropFor(img, op.w, op.h, 1, 0, 0);
        ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, op.w * s, op.h * s);
      }
      ctx.restore();
    }

    if (op.pattern && op.pattern !== 'none') {
      ctx.save();
      ctx.globalAlpha = op.patternOpacity;
      drawPattern(ctx, op.pattern, op.w, op.h, s, op.patternColor, op.patternScale, op.inset);
      ctx.restore();
    }
  }

  /** Indica si el fons té res més que un color pla. */
  function isDecorated(op) {
    return !!op.image || (!!op.pattern && op.pattern !== 'none');
  }

  /** Rasteritza el fons en un canvas propi a la resolució demanada. */
  function backgroundCanvas(op, s) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(op.w * s));
    canvas.height = Math.max(1, Math.round(op.h * s));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    paintBackground(ctx, op, s);
    return canvas;
  }

  /* A la pantalla el fons es desa en memòria perquè arrossegar fotos no el repinti a cada fotograma. */
  var bgCache = { key: '', canvas: null };
  var MAX_CACHE_PX = 6e6;

  function drawBackground(ctx, op, s) {
    if (!isDecorated(op)) {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x * s, op.y * s, op.w * s, op.h * s);
      return;
    }
    if (op.w * op.h * s * s > MAX_CACHE_PX) {
      ctx.save();
      ctx.translate(op.x * s, op.y * s);
      paintBackground(ctx, op, s);
      ctx.restore();
      return;
    }
    var key = [op.w, op.h, s, op.color, op.pattern, op.patternColor, op.patternOpacity,
      op.patternScale, op.inset, op.image ? op.image.src : '', op.imageFit, op.imageOpacity].join('|');
    if (bgCache.key !== key) {
      bgCache.key = key;
      bgCache.canvas = backgroundCanvas(op, s);
    }
    ctx.drawImage(bgCache.canvas, op.x * s, op.y * s);
  }

  /**
   * Dibuixa les operacions.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} ops
   * @param {number} s píxels per mil·límetre
   */
  function draw(ctx, ops, s) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];

      if (op.t === 'background') {
        drawBackground(ctx, op, s);

      } else if (op.t === 'rect') {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x * s, op.y * s, op.w * s, op.h * s);

      } else if (op.t === 'line') {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = Math.max(1, op.lw * s);
        ctx.beginPath();
        ctx.moveTo(op.x1 * s, op.y1 * s);
        ctx.lineTo(op.x2 * s, op.y2 * s);
        ctx.stroke();

      } else if (op.t === 'shape') {
        shapePath(ctx, op, s);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = Math.max(1, op.lw * s);
          if (op.dash) ctx.setLineDash([3 * s, 3 * s]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

      } else if (op.t === 'image') {
        ctx.save();
        shapePath(ctx, op, s);
        ctx.clip();
        var c = op.crop;
        if (c) {
          ctx.drawImage(op.img, c.sx, c.sy, c.sw, c.sh, op.x * s, op.y * s, op.w * s, op.h * s);
        } else {
          ctx.drawImage(op.img, op.x * s, op.y * s, op.w * s, op.h * s);
        }
        ctx.restore();

      } else if (op.t === 'text') {
        ctx.fillStyle = op.color;
        ctx.font = layout.cssFont(op.family, op.weight, op.size * s);
        if ('letterSpacing' in ctx) ctx.letterSpacing = ((op.tracking || 0) * s) + 'px';
        ctx.fillText(op.str, op.x * s, op.y * s);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      }
    }

    ctx.restore();
  }

  /** Marca visual de la casella seleccionada (només a la pantalla). */
  function highlight(ctx, cell, s, dpr) {
    var pad = 1.2 * s;
    var lw = Math.max(1.5 * (dpr || 1), 0.35 * s);
    var x = cell.x * s - pad, y = cell.y * s - pad, w = cell.w * s + pad * 2, h = cell.h * s + pad * 2;
    ctx.save();
    // Doble traç perquè es vegi tant sobre fons clars com foscos.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lw * 2.6;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Previsualització de l'intercanvi de dues fotografies: la casella d'origen
   * queda esvaïda, la de destinació remarcada i la foto segueix el punter.
   * @param {object} swap { from, to, px, py } amb px/py en mil·límetres de pàgina
   */
  function swapPreview(ctx, cells, swap, photos, shape, s, dpr) {
    var from = cells[swap.from];
    var to = swap.to >= 0 ? cells[swap.to] : null;
    var photo = photos[swap.from];
    if (!from || !photo) return;
    var lw = Math.max(1.5 * (dpr || 1), 0.35 * s);
    var radius = from.w * 0.07;

    ctx.save();
    shapePath(ctx, { x: from.x, y: from.y, w: from.w, h: from.h, shape: shape, radius: radius }, s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.fill();
    ctx.setLineDash([4 * (dpr || 1), 4 * (dpr || 1)]);
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    ctx.restore();

    if (to && to !== from) {
      // La foto de destinació es mostra en miniatura a la casella d'origen: així es veu on anirà a parar.
      var other = photos[swap.to];
      if (other && other.img) {
        var mini = 0.55;
        var mw = from.w * mini, mh = from.h * mini;
        var mx = from.x + (from.w - mw) / 2, my = from.y + (from.h - mh) / 2;
        ctx.save();
        ctx.globalAlpha = 0.9;
        shapePath(ctx, { x: mx, y: my, w: mw, h: mh, shape: shape, radius: radius * mini }, s);
        ctx.clip();
        var oc = layout.cropFor(other.img, mw, mh, other.zoom, other.offX, other.offY);
        ctx.drawImage(other.img, oc.sx, oc.sy, oc.sw, oc.sh, mx * s, my * s, mw * s, mh * s);
        ctx.restore();
      }
      highlight(ctx, to, s, (dpr || 1) * 1.6);
    }

    // Foto "agafada" que segueix el punter.
    var scale = 0.82;
    var gw = from.w * scale, gh = from.h * scale;
    var gx = swap.px - gw / 2, gy = swap.py - gh / 2;
    var crop = layout.cropFor(photo.img, from.w, from.h, photo.zoom, photo.offX, photo.offY);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 14 * (dpr || 1);
    ctx.shadowOffsetY = 4 * (dpr || 1);
    shapePath(ctx, { x: gx, y: gy, w: gw, h: gh, shape: shape, radius: radius * scale }, s);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.92;
    shapePath(ctx, { x: gx, y: gy, w: gw, h: gh, shape: shape, radius: radius * scale }, s);
    ctx.clip();
    ctx.drawImage(photo.img, crop.sx, crop.sy, crop.sw, crop.sh, gx * s, gy * s, gw * s, gh * s);
    ctx.restore();
  }

  /** Compon la pàgina sencera en un canvas nou, a la resolució demanada. */
  function toCanvas(state, mode, pxPerMm) {
    var page = layout.compute(state, mode);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(page.page.w * pxPerMm);
    canvas.height = Math.round(page.page.h * pxPerMm);
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    draw(ctx, page.ops, pxPerMm);
    return canvas;
  }

  return {
    draw: draw,
    highlight: highlight,
    swapPreview: swapPreview,
    shapePath: shapePath,
    toCanvas: toCanvas,
    drawPattern: drawPattern,
    isDecorated: isDecorated,
    backgroundCanvas: backgroundCanvas
  };
})(window.Orla.layout);
