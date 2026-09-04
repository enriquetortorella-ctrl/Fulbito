/* Foil interactivo: decorativo, sin cambiar datos, clics ni gestos táctiles. */
(() => {
  'use strict';
  if (typeof window.matchMedia !== 'function' || typeof window.requestAnimationFrame !== 'function') return;

  const selector = '.fifa-card[role="button"]:not(.card-thumbnail):not(.is-historical)';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const variables = ['--card-rotate-x', '--card-rotate-y', '--card-light-x', '--card-light-y'];
  let activeCard = null;
  let activeRect = null;
  let frame = null;
  let pointerX = 0;
  let pointerY = 0;

  const enabled = () => finePointer.matches && !reducedMotion.matches && !document.hidden;
  const reset = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    observer?.disconnect();
    if (activeCard) {
      activeCard.classList.remove('is-card-tilting');
      variables.forEach(name => activeCard.style.removeProperty(name));
    }
    activeCard = null;
    activeRect = null;
  };
  // Se observa solo durante la interacción, no todo el tiempo ni cada frame.
  const observer = typeof window.MutationObserver === 'function'
    ? new window.MutationObserver(() => {
      if (activeCard && (!activeCard.isConnected || !activeCard.matches(selector))) reset();
    })
    : null;
  const clamp = value => Math.max(0, Math.min(1, value));
  const paint = () => {
    frame = null;
    if (!enabled() || !activeCard?.isConnected || !activeCard.matches(selector)) return reset();
    const x = clamp((pointerX - activeRect.left) / activeRect.width);
    const y = clamp((pointerY - activeRect.top) / activeRect.height);
    activeCard.style.setProperty('--card-rotate-x', `${((.5 - y) * 6).toFixed(2)}deg`);
    activeCard.style.setProperty('--card-rotate-y', `${((x - .5) * 6).toFixed(2)}deg`);
    activeCard.style.setProperty('--card-light-x', `${(x * 100).toFixed(1)}%`);
    activeCard.style.setProperty('--card-light-y', `${(y * 100).toFixed(1)}%`);
    activeCard.classList.add('is-card-tilting');
  };
  document.addEventListener('pointermove', event => {
    // Un equipo híbrido puede informar puntero fino y recibir eventos táctiles.
    if (!enabled() || (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return reset();
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const card = event.target?.closest?.(selector);
    if (!card?.isConnected) return reset();
    if (card !== activeCard) {
      reset();
      const rect = card.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return;
      activeCard = card;
      activeRect = rect;
      if (document.documentElement) observer?.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'role'] });
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (frame === null) frame = window.requestAnimationFrame(paint);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (activeCard?.contains(event.target) && !activeCard.contains(event.relatedTarget)) reset();
  }, { passive: true });
  document.addEventListener('pointercancel', reset, { passive: true });
  document.addEventListener('focusout', event => {
    if (activeCard?.contains(event.target) && !activeCard.contains(event.relatedTarget)) reset();
  }, { passive: true });
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('resize', reset, { passive: true });
  window.addEventListener('scroll', reset, { capture: true, passive: true });
  [finePointer, reducedMotion].forEach(media => {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', reset);
    else if (typeof media.addListener === 'function') media.addListener(reset);
  });
})();
