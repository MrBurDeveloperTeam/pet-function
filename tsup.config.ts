import { defineConfig } from 'tsup';

// Build choice: tsup (esbuild-based) over a bundler like Rollup/Webpack —
// it produces clean dual ESM + .d.ts output for a multi-entry library with
// almost no config, which is exactly this package's shape (5 public entry
// points, no app bundling, no CSS-in-JS). Every public subpath is its own
// entry so each can be published/resolved independently via package.json
// "exports", and so each client entry keeps its own "use client" directive
// as the literal first statement in its own output file rather than a
// directive shared/lost across a merged chunk.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    contracts: 'src/contracts/index.ts',
    cat: 'src/cat/index.ts',
    ai: 'src/ai/index.ts',
    pet: 'src/pet/index.ts',
      options: 'src/pet/publicOptions.ts',
      resources: 'src/resources.ts',
    // Internal-only entry, NOT listed in package.json "exports" (so hosts
    // cannot resolve it) — built solely so the .svg `file`-loader asset
    // pipeline is actually exercised and verifiable in dist output, not
    // just typechecked. See src/assets/index.ts.
    assets: 'src/assets/index.ts',
  },
  format: ['esm'],
  // .d.ts generation is restricted to the 5 published entries — the
  // internal-only `assets` entry doesn't need published types (see its own
  // comment above) and rollup-plugin-dts cannot resolve the ambient `*.svg`
  // module declaration used only for that entry's asset import.
  dts: {
    entry: {
      index: 'src/index.ts',
      contracts: 'src/contracts/index.ts',
      cat: 'src/cat/index.ts',
      ai: 'src/ai/index.ts',
      pet: 'src/pet/index.ts',
      options: 'src/pet/publicOptions.ts',
      resources: 'src/resources.ts',
    },
  },
  // splitting/minify are both off to keep each entry's output self-
  // contained and readable. NOTE: esbuild strips top-level "use client"
  // string directives unconditionally regardless of these settings — this
  // was verified by inspecting a plain build's dist output, not assumed.
  // scripts/postbuild.mjs deterministically re-prepends the directive to
  // the client entry files after this step. Do not rely on esbuild alone
  // to preserve it.
  splitting: false,
  minify: false,
  sourcemap: false,
  clean: true,
  target: 'es2019',
  loader: {
    '.svg': 'file',
    '.webp': 'file',
    '.png': 'file',
  },
});
