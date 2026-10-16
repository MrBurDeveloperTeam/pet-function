// Decode every layer before a renderer commits a complete outfit. Shared between
// the shop preview and room, so changing rooms does not restart image requests.
export function createSpriteTextureCache(createImage, timeoutMs = 15000) {
  const entries = new Map();
  function load(url) {
    if (entries.has(url)) return entries.get(url).promise;
    const entry = { ready: false, promise: null };
    entry.promise = new Promise((resolve, reject) => {
      const img = createImage();
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        img.onload = null; img.onerror = null;
        if (error) { entries.delete(url); reject(error); }
        else { entry.ready = true; resolve(); }
      };
      const timer = setTimeout(() => finish(Error('Sprite load timed out')), timeoutMs);
      img.onload = () => {
        // A loaded but undecoded atlas can still flash blank on the first frame.
        Promise.resolve().then(() => img.decode?.()).then(() => finish(), finish);
      };
      img.onerror = () => finish(Error('Sprite could not be loaded'));
      img.src = url;
    });
    entries.set(url, entry);
    return entry.promise;
  }
  return {
    loadAll: urls => Promise.all(urls.map(load)),
    isReady: urls => urls.every(url => entries.get(url)?.ready === true),
  };
}
