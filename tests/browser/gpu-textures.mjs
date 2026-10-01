/* Track actual WebGL texture objects, not just Three's aggregate counter.
   The renderer owns persistent textures of its own. A model switch must
   release the newly uploaded model textures and return to the same objects
   that existed before the first textured model, not merely the same count. */
export async function trackGpuTextures(page) {
  await page.addInitScript(() => {
    const live = new Map();
    let nextId = 0;
    const prototype = WebGL2RenderingContext.prototype;
    const create = prototype.createTexture;
    const dispose = prototype.deleteTexture;
    prototype.createTexture = function (...args) {
      const texture = create.apply(this, args);
      if (texture) live.set(texture, ++nextId);
      return texture;
    };
    prototype.deleteTexture = function (texture) {
      const result = dispose.call(this, texture);
      live.delete(texture);
      return result;
    };
    window.__testGpuTextures = () => [...live.values()].sort((a, b) => a - b);
  });
}

export async function gpuTextureSnapshot(page) {
  return page.evaluate(async () => {
    // Loading can finish before the next rendered frame uploads its textures.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      count: window.__reviewDiagnostics().viewer.textures,
      objects: window.__testGpuTextures(),
    };
  });
}
