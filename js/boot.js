// BOOT
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // La app continúa funcionando online aunque el navegador no admita instalación.
    });
  });
}

init();
