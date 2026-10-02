# Sports pixel runner art

## Volumetric somersault frames (2026-10-01)

Asset: `cat-somersault.png`, built-in image_gen edit using `cat-run-cycle.png`
as the identity reference. Transparent 4x2 sheet, eight ordered back-somersault
poses, fixed cell scale and anchor. Running/jumping/hurt art stays unchanged.
The game switches frames instead of compressing a flat sprite to a line.
Down/S ground rolls reuse this sheet in reverse order for a forward somersault,
with the same uniform cell scale, a grounded contact point and only a tiny bounce.
No new image generation or image modification is needed for this action.

Final prompt: Preserve the exact stocky gray tabby, charcoal stripes, cream paws
and cheek tufts, ringed bushy tail, proportions and shaded crisp pixel clusters.
Draw eight sequential back-somersault pitch poses from the same slightly elevated
rear camera: takeoff, leaning back, round belly-facing tuck, paws-up inversion,
fully inverted curl, inverted striped back, untucking and upright landing.
Keep substantial body volume at every angle. Transparent 4-column x 2-row sheet,
equal cells, cat centered at the same scale, generous margins, no overlap.
No edge-on thin pose, vertical squeezing, sideways cartwheel, floor, shadows,
text, grids, accessories or effects. Preserve actual transparent alpha.

Generated using the built-in imagegen tool. Style reference:
`pet-function/public/pet-function/rooms-wide/sports-stadium.png`.
These PNGs are integrated game assets, not mockups. Sprite alpha is preserved;
Godot trims transparent atlas cell margins at runtime without altering the PNGs.

## Final prompt set

- `stadium-runner.png`: Rebuild the reference Sports stadium behind a runner,
  looking down exactly three straight terracotta athletic lanes. Rich crisp
  16-bit pixel clusters, blue/gold seats and heart banners, warm sandstone,
  old-fashioned lamps, wood flower planters, leafy trees, cloud sky. Empty
  track, no characters/obstacles/UI. No smooth 3D, plastic, low-poly or blur.
- `cat-run-cycle.png`: Transparent 4x2 eight-cell sprite sheet. Same gray/white
  stocky tabby viewed from behind, striped tail, cream paws, dark pixel contour
  and textured fur. Four alternating run poses, two tucked-paw jump poses,
  two crouched/curled rolling poses. Consistent cell positions and proportions.
- `obstacles-teeth.png`: Transparent 3x2 six-cell atlas. Row 1: cute closed pink
  dentures, matching open pink dentures with a transparent roll passage, a
  WHITE molar collectible. Dentures have rounded milk-white teeth, friendly
  dot eyes, blush and toy-like pink gums. White tooth has dot eyes, a smiling
  mouth, pink cheeks and pale blue/lilac shadows; no gold/metal. Row 2: striped
  training cone, yellow wood/blue metal stadium bench, blue/gold equipment
  chest. Crisp detailed pixel clusters, warm outlines, transparent margins.

The objects atlas was revised from its initial version to fulfill the user's
cute-denture and white-tooth instruction. The first scary/gold version is not
used by the project. `Quadrit.ttf` reuses the shared package's existing pixel
font from the Pac-Cat resources.

## Continuous scene revision

- `equipment-hazard.png`: one transparent pixel sprite matching the object atlas:
  a blue/gold wheeled athletics trolley, folded blue mats, orange cones, broad
  black/yellow warning stripes and visible grounded wheels. Replaces the chest
  at runtime so hazards cannot be mistaken for treasure. Built-in imagegen.
- `stadium-stands.png`: horizontally repeating orthographic stadium facade,
  blue/gold seats, sandstone, lanterns, flowers, hedges and heart banners. No
  perspective, sky, ground or red road in this texture. Built-in imagegen,
  using stadium-runner.png as the style reference. A world-depth shader maps
  this onto scrolling side walls; do not use wide affine texture slices.

The original six-cell atlas is preserved, but its last chest cell is unused.
The paving texture is native procedural pixel masonry generated once at startup.


## Championship frame and NPC additions
Built-in imagegen, two separate production assets:
- stadium-results-frame.png: ornate transparent stadium results frame, matching
  the reference mole popup's pixel detail but using Sports sandstone, blue/gold
  pennants, lamps, flowers, trophy and terracotta track. Calm empty navy interior;
  labels, totals and buttons are live Godot UI, not embedded in the artwork.
- npc-high-five.png: two-cell transparent orange/cream cat in blue/gold scarf,
  waiting paw-up pose and smiling high-five pose, same scale and grounded feet.
# Open park verges

Asset: `park-lamp-fence.png`, generated with the built-in imagegen tool.
Final prompt: Use case stylized-concept. Transparent horizontal two-cell pixel-art
atlas for the Cat Dash runner. Left cell: one elegant charcoal-metal park lamp
with sandstone base, warm yellow lantern glass and subtle blue/gold trim. Right
cell: one low warm-wood fence with two posts, two rails and discreet blue caps.
Slightly elevated three-quarter front view; crisp stepped pixel edges and polished
cozy Sports-stadium material highlights. Generous transparent margins and empty
cell separator. No grass, ground, cast shadows, background, flowers, flags,
benches, spectators, text, UI, cats or extra props. Preserve genuine alpha.

The lawn is a low-contrast ground shader, not a repeating stadium wall. Sparse
props follow the same world projection and travel as the track; a narrow paved
verge remains available for friendly NPCs.
# Track-side lawn and inward-facing lamps (2026-10-01)

Generated with the built-in image_gen tool, generation mode. Grass is opaque;
the lamp has genuine transparent alpha. Original sprites are retained.
Final assets: `sports-grass.png` and `track-facing-lamp.png` in this directory.
The renderer applies perspective to the existing fence art on longitudinal world
planes and mirrors the new lamp so both lantern arms point toward the track.
Grass sampling fades distant detail to avoid high-frequency scrolling shimmer.

Final grass prompt:
> Use case: stylized-concept. Asset type: seamless square top-down grass texture for a polished pixel-art stadium runner game. Primary request: lush sunny sports-field lawn matching the bright detailed pixel-art stadium shown in conversation: lime green and emerald greens, crisp clustered pixels, subtle broad natural patches, small sparse grass blades, only very occasional tiny yellow-green flecks. Flat orthographic top-down surface filling the entire image edge to edge. Seamlessly tileable on all four edges, no visible grid, no borders, no objects, no shadows of objects, no perspective. Rich handcrafted pixel art with restrained contrast so a scrolling lawn is restful, no photographic texture, no soft airbrushing, no large flowers. Image size square.

Final lamp prompt:
> Use case: stylized-concept. Asset type: single transparent pixel-art roadside lamp sprite for a sports stadium runner. Primary request: ornate dark iron park lamp with gold accents, short stone base and a curved arm extending RIGHT from the upper post, hanging warm golden lantern directed downward toward the road on its right. Side profile, not a frontal symmetric lamp. Match the polished bright pixel-art sports stadium environment: crisp clustered pixels, warm sandstone, blue and gold accents, detailed but clean silhouette. Entire tall lamp visible with margin, isolated on genuinely transparent background. One lamp only, no ground plane, no fence, no text, no glow haze outside silhouette. Arm and lantern on RIGHT, post on LEFT.
# Refined Sports verge and grass landscaping (2026-10-01)

Built-in image_gen, generation mode; opaque lawn and transparent pillar/props.
Final files in this directory: `sports-lawn-v2.png`, `stadium-fence-pillar.png`,
`park-tree-goal.png`. The previous grass and fence images are retained but the
new scenery uses a mown lawn, standalone pillars, continuous world-space rails,
larger inward-facing lamps, sparse trees and football goals outside the track.

Final lawn prompt:
> Use case: stylized-concept. Asset type: seamless top-down pixel-art grass lawn tile for Cat Dash sports stadium, square. Match the sunny sports stadium reference visible in conversation: rich warm spring greens next to terracotta track and sandstone paving. This is a closely mown, cultivated sports lawn, NOT wild grass or foliage. Large softly varying green patches, very subtle broad mowing tones, almost uniform restful lawn; tiny short grass blade pixels sparse and low contrast. Handcrafted crisp pixel clusters, no blur, no noisy texture, no busy dark leaf clumps, no flowers, no visible checker grid, no straight seams, no objects. Restrained palette of six close green shades, dominant #76ab37, muted golden green highlights #8ebd43, darkest #689631 only in tiny accents. Entire image filled edge to edge, orthographic flat texture, seamlessly tileable all four sides, polished game environment material.

Final pillar prompt:
> Use case: stylized-concept. Asset type: transparent pixel-art sandstone fence pillar sprite for sports stadium. Primary request: one compact elegant square sandstone pillar, blue inset plaque with small golden heart, blue-and-gold metal rail connector sockets on left and right sides, thick pale sandstone cap edged gold, small gold finial on top. Front three-quarter very slightly overhead view. Polished detailed pixel-art matching the sunny sports stadium reference in conversation, cream warm sandstone blocks, cobalt blue, gold highlights, clean crisp pixel clusters. Entire pillar visible, short and stout, aspect around 1:2.3; isolated on genuine transparent background with generous margin. No rails attached, no lamp, no flowers, no pennants, no background, no detached pieces, no text. This single pillar will connect two continuous low blue-and-gold rails in the game.

Final tree/goal atlas prompt:
> Use case: stylized-concept. Asset type: two-cell transparent sprite atlas for a polished pixel-art sports stadium runner. Wide landscape 2:1 layout, two equal square cells, generous transparent margins, no overlap. LEFT cell: one leafy broad-canopy tree with sturdy warm brown trunk, layered bright spring-green foliage in crisp pixel clusters, slightly overhead three-quarter view, visible rooted base. RIGHT cell: one complete white football goal, three-quarter view with depth, white front goalposts and crossbar, diagonal rear supports, detailed light blue-grey square mesh net, freestanding directly on the ground. Both sprites match sunny richly shaded Sports stadium pixel art, terracotta track, cream sandstone, cobalt blue and gold theme; handcrafted game-quality pixels, strong readable silhouettes, soft warm daylight, moderate detail without visual clutter. Genuine transparent background. No grass ground plane, no baked shadow extending outside sprites, no text, no borders, no extra objects. Whole tree and whole goal must fit entirely inside their own cell.
