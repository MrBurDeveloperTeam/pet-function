/**
 * Bundler-resolved asset import demonstration.
 *
 * This is the pattern later phases must use for real sprites/audio: a plain
 * relative `import`, never a host-relative absolute path like `/images/...`
 * or `/pets/...` (those resolve incorrectly under different Next.js/Vite
 * base paths and deployment setups — this was an explicit finding in the
 * asset-delivery design phase).
 *
 * `sampleAsset.svg` is a tiny placeholder proving the build pipeline can
 * resolve, emit, and produce a usable URL for a package-owned static asset.
 * It is not a product asset. Real Cat/Pet spritesheets and audio are not
 * bulk-copied in this skeleton phase — only this one proof-of-mechanism
 * asset exists so far. The external noise-texture URL used by Content
 * Studio today is explicitly NOT included here; it must become a bundled
 * asset via this same mechanism in a later phase, not a network dependency.
 */
import sampleAssetUrl from './sampleAsset.svg';

export { sampleAssetUrl };
