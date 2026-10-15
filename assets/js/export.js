/* Orles — exportació a PDF i PNG.
   El PDF combina text vectorial (nítid a qualsevol escala) amb les
   fotografies rasteritzades a la resolució triada. */

window.Orla = window.Orla || {};

window.Orla.exporter = (function (layout, renderer) {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  var BG_MAX_DPI = 200;

  function hexToRgb(hex) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function slug(text, fallback) {
    var s = String(text || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || fallback;
  }

  /**
   * Cedeix el control a la interfície perquè pugui repintar.
   * No depèn només de requestAnimationFrame: si la pestanya no genera
   * fotogrames (per exemple, en segon pla), el temporitzador la desbloqueja.
   */
  function yieldToUi() {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(finish);
      setTimeout(finish, 30);
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /**
   * Rasteritza una operació d'imatge (amb la seva forma) a un canvas propi.
   * `background` és el color de fons o bé { canvas, pxPerMm } quan el fons
   * és decorat: llavors se'n copia el tros que queda sota la foto.
   */
  function rasterize(op, pxPerMm, background) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(op.w * pxPerMm));
    canvas.height = Math.max(1, Math.round(op.h * pxPerMm));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (!op.alpha) {
      if (background && background.canvas) {
        var b = background.pxPerMm;
        ctx.drawImage(background.canvas, op.x * b, op.y * b, op.w * b, op.h * b, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    var local = {
      x: 0, y: 0, w: op.w, h: op.h,
      shape: op.shape, radius: op.radius
    };
    ctx.save();
    renderer.shapePath(ctx, local, pxPerMm);
    ctx.clip();
    var c = op.crop;
    if (c) {
      ctx.drawImage(op.img, c.sx, c.sy, c.sw, c.sh, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(op.img, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    return canvas;
  }

  /** Construeix el document PDF complet. */
  async function buildPdf(state, dpi) {
    var ctor = window.jspdf && window.jspdf.jsPDF;
    if (!ctor) throw new Error('No s\'ha pogut carregar la llibreria de PDF.');

    var composed = layout.compute(state, 'print');
    var page = composed.page;
    var pxPerMm = dpi / 25.4;

    var doc = new ctor({
      orientation: page.w > page.h ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [page.w, page.h],
      compress: true
    });
    doc.setProperties({
      title: state.title.trim() || 'Orla',
      subject: state.subtitle.trim(),
      creator: 'Orles'
    });

    var background = state.bgColor;

    for (var i = 0; i < composed.ops.length; i++) {
      var op = composed.ops[i];

      if (op.t === 'background') {
        if (renderer.isDecorated(op)) {
          // Els estampats i les imatges de fons no necessiten la resolució de les fotos.
          var bgPxPerMm = Math.min(pxPerMm, BG_MAX_DPI / 25.4);
          var bgCanvas = renderer.backgroundCanvas(op, bgPxPerMm);
          background = { canvas: bgCanvas, pxPerMm: bgPxPerMm };
          doc.addImage(bgCanvas.toDataURL('image/jpeg', 0.9), 'JPEG', op.x, op.y, op.w, op.h, undefined, 'FAST');
          await yieldToUi();
        } else {
          var bg = hexToRgb(op.color);
          doc.setFillColor(bg[0], bg[1], bg[2]);
          doc.rect(op.x, op.y, op.w, op.h, 'F');
        }

      } else if (op.t === 'rect') {
        var f = hexToRgb(op.fill);
        doc.setFillColor(f[0], f[1], f[2]);
        doc.rect(op.x, op.y, op.w, op.h, 'F');

      } else if (op.t === 'line') {
        var lc = hexToRgb(op.color);
        doc.setDrawColor(lc[0], lc[1], lc[2]);
        doc.setLineWidth(op.lw);
        doc.line(op.x1, op.y1, op.x2, op.y2);

      } else if (op.t === 'shape') {
        if (!op.stroke) continue;
        var sc = hexToRgb(op.stroke);
        doc.setDrawColor(sc[0], sc[1], sc[2]);
        doc.setLineWidth(op.lw);
        if (op.shape === 'ellipse') {
          doc.ellipse(op.x + op.w / 2, op.y + op.h / 2, op.w / 2, op.h / 2, 'S');
        } else if (op.shape === 'round') {
          var r = Math.min(op.radius, op.w / 2, op.h / 2);
          doc.roundedRect(op.x, op.y, op.w, op.h, r, r, 'S');
        } else {
          doc.rect(op.x, op.y, op.w, op.h, 'S');
        }

      } else if (op.t === 'image') {
        var canvas = rasterize(op, pxPerMm, background);
        if (op.alpha) {
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', op.x, op.y, op.w, op.h, undefined, 'FAST');
        } else {
          doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', op.x, op.y, op.w, op.h, undefined, 'FAST');
        }
        if (i % 6 === 0) await yieldToUi();

      } else if (op.t === 'text') {
        var tc = hexToRgb(op.color);
        doc.setTextColor(tc[0], tc[1], tc[2]);
        doc.setFont(op.family === 'serif' ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(op.size * PT_PER_MM);
        doc.setCharSpace(op.tracking || 0);
        doc.text(op.str, op.x, op.y, { baseline: 'alphabetic' });
        doc.setCharSpace(0);
      }
    }

    return doc;
  }

  /** Genera i descarrega el PDF. */
  async function toPdf(state, dpi) {
    var doc = await buildPdf(state, dpi);
    downloadBlob(doc.output('blob'), slug(state.title, 'orla') + '.pdf');
  }

  /** Genera i descarrega un PNG de la pàgina. */
  async function toPng(state, dpi) {
    var canvas = renderer.toCanvas(state, 'print', dpi / 25.4);
    await yieldToUi();
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        downloadBlob(blob, slug(state.title, 'orla') + '.png');
        resolve();
      }, 'image/png');
    });
  }

  return { buildPdf: buildPdf, toPdf: toPdf, toPng: toPng, slug: slug, yieldToUi: yieldToUi, downloadBlob: downloadBlob };
})(window.Orla.layout, window.Orla.renderer);
