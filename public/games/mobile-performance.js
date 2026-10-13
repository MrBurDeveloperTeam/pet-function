/* Shared mobile framebuffer budget. Desktop keeps Godot's original sizing policy. */
(() => {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || matchMedia('(pointer: coarse)').matches;
  const configured = new WeakSet();
  if(mobile){
    let requesting=false,lastAttempt=0;
    document.addEventListener('pointerup',async()=>{
      if(requesting||performance.now()-lastAttempt<1500)return;
      try{
        const doc=parent.document;
        if(doc.fullscreenElement||doc.webkitFullscreenElement)return;
        const root=doc.documentElement;
        if(!doc.fullscreenEnabled||!root.requestFullscreen)return;
        requesting=true;lastAttempt=performance.now();
        await root.requestFullscreen({navigationUI:'hide'});
        root.dataset.petFullscreenOwned='true';
      }catch{/* Unsupported browsers continue in the normal viewport. */}
      finally{requesting=false;}
    },true);
  }
  function renderSize(width, height, density, constrained = false) {
    // Keep enough samples for readable text; still avoid native DPR 3–4 buffers.
    const scale = Math.min(density || 1, constrained ? 1.5 : 2,
      Math.sqrt(2000000 / Math.max(1, width * height)), 2400 / Math.max(width, height));
    return {width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale))};
  }
  function canvasPolicy(original) {
    if (!mobile) return original;
    const canvas = document.getElementById('canvas');
    if (!canvas) return original;
    if (!configured.has(canvas)) {
      configured.add(canvas);
      const constrained = (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4)
        || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
      const resize = () => {
        canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
        const size = renderSize(innerWidth, innerHeight, devicePixelRatio, constrained);
        // Avoid resetting the GPU buffer when browser chrome emits redundant resize events.
        if (canvas.width !== size.width) canvas.width = size.width;
        if (canvas.height !== size.height) canvas.height = size.height;
      };
      resize();
      let timer;
      window.addEventListener('resize', () => {clearTimeout(timer); timer = setTimeout(resize, 120);});
      window.addEventListener('orientationchange', () => {clearTimeout(timer); timer = setTimeout(resize, 120);});
    }
    return 0;
  }
  window.PetGamePerformance = {mobile, renderSize, canvasPolicy,
    frameDelta: elapsed => mobile ? Math.min(Math.max(0, elapsed), 50) : elapsed};
})();
