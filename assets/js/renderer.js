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

  /** Fulla amb la base a l'origen i la punta a (len, 0), en píxels. */
  function leafPath(ctx, len, wid) {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.85, len, 0);
    ctx.bezierCurveTo(len * 0.7, wid * 0.85, len * 0.25, wid, 0, 0);
  }

  /** Executa `fn` amb l'origen a (x, y) píxels i girat `angle` radiants. */
  function withFrame(ctx, x, y, angle, fn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    fn();
    ctx.restore();
  }

  /**
   * Reparteix motius de manera regular però no rígida (graella al portell amb
   * una petita variació aleatòria). Les coordenades que rep `fn` són en mm.
   */
  function scatter(w, h, step, seed, fn) {
    var rnd = seeded(seed);
    for (var row = 0, y = 0; y < h + step; y += step, row++) {
      for (var x = (row % 2 ? 0 : -step / 2); x < w + step; x += step) {
        fn(x + (rnd() - 0.5) * step * 0.6, y + (rnd() - 0.5) * step * 0.6, rnd);
      }
    }
  }

  /**
   * Dibuixa un estampat decoratiu sobre l'àrea (w × h mm) amb origen a 0,0.
   * Totes les mesures són en mil·límetres i s'escalen amb `k`.
   */
  function drawPattern(ctx, kind, w, h, s, color, k) {
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

    /* --- Natura --- */

    } else if (kind === 'leaves') {
      ctx.lineWidth = Math.max(0.5, 0.18 * s);
      scatter(w, h, 13 * k, 7, function (x, y, rnd) {
        var len = (5 + rnd() * 3) * k * s;
        var outline = rnd() < 0.35;
        withFrame(ctx, x * s, y * s, rnd() * Math.PI * 2, function () {
          ctx.beginPath();
          leafPath(ctx, len, len * 0.36);
          if (outline) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(len * 0.9, 0);
          } else {
            ctx.fill();
            ctx.beginPath();
          }
          ctx.moveTo(0, 0);
          ctx.lineTo(-len * 0.16, 0);
          ctx.stroke();
        });
      });

    } else if (kind === 'sprigs') {
      ctx.lineWidth = Math.max(0.5, 0.2 * s);
      scatter(w, h, 22 * k, 11, function (x, y, rnd) {
        var len = (9 + rnd() * 3) * k * s;
        var bend = (rnd() - 0.5) * 0.3 * len;
        withFrame(ctx, x * s, y * s, rnd() * Math.PI * 2, function () {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(len / 2, bend, len, 0);
          ctx.stroke();
          ctx.beginPath();
          [0.3, 0.55, 0.8].forEach(function (t) {
            var py = 2 * (1 - t) * t * bend; // punt de la tija (corba quadràtica)
            var leaf = len * (0.32 - t * 0.12);
            [-1, 1].forEach(function (side) {
              withFrame(ctx, len * t, py, side * 0.75, function () { leafPath(ctx, leaf, leaf * 0.38); });
            });
          });
          withFrame(ctx, len, 0, 0, function () { leafPath(ctx, len * 0.2, len * 0.075); });
          ctx.fill();
        });
      });

    } else if (kind === 'ginkgo') {
      ctx.lineWidth = Math.max(0.5, 0.2 * s);
      scatter(w, h, 15 * k, 23, function (x, y, rnd) {
        var r = (3.6 + rnd() * 1.4) * k * s;
        var mid = -Math.PI / 2;
        withFrame(ctx, x * s, y * s, rnd() * Math.PI * 2, function () {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r, mid - 0.95, mid - 0.06);
          ctx.lineTo(0, -r * 0.78);
          ctx.arc(0, 0, r, mid + 0.06, mid + 0.95);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, r * 0.7);
          ctx.stroke();
        });
      });

    } else if (kind === 'flowers') {
      ctx.lineWidth = Math.max(0.5, 0.18 * s);
      scatter(w, h, 12 * k, 31, function (x, y, rnd) {
        var r = (1.3 + rnd() * 0.6) * k * s;
        withFrame(ctx, x * s, y * s, rnd() * Math.PI, function () {
          ctx.beginPath();
          for (var p = 0; p < 5; p++) {
            var a = p * Math.PI * 2 / 5;
            var cx = Math.cos(a) * r * 0.9;
            var cy = Math.sin(a) * r * 0.9;
            ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
            ctx.ellipse(cx, cy, r * 0.7, r * 0.4, a, 0, Math.PI * 2);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
          ctx.fill();
        });
      });

    } else if (kind === 'ferns') {
      ctx.lineWidth = Math.max(0.5, 0.16 * s);
      scatter(w, h, 20 * k, 41, function (x, y, rnd) {
        var len = (11 + rnd() * 4) * k * s;
        var bend = (rnd() - 0.5) * 0.35 * len;
        withFrame(ctx, x * s, y * s, rnd() * Math.PI * 2, function () {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(len / 2, bend, len, 0);
          for (var n = 1; n <= 9; n++) {
            var t = n / 10;
            var px = len * t;
            var py = 2 * (1 - t) * t * bend;
            var leaf = len * 0.22 * (1 - t * 0.75);
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(0.9) * leaf, py - Math.sin(0.9) * leaf);
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(0.9) * leaf, py + Math.sin(0.9) * leaf);
          }
          ctx.stroke();
        });
      });

    /* --- Minimalistes --- */

    } else if (kind === 'crosses') {
      step = 10 * k;
      var arm = 0.9 * k;
      ctx.lineWidth = Math.max(0.5, 0.22 * s);
      ctx.beginPath();
      for (y = step / 2, i = 0; y < h + step; y += step, i++) {
        for (x = (i % 2 ? step / 2 : 0); x < w + step; x += step) {
          ctx.moveTo((x - arm) * s, y * s);
          ctx.lineTo((x + arm) * s, y * s);
          ctx.moveTo(x * s, (y - arm) * s);
          ctx.lineTo(x * s, (y + arm) * s);
        }
      }
      ctx.stroke();

    } else if (kind === 'pinstripe') {
      step = 4 * k;
      ctx.lineWidth = Math.max(0.5, 0.12 * s);
      ctx.beginPath();
      for (x = step / 2; x < w; x += step) { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, h * s); }
      ctx.stroke();

    } else if (kind === 'scales' || kind === 'deco') {
      // Escates: semicercles cap avall. Art déco: ventalls concèntrics cap amunt.
      var deco = kind === 'deco';
      var rad = (deco ? 6 : 4) * k;
      var rings = deco ? [1, 0.66, 0.33] : [1];
      ctx.lineWidth = Math.max(0.5, 0.2 * s);
      ctx.beginPath();
      for (y = 0, i = 0; y < h + 2 * rad; y += rad, i++) {
        for (x = (i % 2 ? rad : 0); x < w + 2 * rad; x += 2 * rad) {
          rings.forEach(function (f) {
            var rr = rad * f * s;
            if (deco) {
              ctx.moveTo(x * s - rr, y * s);
              ctx.arc(x * s, y * s, rr, Math.PI, Math.PI * 2);
            } else {
              ctx.moveTo(x * s + rr, y * s);
              ctx.arc(x * s, y * s, rr, 0, Math.PI);
            }
          });
        }
      }
      ctx.stroke();

    } else if (kind === 'terrazzo') {
      scatter(w, h, 7 * k, 53, function (x, y, rnd) {
        var r = (0.5 + rnd() * 1.1) * k * s;
        var sides = 4 + Math.floor(rnd() * 3);
        var rot = rnd() * Math.PI * 2;
        ctx.beginPath();
        for (var p = 0; p < sides; p++) {
          var a = rot + p * Math.PI * 2 / sides;
          var rr = r * (0.6 + rnd() * 0.4);
          var px = x * s + Math.cos(a) * rr;
          var py = y * s + Math.sin(a) * rr;
          if (p) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.restore();
  }

  /* ---------- Senefes ---------- */

  /**
   * Dibuixa un costat de la senefa en un marc local: x avança pel costat
   * (de 0 a L mm) i y apunta cap a l'interior de la pàgina.
   */
  function borderSide(ctx, kind, L, k, s) {
    var K = k * s;        // píxels per unitat d'escala
    var Lp = L * s;
    var B = 4 * K;        // amplada de la banda
    var j;

    /** Reparteix motius de mida aproximada `unit` entre les dues cantonades. */
    function span(unit, fn) {
      var from = B, to = Lp - B;
      if (to <= from) return;
      var n = Math.max(1, Math.round((to - from) / unit));
      var u = (to - from) / n;
      for (j = 0; j < n; j++) fn(from + j * u, u, j);
    }

    function line(y, x1, x2, width) {
      ctx.lineWidth = Math.max(0.5, width * K);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }

    function dot(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (kind === 'line') {
      line(0, 0, Lp, 0.3);

    } else if (kind === 'frame') {
      var g = 1.6 * K;
      line(0, 0, Lp, 0.6);
      line(g, g, Lp - g, 0.2);
      ctx.beginPath();
      ctx.moveTo(0, -g);
      ctx.lineTo(g, 0);
      ctx.lineTo(0, g);
      ctx.lineTo(-g, 0);
      ctx.closePath();
      ctx.fill();

    } else if (kind === 'greek') {
      var q = B / 5;
      line(0, 0, Lp, 0.22);
      line(B, 0, Lp, 0.22);
      ctx.lineWidth = Math.max(0.5, 0.22 * K);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      span(5 * q, function (x, u) {
        ctx.moveTo(x + u * 0.1, B);
        ctx.lineTo(x + u * 0.1, q);
        ctx.lineTo(x + u * 0.9, q);
        ctx.lineTo(x + u * 0.9, 4 * q);
        ctx.lineTo(x + u * 0.5, 4 * q);
        ctx.lineTo(x + u * 0.5, 2.5 * q);
      });
      ctx.rect(B * 0.3, B * 0.3, B * 0.4, B * 0.4);
      ctx.stroke();

    } else if (kind === 'laurel') {
      line(B / 2, B, Lp - B, 0.18);
      ctx.beginPath();
      // Fulles alternes a banda i banda de la tija, com una branca de llorer.
      span(1.7 * K, function (x, u, n) {
        var side = n % 2 ? 1 : -1;
        withFrame(ctx, x, B / 2, side * 0.5, function () { leafPath(ctx, 2.6 * K, 0.5 * K); });
      });
      ctx.fill();
      dot(B / 2, B / 2, 0.6 * K);
      ctx.lineWidth = Math.max(0.5, 0.15 * K);
      ctx.beginPath();
      ctx.arc(B / 2, B / 2, 1.2 * K, 0, Math.PI * 2);
      ctx.stroke();

    } else if (kind === 'vine') {
      var amp = 0.7 * K;
      var mid = B / 2;
      ctx.lineWidth = Math.max(0.5, 0.18 * K);
      ctx.beginPath();
      ctx.moveTo(B, mid);
      var leaves = [];
      span(4 * K, function (x, u, n) {
        var dir = n % 2 ? 1 : -1;
        ctx.quadraticCurveTo(x + u / 2, mid + dir * amp * 2, x + u, mid);
        leaves.push([x + u / 2, mid + dir * amp, dir]);
      });
      ctx.stroke();
      ctx.beginPath();
      leaves.forEach(function (l) {
        withFrame(ctx, l[0], l[1], l[2] * 0.9, function () { leafPath(ctx, 1.4 * K, 0.55 * K); });
      });
      ctx.fill();
      ctx.beginPath();
      for (var p = 0; p < 5; p++) {
        var a = p * Math.PI * 2 / 5;
        ctx.moveTo(mid + Math.cos(a) * 0.6 * K + 0.42 * K, mid + Math.sin(a) * 0.6 * K);
        ctx.arc(mid + Math.cos(a) * 0.6 * K, mid + Math.sin(a) * 0.6 * K, 0.42 * K, 0, Math.PI * 2);
      }
      ctx.fill();

    } else if (kind === 'beads') {
      line(0, 0, Lp, 0.15);
      line(B, 0, Lp, 0.15);
      ctx.lineWidth = Math.max(0.5, 0.35 * K);
      ctx.beginPath();
      span(3 * K, function (x, u) {
        ctx.moveTo(x + u * 0.25 + 0.5 * K, B / 2);
        ctx.arc(x + u * 0.25, B / 2, 0.5 * K, 0, Math.PI * 2);
      });
      ctx.fill();
      ctx.beginPath();
      span(3 * K, function (x, u) {
        ctx.moveTo(x + u * 0.55, B / 2);
        ctx.lineTo(x + u * 0.92, B / 2);
      });
      ctx.stroke();
      dot(B / 2, B / 2, 0.85 * K);

    } else if (kind === 'scallop') {
      line(0, 0, Lp, 0.2);
      ctx.lineWidth = Math.max(0.5, 0.2 * K);
      ctx.beginPath();
      span(3 * K, function (x, u) {
        ctx.moveTo(x + u, 0);
        ctx.arc(x + u / 2, 0, u / 2, 0, Math.PI);
      });
      ctx.stroke();
      ctx.beginPath();
      span(3 * K, function (x, u) {
        ctx.moveTo(x + u / 2 + 0.25 * K, u * 0.24);
        ctx.arc(x + u / 2, u * 0.24, 0.25 * K, 0, Math.PI * 2);
      });
      ctx.fill();
      dot(B * 0.45, B * 0.45, 0.6 * K);

    } else if (kind === 'corners') {
      var arm = Math.min(14 * K, Lp * 0.4);
      var c = 1.4 * K;
      var drawArm = function () {
        line(0, 0, arm, 0.4);
        line(c, c, arm * 0.7, 0.15);
        ctx.lineWidth = Math.max(0.5, 0.25 * K);
        ctx.beginPath();
        ctx.arc(arm + 0.6 * K, 0, 0.6 * K, Math.PI, Math.PI * 2.75);
        ctx.stroke();
        dot(arm * 0.7, c, 0.28 * K);
      };
      drawArm();
      ctx.save();
      ctx.translate(Lp, 0);
      ctx.scale(-1, 1);
      drawArm();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(c, c - 0.8 * K);
      ctx.lineTo(c + 0.8 * K, c);
      ctx.lineTo(c, c + 0.8 * K);
      ctx.lineTo(c - 0.8 * K, c);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Dibuixa una senefa al voltant de l'àrea w × h mm, a `inset` mm de la vora. */
  function drawBorder(ctx, kind, w, h, s, color, k, inset) {
    if (!kind || kind === 'none') return;
    var d = inset || 6;
    var sides = [
      { x: d, y: d, a: 0, len: w - 2 * d },
      { x: w - d, y: d, a: Math.PI / 2, len: h - 2 * d },
      { x: w - d, y: h - d, a: Math.PI, len: w - 2 * d },
      { x: d, y: h - d, a: -Math.PI / 2, len: h - 2 * d }
    ];
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    sides.forEach(function (side) {
      ctx.save();
      ctx.translate(side.x * s, side.y * s);
      ctx.rotate(side.a);
      borderSide(ctx, kind, side.len, k, s);
      ctx.restore();
    });
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
      drawPattern(ctx, op.pattern, op.w, op.h, s, op.patternColor, op.patternScale);
      ctx.restore();
    }

    if (op.border && op.border !== 'none') {
      ctx.save();
      ctx.globalAlpha = op.borderOpacity;
      drawBorder(ctx, op.border, op.w, op.h, s, op.borderColor, op.borderScale, op.inset);
      ctx.restore();
    }
  }

  /** Indica si el fons té res més que un color pla. */
  function isDecorated(op) {
    return !!op.image ||
      (!!op.pattern && op.pattern !== 'none') ||
      (!!op.border && op.border !== 'none');
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
      op.patternScale, op.inset, op.image ? op.image.src : '', op.imageFit, op.imageOpacity,
      op.border, op.borderColor, op.borderOpacity, op.borderScale].join('|');
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
    drawBorder: drawBorder,
    isDecorated: isDecorated,
    backgroundCanvas: backgroundCanvas
  };
})(window.Orla.layout);
