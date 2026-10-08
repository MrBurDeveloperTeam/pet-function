# Six kitten models — refinement v2

Editable Blender meshes and GLB exports. The design target remains
`../concepts/six-kittens-soft-style-v1.png`. These are actual model renders,
not generated concept images.

Changes from the first soft-kittens iteration:

- Additional volume blends each ear root into the crown.
- Smaller muzzle and white muzzle patch.
- Rounder eyes and matching orbital cavities and eyelids.
- More numerous, thinner short hairs, shortened over the paws.
- Tapered, separated flank and cheek markings replace continuous rings.

Open `six_soft_kittens.blend` for the collection or individual
`*_studio.blend` files for modeling. The previous iteration is preserved in
`../soft-kittens/`.

The studio groom is denser than the GLB groom. The GLB files have no skeletal
rig or articulated driving pose. `../integrate_soft_kittens.py` fits their
current seated pose to all six existing game karts for local preview. They
use the existing whole-body lean and tail movement; the connected head is
not rotated independently. Likeness and grooming remain below the concept's
quality; successful topology/export checks do not imply aesthetic completion.

Validation results: `export-validation.json` and the review `*_checks.json`.
