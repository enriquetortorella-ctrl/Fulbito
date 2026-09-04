/* Browser-only regression: a rectangular DOM card is not its painted shield.
   Sample the original same-origin frame alpha underneath the OVR, including
   a small safety margin, so transparent shoulders cannot pass a bounds test. */
(function () {
  'use strict';

  const frameCache = new Map();
  const numeric = value => Number.parseFloat(value) || 0;

  function loadFrame(url) {
    if (!frameCache.has(url)) frameCache.set(url, new Promise((resolve, reject) => {
      const picture = new Image();
      const timer = setTimeout(() => reject(new Error('frame-load-timeout')), 5000);
      picture.onload = () => {
        clearTimeout(timer);
        try {
          if (!picture.naturalWidth || !picture.naturalHeight) throw new Error('empty-frame');
          const canvas = document.createElement('canvas');
          canvas.width = picture.naturalWidth;
          canvas.height = picture.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('canvas-unavailable');
          context.drawImage(picture, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          resolve({ width: canvas.width, height: canvas.height, pixels });
        } catch (error) { reject(error); }
      };
      picture.onerror = () => { clearTimeout(timer); reject(new Error('frame-load-failed')); };
      picture.src = url;
    }));
    return frameCache.get(url);
  }

  function length(value, reference) {
    if (value.endsWith('%')) return numeric(value) * reference / 100;
    if (/^-?[\d.]+px$/.test(value) || value === '0') return numeric(value);
    throw new Error(`unsupported-frame-length-${value}`);
  }

  function frameSize(value, width, height, image) {
    if (value === 'contain' || value === 'cover') {
      const factor = Math[value === 'contain' ? 'min' : 'max'](width / image.width, height / image.height);
      return [image.width * factor, image.height * factor];
    }
    const parts = value.trim().split(/\s+/);
    if (parts.length === 1) parts.push('auto');
    if (parts.length !== 2) throw new Error('unsupported-frame-size');
    let w = parts[0] === 'auto' ? null : length(parts[0], width);
    let h = parts[1] === 'auto' ? null : length(parts[1], height);
    if (w === null && h === null) { w = image.width; h = image.height; }
    else if (w === null) w = h * image.width / image.height;
    else if (h === null) h = w * image.height / image.width;
    if (!(w > 0 && h > 0)) throw new Error('empty-painted-frame');
    return [w, h];
  }

  function position(value, available) {
    if (value === 'center') return available / 2;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return available;
    return length(value, available);
  }

  function opaqueAt(image, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) return 0;
    return image.pixels[(iy * image.width + ix) * 4 + 3];
  }

  window.checkCardFrameSafety = async function (cards = document.querySelectorAll('.fifa-card'), options = {}) {
    const issues = [];
    const margin = options.marginPx ?? 2;
    const minimumAlpha = options.minimumAlpha ?? 192;
    for (const [index, card] of Array.from(cards).entries()) {
      const label = `painted-frame-${index}`;
      try {
        const overall = card.querySelector('.fifa-card-overall');
        if (!overall || !overall.getClientRects().length || !card.getClientRects().length) continue;
        const box = card.getBoundingClientRect(), ovr = overall.getBoundingClientRect();
        if (!box.width || !box.height || !ovr.width || !ovr.height) continue;
        const style = getComputedStyle(card), frameStyle = getComputedStyle(card, '::before');
        // The check must run at rest: an axis-aligned bounding box cannot undo
        // perspective/rotation. Reject such a fixture instead of silently passing.
        if (style.transform !== 'none') throw new Error('check-requires-resting-card');
        const source = /^url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)$/.exec(frameStyle.backgroundImage);
        if (!source) throw new Error('single-frame-image-missing');
        const url = new URL(source[1] || source[2] || source[3], location.href);
        if (url.origin !== location.origin) throw new Error('frame-must-be-same-origin');
        const image = await loadFrame(url.href);
        if (numeric(frameStyle.opacity) < .9 || frameStyle.visibility === 'hidden' || frameStyle.display === 'none') throw new Error('frame-not-visible');
        const frameWidth = numeric(frameStyle.width) || box.width;
        const frameHeight = numeric(frameStyle.height) || box.height;
        const [paintWidth, paintHeight] = frameSize(frameStyle.backgroundSize, frameWidth, frameHeight, image);
        const pos = frameStyle.backgroundPosition.trim().split(/\s+/);
        if (pos.length !== 2) throw new Error('unsupported-frame-position');
        const originX = numeric(frameStyle.left) + position(pos[0], frameWidth - paintWidth);
        const originY = numeric(frameStyle.top) + position(pos[1], frameHeight - paintHeight);
        const left = ovr.left - box.left - margin, top = ovr.top - box.top - margin;
        const width = ovr.width + margin * 2, height = ovr.height + margin * 2;
        // Include every edge and the interior at <= 3 CSS px spacing. This
        // catches curved shoulders and holes, not just the rectangle corners.
        const columns = Math.max(2, Math.ceil(width / 3));
        const rows = Math.max(2, Math.ceil(height / 3));
        let outside = 0, sampled = 0;
        for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
          const x = (left + width * col / columns - originX) / paintWidth * image.width;
          const y = (top + height * row / rows - originY) / paintHeight * image.height;
          if (opaqueAt(image, x, y) < minimumAlpha) outside++;
          sampled++;
        }
        if (outside) issues.push(`${label}-ovr-outside-silhouette-${outside}-of-${sampled}`);
      } catch (error) { issues.push(`${label}-${error.message}`); }
    }
    return issues;
  };
})();
