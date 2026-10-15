/* Orles — càlcul de la composició.
   Produeix una llista d'operacions de dibuix independent del suport
   (pantalla o PDF), sempre expressada en mil·límetres de pàgina. */

window.Orla = window.Orla || {};

window.Orla.layout = (function (templates) {
  'use strict';

  var FAMILIES = {
    serif: '"Times New Roman", Times, serif',
    sans: 'Helvetica, Arial, sans-serif'
  };

  var REF = 100; // mida de referència per mesurar text
  var measureCtx = document.createElement('canvas').getContext('2d');

  function cssFont(family, weight, sizePx) {
    return weight + ' ' + sizePx + 'px ' + (FAMILIES[family] || FAMILIES.sans);
  }

  /** Amplada del text en mil·límetres, incloent-hi l'interlletratge. */
  function textWidth(str, family, weight, size, tracking) {
    if (!str) return 0;
    measureCtx.font = cssFont(family, weight, REF);
    var natural = measureCtx.measureText(str).width / REF * size;
    return natural + (tracking || 0) * Math.max(0, str.length - 1);
  }

  /** Redueix la mida i, si cal, escurça el text perquè càpiga a `maxWidth`. */
  function fitText(str, family, weight, size, tracking, maxWidth, minRatio) {
    var out = { str: str, size: size };
    if (!str) return out;
    var min = size * (minRatio || 0.75);
    while (out.size > min && textWidth(out.str, family, weight, out.size, tracking) > maxWidth) {
      out.size -= size * 0.02;
    }
    if (textWidth(out.str, family, weight, out.size, tracking) > maxWidth) {
      var cut = out.str;
      while (cut.length > 1 && textWidth(cut + '…', family, weight, out.size, tracking) > maxWidth) {
        cut = cut.slice(0, -1);
      }
      out.str = cut.replace(/\s+$/, '') + '…';
    }
    return out;
  }

  /**
   * Retalla la imatge per omplir un marc (cover) amb escala i desplaçament.
   * Els desplaçaments van de -0,5 a 0,5 i són relatius al marge sobrant.
   */
  function cropFor(img, frameW, frameH, zoom, offX, offY) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var target = frameW / frameH;
    var sw, sh;
    if (iw / ih > target) {
      sh = ih;
      sw = ih * target;
    } else {
      sw = iw;
      sh = iw / target;
    }
    sw /= (zoom || 1);
    sh /= (zoom || 1);
    var sx = (iw - sw) * (0.5 + (offX || 0));
    var sy = (ih - sh) * (0.5 + (offY || 0));
    return {
      sx: Math.max(0, Math.min(iw - sw, sx)),
      sy: Math.max(0, Math.min(ih - sh, sy)),
      sw: sw,
      sh: sh
    };
  }

  /**
   * Calcula tota la pàgina.
   * @param {object} state configuració i fotografies
   * @param {string} mode 'screen' (amb caselles buides) o 'print'
   */
  function compute(state, mode) {
    var page = templates.pageDimensions(state.pageSize, state.orientation);
    var m = state.margin;
    var contentW = Math.max(10, page.w - 2 * m);
    var ink = state.textColor;
    var fam = state.font;
    var ops = [];

    ops.push({
      t: 'background', x: 0, y: 0, w: page.w, h: page.h,
      color: state.bgColor,
      pattern: state.bgPattern,
      patternColor: state.bgPatternColor,
      patternOpacity: state.bgPatternOpacity,
      patternScale: state.bgPatternScale,
      border: state.bgBorder,
      borderColor: state.bgBorderColor,
      borderOpacity: state.bgBorderOpacity,
      borderScale: state.bgBorderScale,
      inset: m * 0.4,
      image: state.bgImage || null,
      imageFit: state.bgImageFit,
      imageOpacity: state.bgImageOpacity
    });

    /* --- Capçalera --- */

    var titleSize = page.w * 0.046 * state.titleScale;
    var subSize = titleSize * 0.42;
    var footSize = titleSize * 0.30;
    var titleTrack = titleSize * 0.07;
    var subTrack = subSize * 0.12;

    var seal = state.sealImg;
    var sealPos = state.sealPos;
    var sealH = 0;
    var sealW = 0;
    if (seal) {
      sealH = state.sealSize;
      sealW = sealH * ((seal.naturalWidth || 1) / (seal.naturalHeight || 1));
      var maxSealW = contentW * (sealPos === 'top' ? 0.5 : 0.28);
      if (sealW > maxSealW) {
        sealH = sealH * (maxSealW / sealW);
        sealW = maxSealW;
      }
    }

    var sideSeal = seal && (sealPos === 'left' || sealPos === 'right');
    var textMaxW = sideSeal ? contentW - 2 * (sealW + titleSize * 0.4) : contentW;

    var title = fitText(state.title.trim(), fam, 'normal', titleSize, titleTrack, textMaxW, 0.5);
    var subtitle = fitText(state.subtitle.trim(), fam, 'normal', subSize, subTrack, textMaxW, 0.6);

    var titleLine = title.str ? titleSize * 1.12 : 0;
    var subLine = subtitle.str ? subSize * 1.7 : 0;
    var textH = titleLine + subLine;

    var headerH;
    if (seal && sealPos === 'top') {
      headerH = sealH + (textH > 0 ? titleSize * 0.45 : 0) + textH;
    } else if (seal) {
      headerH = Math.max(sealH, textH);
    } else {
      headerH = textH;
    }

    var textTop = m;
    if (seal && sealPos === 'top') {
      textTop = m + sealH + (textH > 0 ? titleSize * 0.45 : 0);
    } else if (seal) {
      textTop = m + (headerH - textH) / 2;
    }

    if (seal) {
      var sealX = sealPos === 'left' ? m
        : sealPos === 'right' ? page.w - m - sealW
        : (page.w - sealW) / 2;
      var sealY = sealPos === 'top' ? m : m + (headerH - sealH) / 2;
      ops.push({ t: 'image', img: seal, x: sealX, y: sealY, w: sealW, h: sealH, shape: 'rect', alpha: true });
    }

    if (title.str) {
      ops.push({
        t: 'text', str: title.str, family: fam, weight: 'normal', size: title.size,
        tracking: titleTrack, color: ink,
        x: page.w / 2 - textWidth(title.str, fam, 'normal', title.size, titleTrack) / 2,
        y: textTop + title.size * 0.84
      });
    }

    if (subtitle.str) {
      ops.push({
        t: 'text', str: subtitle.str, family: fam, weight: 'normal', size: subtitle.size,
        tracking: subTrack, color: ink,
        x: page.w / 2 - textWidth(subtitle.str, fam, 'normal', subtitle.size, subTrack) / 2,
        y: textTop + titleLine + subtitle.size * 1.1
      });
    }

    var gridTop = m;
    if (headerH > 0) {
      if (state.rule) {
        var ruleY = m + headerH + titleSize * 0.42;
        ops.push({ t: 'line', x1: m, y1: ruleY, x2: page.w - m, y2: ruleY, color: ink, lw: 0.25 });
        gridTop = ruleY + titleSize * 0.55;
      } else {
        gridTop = m + headerH + titleSize * 0.6;
      }
    }

    /* --- Peu de pàgina --- */

    var footText = fitText(state.footer.trim(), fam, 'normal', footSize, footSize * 0.1, contentW, 0.6);
    var footReserve = footText.str ? footSize * 2.4 : 0;
    if (footText.str) {
      ops.push({
        t: 'text', str: footText.str, family: fam, weight: 'normal', size: footText.size,
        tracking: footSize * 0.1, color: ink,
        x: page.w / 2 - textWidth(footText.str, fam, 'normal', footText.size, footSize * 0.1) / 2,
        y: page.h - m - footText.size * 0.5
      });
    }

    /* --- Graella --- */

    var availH = Math.max(10, page.h - m - footReserve - gridTop);
    var aspect = templates.ASPECTS[state.aspect] || 0.75;
    var gap = state.gap;
    var nameBlock = state.showNames ? 0.055 + 0.13 * state.nameScale : 0;
    var cellRatio = 1 / aspect + nameBlock;

    var photos = state.photos;
    var n = photos.length;
    var cols, tplRows;

    if (state.matrix === 'auto') {
      cols = templates.bestColumns(n || 12, contentW, availH, gap, cellRatio);
      tplRows = Math.ceil((n || 12) / cols);
    } else {
      var parts = state.matrix.split('x');
      cols = parseInt(parts[0], 10) || 4;
      tplRows = parseInt(parts[1], 10) || 5;
    }

    var rows = n > 0 ? Math.ceil(n / cols) : tplRows;
    var slots = n > 0 ? n : cols * tplRows;

    var cellW = Math.min(
      (contentW - gap * (cols - 1)) / cols,
      (availH - gap * (rows - 1)) / (rows * cellRatio)
    );
    cellW = Math.max(1, cellW);
    var photoH = cellW / aspect;
    var cellH = cellW * cellRatio;

    var gridW = cols * cellW + gap * (cols - 1);
    var gridH = rows * cellH + gap * (rows - 1);
    var originX = m + (contentW - gridW) / 2;
    var originY = gridTop + Math.max(0, (availH - gridH)) / 2;

    var nameSize = cellW * 0.105 * state.nameScale;
    var nameGap = cellW * 0.055;
    var cells = [];

    for (var i = 0; i < slots; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var inRow = Math.min(cols, slots - row * cols);
      var shift = (state.centerLast && inRow < cols) ? (cols - inRow) * (cellW + gap) / 2 : 0;
      var x = originX + col * (cellW + gap) + shift;
      var y = originY + row * (cellH + gap);
      var photo = photos[i] || null;

      cells.push({ index: i, x: x, y: y, w: cellW, h: photoH });

      if (photo && photo.img) {
        ops.push({
          t: 'image',
          img: photo.img,
          crop: cropFor(photo.img, cellW, photoH, photo.zoom, photo.offX, photo.offY),
          x: x, y: y, w: cellW, h: photoH,
          shape: state.shape,
          radius: cellW * 0.07
        });
      } else if (mode !== 'print') {
        ops.push({
          t: 'shape', x: x, y: y, w: cellW, h: photoH,
          shape: state.shape, radius: cellW * 0.07,
          fill: '#f1f1ee', stroke: '#c9c9c3', lw: 0.2, dash: true
        });
      }

      if (photo && state.frame) {
        ops.push({
          t: 'shape', x: x, y: y, w: cellW, h: photoH,
          shape: state.shape, radius: cellW * 0.07,
          stroke: ink, lw: 0.2
        });
      }

      if (state.showNames && photo) {
        var name = fitText(photo.name || '', fam, 'normal', nameSize, 0, cellW * 0.98, 0.7);
        if (name.str) {
          ops.push({
            t: 'text', str: name.str, family: fam, weight: 'normal', size: name.size, color: ink,
            x: x + cellW / 2 - textWidth(name.str, fam, 'normal', name.size, 0) / 2,
            y: y + photoH + nameGap + name.size * 0.8
          });
        }
      }
    }

    return {
      page: page,
      ops: ops,
      cells: cells,
      cols: cols,
      rows: rows,
      capacity: cols * tplRows
    };
  }

  return {
    compute: compute,
    cropFor: cropFor,
    cssFont: cssFont,
    textWidth: textWidth,
    FAMILIES: FAMILIES
  };
})(window.Orla.templates);
