/* Orles — plantilles i constants de pàgina.
   Totes les mesures són en mil·límetres. */

window.Orla = window.Orla || {};

window.Orla.templates = (function () {
  'use strict';

  /** Mides de pàgina en vertical (amplada × alçada). */
  var PAGE_SIZES = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
    A2: { w: 420, h: 594 },
    Carta: { w: 215.9, h: 279.4 }
  };

  /** Proporcions disponibles per a les fotografies (amplada / alçada). */
  var ASPECTS = {
    '3:4': 3 / 4,
    '4:5': 4 / 5,
    '1:1': 1,
    '4:3': 4 / 3
  };

  /**
   * Retorna les dimensions de la pàgina segons la mida i l'orientació.
   * @returns {{w:number, h:number}}
   */
  function pageDimensions(size, orientation) {
    var base = PAGE_SIZES[size] || PAGE_SIZES.A4;
    return orientation === 'landscape'
      ? { w: base.h, h: base.w }
      : { w: base.w, h: base.h };
  }

  /**
   * Tria el nombre de columnes que maximitza la mida de cada foto dins
   * de l'àrea disponible. S'utilitza amb la plantilla automàtica.
   */
  function bestColumns(count, areaW, areaH, gap, cellRatio) {
    if (count < 1) return 1;
    var best = 1;
    var bestSize = -1;
    for (var cols = 1; cols <= Math.min(12, count); cols++) {
      var rows = Math.ceil(count / cols);
      var byWidth = (areaW - gap * (cols - 1)) / cols;
      var byHeight = (areaH - gap * (rows - 1)) / (rows * cellRatio);
      var size = Math.min(byWidth, byHeight);
      if (size > bestSize + 0.001) {
        bestSize = size;
        best = cols;
      }
    }
    return best;
  }

  return {
    PAGE_SIZES: PAGE_SIZES,
    ASPECTS: ASPECTS,
    pageDimensions: pageDimensions,
    bestColumns: bestColumns
  };
})();
