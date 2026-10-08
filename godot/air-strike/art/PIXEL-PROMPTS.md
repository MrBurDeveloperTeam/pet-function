# Pixel style variant

Mode: built-in imagegen; style-transfer edits of the existing atlas and coast. Original painted assets are preserved.

Assets:
- `mechanical-atlas-pixel.png` (transparent atlas)
- `coral-coast-pixel.png` (opaque background)

Runtime uses nearest-neighbor sprite samples (76/64/112/52 pixels wide), a 768x512 coastal sample, and the existing Quadrit pixel font from the other games. Effects and UI are drawn in stepped shapes without smooth bloom.

## Atlas prompt

Edit target: existing aircraft atlas. Convert this exact 4-sprite layout into premium 16-bit arcade PIXEL ART. Keep same silhouettes, directions (nose up), placements, scales and transparent empty spaces: cream/teal twin-engine paw-emblem player top left, copper fighter top right, wide olive four-engine bomber bottom left, steel/wood battleship bottom right. Crisp square pixel clusters, stepped diagonal edges, dark 1-pixel outlines, 3-5 discrete shades per material, tiny deliberate highlight pixels, no smooth gradients, no blur or painterly texture. Draw as if a 256x256 sprite sheet enlarged with nearest-neighbor. Preserve all four complete objects, no cropping or overlaps, genuine transparent alpha. No text, no grid.

## Coast prompt

Edit target: existing coral coast background. Convert composition into cohesive high-quality 16-bit arcade PIXEL ART top-down scrolling shooter background. Keep turquoise ocean clear across central 65 percent, rocky sandy palm coast on far left and right. Large deliberate square pixel clusters, stepped rocky silhouettes, restrained 24-color palette, 3-4 flat shades per surface, short pixel wave marks, selective dithering. As if drawn at 384x256 then nearest-neighbor enlarged. No painterly detail, no smooth gradients, no blur, no aircraft, UI, text or borders. Opaque landscape 3:2 aspect. Make top and bottom borders visually compatible for scrolling.

Pixel intensity revision: sample dimensions doubled and effect grid reduced from 2 to 1 logical pixel, halving the runtime pixel footprint while retaining the generated pixel artwork.

Combat-only revision: aircraft samples now 63/53/93 pixels wide (about 20% larger pixel footprint); ship sample remains 52. Bullet and explosion clusters use a 1.2 logical-pixel grid. Coast stays 768x512; HUD and shield sampling are retained.

Additional combat-only revision: aircraft samples 55/46/81 pixels wide; bullet and explosion clusters use a 1.38 logical-pixel grid, a further 15% increase from 1.2. Coast remains 768x512.
