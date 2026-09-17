// Postbuild step.
//
// 1) esbuild (via tsup) strips top-level "use client" string-literal
//    directives unconditionally — confirmed by inspecting dist output
//    after a plain build (they were present in every relevant .tsx source
//    file and absent from every .js output file). Relying on esbuild to
//    preserve them was not actually safe, despite disabling minification
//    and splitting. This script deterministically re-prepends the
//    directive to exactly the entry files that contain client
//    hooks/context (index.js, cat.js, ai.js, pet.js) and skips the ones
//    that don't need it (contracts.js is pure types/empty at runtime).
//
// 2) Copies the plain, pre-authored CSS foundation (Cat/AI, and the pet
//    overlay's own non-Tailwind rules) into dist/styles.css.
//
// 3) Compiles the ported Virtual Pet components' Tailwind classNames into
//    a real stylesheet via the Tailwind CLI, scopes every selector under
//    `.snabbb-molar-experience` (see `src/pet/tailwind-entry.css`'s own
//    header for why this exists instead of a hand-authored BEM
//    conversion), and appends the scoped result to dist/styles.css.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';
import prefixSelector from 'postcss-prefix-selector';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');

const CLIENT_ENTRIES = ['index.js', 'cat.js', 'ai.js', 'pet.js'];
const DIRECTIVE = '"use client";\n';

for (const file of CLIENT_ENTRIES) {
  const filePath = join(distDir, file);
  const content = readFileSync(filePath, 'utf8');
  if (content.startsWith(DIRECTIVE)) {
    console.log(`[postbuild] ${file} already has "use client", skipping`);
    continue;
  }
  writeFileSync(filePath, DIRECTIVE + '\n' + content, 'utf8');
  console.log(`[postbuild] prepended "use client" to ${file}`);
}

const cssSrc = join(root, 'src', 'styles', 'index.css');
const cssOut = join(distDir, 'styles.css');
mkdirSync(distDir, { recursive: true });
copyFileSync(cssSrc, cssOut);
console.log(`[postbuild] ${cssSrc} -> ${cssOut}`);

// --- Scoped Tailwind utilities for the ported Virtual Pet components ---
const tailwindEntry = join(root, 'src', 'pet', 'tailwind-entry.css');
const tailwindRawOut = join(distDir, '_pet-tailwind-raw.css');
const tailwindCli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss');

execFileSync(tailwindCli, ['-i', tailwindEntry, '-o', tailwindRawOut, '--cwd', root], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log(`[postbuild] compiled ${tailwindEntry} -> ${tailwindRawOut}`);

const rawCss = readFileSync(tailwindRawOut, 'utf8');
const scoped = await postcss([
  prefixSelector({
    prefix: '.snabbb-molar-experience',
    transform(prefix, selector, prefixedSelector) {
      // Theme-variable declarations compile to `:root`/`:host` — scope
      // those to the wrapper class itself (not the page root) instead of
      // descendant-prefixing them, so CSS custom properties are still
      // visible to every descendant utility class.
      if (selector === ':root' || selector === ':host') return prefix;
      return prefixedSelector;
    },
  }),
]).process(rawCss, { from: tailwindRawOut });

const existingCss = readFileSync(cssOut, 'utf8');
writeFileSync(
  cssOut,
  `${existingCss}\n\n/* ==========================================================================\n   Scoped Tailwind utilities — compiled from src/pet/tailwind-entry.css for\n   the ported Virtual Pet components' Tailwind classNames. See that file's\n   header for why this exists instead of a hand-authored BEM conversion.\n   ========================================================================== */\n\n${scoped.css}`,
  'utf8'
);
unlinkSync(tailwindRawOut);
console.log(`[postbuild] appended scoped Tailwind utilities to ${cssOut}`);

// --- Tailwind v3-host transform/translate compatibility reset ---
//
// Tailwind v4 (this package's compiled output above) represents
// translate/rotate/scale as their own individual CSS properties
// (`translate:`, `rotate:`, `scale:`). Tailwind v3 (still used by some
// consuming hosts, e.g. E-Learning/Appointments) compiles the *same*
// utility class names (`-translate-x-1/2`, `scale-95`, `rotate-180`, …) to
// the legacy composite `transform:` property instead. Because `transform`
// and `translate`/`rotate`/`scale` are different CSS properties, a
// Tailwind-v3 host that happens to use one of these exact class names
// anywhere in its own source causes BOTH declarations to apply to the same
// scoped element simultaneously — the browser composes them, doubling the
// effective translation/rotation/scale. See the class-level docs on
// `SharedVirtualPet` for the full write-up of this cross-major collision.
//
// Fix: emit an UNLAYERED companion rule (`transform: none;`) for every
// exact selector this package compiled above that sets `translate`,
// `rotate`, or `scale` — scoped identically, so it stays exactly as
// specific as the layered rule it accompanies. Per the CSS cascade-layer
// spec, unlayered declarations always outrank layered ones for the same
// property regardless of specificity, so this reset wins against a
// Tailwind-v3 host's `transform:` declaration (itself always unlayered)
// purely by being unlayered too — the ordinary `.snabbb-molar-experience`
// double-class specificity margin (see selector below) is what then keeps
// it from ever being beaten by a bare, unscoped host utility of the same
// name. This section is deliberately generated from the actual compiled
// output above (never a hand-maintained selector list) so it can never
// drift out of sync with the utilities this package actually ships, and it
// only ever targets the exact selectors already proven to exist — never a
// wildcard or family-wide reset — so it cannot affect SVG
// `<animateTransform>` elements, the stink-line/chew-mouth keyframe
// animations (authored as plain hand-written CSS, not Tailwind utilities),
// or any element that intentionally relies on the composite `transform`
// property.
const scopedRoot = postcss.parse(scoped.css);
const resetRules = [];

function collectResetRules(container, media) {
  container.each((node) => {
    if (node.type === 'atrule' && node.name === 'media') {
      collectResetRules(node, node.params);
      return;
    }
    if (node.type !== 'rule') return;
    const props = new Set();
    node.walkDecls((decl) => props.add(decl.prop));
    // Only the individual transform-family properties are candidates —
    // never touch a rule that already declares `transform` itself (this
    // package's own `.transform` 3D-rotation utility, if ever used, is
    // deliberately excluded by this check).
    const isCandidate = ['translate', 'rotate', 'scale'].some((p) => props.has(p)) && !props.has('transform');
    if (!isCandidate) return;
    resetRules.push({ selector: node.selector, media });
  });
}

postcss.parse(scoped.css).walkAtRules('layer', (layerRule) => {
  collectResetRules(layerRule);
});

if (resetRules.length === 0) {
  throw new Error('[postbuild] transform-compat: no candidate translate/rotate/scale rules found — refusing to emit an empty/unproven compatibility section');
}

// Build the unlayered CSS text directly (not via postcss.Root round-trip)
// so there is no risk of it accidentally being re-wrapped in a layer.
const byMedia = new Map();
for (const { selector, media } of resetRules) {
  const key = media || '';
  if (!byMedia.has(key)) byMedia.set(key, []);
  byMedia.get(key).push(selector);
}

let compatCss = '';
for (const [media, selectors] of byMedia) {
  const body = selectors.map((s) => `  ${s} {\n    transform: none;\n  }`).join('\n');
  compatCss += media ? `@media ${media} {\n${body}\n}\n\n` : `${body}\n\n`;
}

const finalCss = readFileSync(cssOut, 'utf8');
writeFileSync(
  cssOut,
  `${finalCss}\n/* ==========================================================================\n   Tailwind v3-host transform/translate compatibility reset — deliberately\n   UNLAYERED (outside every @layer block above) and generated from the\n   exact selectors compiled above; see this section's own doc comment in\n   scripts/postbuild.mjs for the full mechanism. Do not hand-edit — rerun\n   the build. Targets ${resetRules.length} exact selector(s).\n   ========================================================================== */\n\n${compatCss}`,
  'utf8'
);
console.log(`[postbuild] appended ${resetRules.length} unlayered transform-compat selector(s) to ${cssOut}`);

// --- Tailwind v3-host FULL Shared Pet theme + utility compatibility ---
//
// The transform-compat section above fixes the one already-known
// composite `transform` collision. It does NOT fix the much larger set
// of collisions found across the Virtual Pet Back button, Stats HUD,
// Coin indicator, Level indicator, and Shop (see
// SHARED-PET-TAILWIND-V3-COMPATIBILITY-AUDIT-2's own write-up): a
// Tailwind-v3 host that happens to retain source files containing the
// SAME utility class names this package's ported Pet components use
// (background/border/shadow/backdrop-filter/gradient/SVG fill-stroke
// utilities — not just transform-family ones) compiles those class names
// into its OWN unlayered CSS. Per the CSS Cascade Layers spec, an
// unlayered declaration always outranks a layered one for the same
// property on the same element regardless of source order or
// specificity — so a v3 host's own (differently-computed, often
// incomplete) utility declaration silently wins over this package's
// correct but layered (`@layer theme`/`@layer utilities`) declaration
// for every shared class name.
//
// Fix: emit TWO more unlayered, `.snabbb-molar-experience`-scoped
// sections, both generated directly from the compiled CSS above (never
// hand-maintained, never a class allowlist):
//
// 1. THEME TOKEN COMPATIBILITY — clones every CSS custom-property
//    declaration from `@layer theme` (Tailwind v4's `--color-*`,
//    `--radius-*`, `--text-*`, etc. design tokens) into a single
//    unlayered rule scoped to a DOUBLED selector
//    (`.snabbb-molar-experience.snabbb-molar-experience`) rather than
//    the plain single-class selector — a deliberate higher-specificity
//    margin so this can never tie against a host's own unlayered
//    single-class/`:root`-level declaration of the same custom-property
//    name. This is a REAL, confirmed collision (not hypothetical):
//    Appointment's own `--radius-*` design tokens happen to share
//    Tailwind v4's reserved theme-token prefix, and (being unlayered on
//    `:root`) would otherwise always win over this package's own
//    (layered) `--radius-xl: 0.75rem` etc, silently resizing every
//    `rounded-xl`/`rounded-2xl`/`rounded-lg` surface in the ported Pet
//    UI to the host's own corner-radius scale instead of Tailwind's.
//    `assertOnlyCustomProperties` below is a hard runtime guard (not
//    just a comment) that `@layer theme` never contains anything but
//    `--`-prefixed declarations — if a future Tailwind upgrade ever adds
//    non-custom-property theme output, the build fails loudly instead of
//    silently cloning something unintended.
//
// 2. UTILITY COMPATIBILITY — clones every rule from `@layer utilities`
//    (selector, full declaration list — including any nested `@supports`
//    progressive-enhancement fallback already inside a rule's own body —
//    in original order), preserving any enclosing `@media`/`@supports`/
//    `@container` condition exactly (including nested combinations, e.g.
//    an `@supports` block that itself wraps a full rule inside an
//    `@media` block — confirmed to occur in the compiled output for the
//    `hover:` color-mix fallback rules). This is the systemic fix for
//    every other collision class found in the audit (backgrounds,
//    borders, shadows, backdrop-filter, gradients, SVG fill/stroke) — it
//    does not special-case gradients or any other specific property; it
//    mechanically reproduces the ENTIRE utilities surface this package
//    ships, unlayered, so it can never drift out of sync as new Pet
//    components/utilities are added.
//
// Both sections stay scoped under `.snabbb-molar-experience` — never a
// bare `.utility` selector — so they can only ever affect this package's
// own mounted surface, never a host's unrelated UI. `@layer properties`
// (Tailwind v4's internal `--tw-*` working-variable initialization) is
// deliberately left untouched: those variables only ever feed OTHER
// `--tw-*`-consuming declarations that are themselves already covered by
// the utility clone above, and a Tailwind-v3 host's own `--tw-*`
// Preflight reset initializes the same names to the same harmless
// defaults (confirmed by the audit) — there is no visible collision to
// fix there, so unlayering `@layer properties` would only add dead
// weight, not fix anything.
function assertOnlyCustomProperties(rule) {
  rule.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) {
      throw new Error(
        `[postbuild] theme-compat: non-custom-property declaration found in @layer theme (${decl.prop}) — refusing to broaden the clone without explicit review`
      );
    }
  });
}

// Structural assertion: the flattening below assumes every declaration
// collected from @layer theme belongs to the ONE Shared root selector
// (postcss-prefix-selector's own `:root`/`:host` -> `.snabbb-molar-experience`
// rewrite above can legitimately produce a duplicated selector list, e.g.
// `.snabbb-molar-experience, .snabbb-molar-experience`, from mapping both
// `:root` and `:host` to the same class — that's fine to flatten). If a
// FUTURE Tailwind/build change ever produced a theme rule for any OTHER
// selector, silently merging its declarations into the single compat
// root would misattribute them. Fail loudly instead.
function assertExpectedThemeSelector(rule) {
  const parts = rule.selector.split(',').map((s) => s.trim());
  const unexpected = parts.filter((s) => s !== '.snabbb-molar-experience');
  if (unexpected.length > 0) {
    throw new Error(
      `[postbuild] theme-compat: @layer theme rule uses unexpected selector(s) [${unexpected.join(', ')}] (full selector: "${rule.selector}") — refusing to flatten into the single compat root without explicit review`
    );
  }
}

const themeDecls = [];
scopedRoot.walkAtRules('layer', (layerRule) => {
  if (layerRule.params !== 'theme') return;
  layerRule.each((node) => {
    if (node.type !== 'rule') {
      throw new Error(
        `[postbuild] theme-compat: unexpected non-rule node inside @layer theme (${node.type}) — refusing to broaden the clone without explicit review`
      );
    }
    assertExpectedThemeSelector(node);
    assertOnlyCustomProperties(node);
    node.walkDecls((decl) => {
      themeDecls.push(`  ${decl.prop}: ${decl.value};`);
    });
  });
});

if (themeDecls.length === 0) {
  throw new Error('[postbuild] theme-compat: no theme custom-property declarations found — refusing to emit an empty/unproven compatibility section');
}

const themeCompatCss = `.snabbb-molar-experience.snabbb-molar-experience {\n${themeDecls.join('\n')}\n}\n`;

// Generic conditional-wrapper-preserving utility clone. Recurses into any
// of the three standard CSS conditional-group at-rules encountered
// wrapping a rule (confirmed present in the compiled output: `@media`
// alone, and `@supports` nested inside `@media`); `@container` is
// supported the same way even though not currently emitted, since a
// future Tailwind/component change could introduce one. Any OTHER
// at-rule type encountered at this level (i.e. one this package's own
// compiled utilities layer has never been proven to contain) fails the
// build rather than being silently dropped or mis-cloned.
const CONDITIONAL_WRAPPERS = new Set(['media', 'supports', 'container']);
const utilityClones = [];

function collectUtilityClones(container, wrappers) {
  container.each((node) => {
    if (node.type === 'atrule' && CONDITIONAL_WRAPPERS.has(node.name)) {
      collectUtilityClones(node, [...wrappers, { name: node.name, params: node.params }]);
      return;
    }
    if (node.type === 'rule') {
      utilityClones.push({ text: node.toString(), wrappers });
      return;
    }
    throw new Error(
      `[postbuild] utility-compat: unexpected node inside @layer utilities (${node.type === 'atrule' ? `@${node.name}` : node.type}) — refusing to clone without explicit review`
    );
  });
}

scopedRoot.walkAtRules('layer', (layerRule) => {
  if (layerRule.params !== 'utilities') return;
  collectUtilityClones(layerRule, []);
});

if (utilityClones.length === 0) {
  throw new Error('[postbuild] utility-compat: no utility rules found — refusing to emit an empty/unproven compatibility section');
}

// Emit sequentially, in the exact order utilityClones was collected in
// (the original @layer utilities traversal order) — each rule is
// re-wrapped in its own recorded conditional-ancestor stack and appended
// immediately. Deliberately NOT grouped/bucketed by wrapper stack first
// (a prior version of this script did that via a Map keyed on the
// wrapper stack, which pulled every rule sharing a wrapper together —
// e.g. every `@media (hover: hover)`-wrapped rule — out of its original
// interleaved position relative to differently-wrapped or unwrapped
// rules elsewhere in the utilities layer, silently reordering the
// cascade for ~90 rules from index 511 onward when checked against the
// real compiled 0.9.6 output). Cascade order among same-specificity,
// same-layer-status (here: both unlayered) rules is source order, so
// preserving the original traversal order is required for correctness,
// not just style.
let utilityCompatCss = '';
for (const { text, wrappers } of utilityClones) {
  let body = text;
  for (let i = wrappers.length - 1; i >= 0; i -= 1) {
    const w = wrappers[i];
    body = `@${w.name} ${w.params} {\n${body}\n}`;
  }
  utilityCompatCss += `${body}\n\n`;
}

const withTransformReset = readFileSync(cssOut, 'utf8');
writeFileSync(
  cssOut,
  `${withTransformReset}\n/* ==========================================================================\n   Tailwind v3-host Shared Pet THEME TOKEN compatibility — deliberately\n   UNLAYERED, scoped to a doubled\n   .snabbb-molar-experience.snabbb-molar-experience selector (a deliberate\n   higher-specificity margin against a host's own unlayered same-named\n   token declaration — see this section's own doc comment above). Cloned\n   directly from @layer theme's actual compiled custom-property\n   declarations — do not hand-edit, rerun the build. Clones ${themeDecls.length} custom\n   propert${themeDecls.length === 1 ? 'y' : 'ies'}.\n   ========================================================================== */\n\n${themeCompatCss}\n/* ==========================================================================\n   Tailwind v3-host Shared Pet UTILITY compatibility — deliberately\n   UNLAYERED clone of every rule in @layer utilities (selector + full\n   declaration list, any nested @supports/@media/@container condition\n   preserved) — see this section's own doc comment above for the full\n   mechanism. Generated from the actual compiled output — do not\n   hand-edit, rerun the build. Clones ${utilityClones.length} rule(s).\n   ========================================================================== */\n\n${utilityCompatCss}`,
  'utf8'
);
console.log(
  `[postbuild] appended ${themeDecls.length} unlayered theme-compat custom propert${themeDecls.length === 1 ? 'y' : 'ies'} and ${utilityClones.length} unlayered utility-compat rule(s) to ${cssOut}`
);
