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

      if (op.t === 'rect') {
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
  function highlight(ctx, cell, s) {
    var pad = 1.2 * s;
    ctx.save();
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = Math.max(1.5, 0.35 * s);
    ctx.strokeRect(cell.x * s - pad, cell.y * s - pad, cell.w * s + pad * 2, cell.h * s + pad * 2);
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

  return { draw: draw, highlight: highlight, shapePath: shapePath, toCanvas: toCanvas };
})(window.Orla.layout);
