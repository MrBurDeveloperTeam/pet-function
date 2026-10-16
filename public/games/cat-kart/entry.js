/* Admission runs before engine scripts, WASM, or the racing pack are requested. */
(() => {
  function closeKart() {
    if (parent !== window) parent.postMessage({ source: 'cat-kart', type: 'KART_CLOSE' }, location.origin);
    else location.assign('/?pet=1');
  }
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || window.matchMedia('(pointer: coarse)').matches;
  if (mobile) {
    document.getElementById('canvas').remove();
    document.getElementById('loading').remove();
    const dialog = document.getElementById('desktop-only');
    document.getElementById('desktop-back').addEventListener('click', closeKart);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeKart(); });
    dialog.showModal();
    return;
  }

  document.getElementById('desktop-only').remove();
  document.getElementById('retry').addEventListener('click', () => location.reload());
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  window.addEventListener('message', event => {
    if (parent === window && event.origin === location.origin && event.source === window
      && event.data?.source === 'cat-kart' && event.data?.type === 'KART_CLOSE') closeKart();
  });
  loadScript('/games/mobile-performance.js?v=2')
    .then(() => loadScript('/games/mole-game/index.js'))
    .then(() => {
      const engine = new Engine({ args: [], canvasResizePolicy: window.PetGamePerformance.canvasPolicy(2),
        executable: '/games/mole-game/index', mainPack: '/games/cat-kart/index.pck?v=landscape-1-compact-1',
        experimentalVK: false, focusCanvas: true, gdextensionLibs: [] });
      return engine.startGame({ onProgress(current, total) {
        if (total > 0) document.getElementById('status').textContent = 'Preparing the track · ' + Math.round(current / total * 100) + '%';
      } });
    })
    .then(() => document.getElementById('loading').remove())
    .catch(() => {
      document.getElementById('status').textContent = 'Unable to start 3D racing. Please use a browser with WebGL 2 enabled.';
      document.getElementById('retry').hidden = false;
    });
})();
