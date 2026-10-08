# Six volumetric kitten models — work in progress

These are actual editable Blender meshes with GLB exports. They are not the
AI-generated concept image and are not an exact reconstruction of it.
The design target remains `../concepts/six-kittens-soft-style-v1.png`.

Open `six_soft_kittens.blend` to inspect all six characters. Individual
`*_studio.blend` files contain the complete connected sculpt and a short-fur
groom. Each `.glb` contains simplified anatomy and a reduced groom.

## Checked

- Connected anatomy: ears, skull, torso and all four limbs form one component.
- Actual GLB files reimport successfully, with eyes, materials, groom and
  character accessories present. Detailed results: `export-validation.json`.
- Front, side and rear renders were generated from the Blender meshes.

## Remaining quality work

The current models are more cartoon-like than the concept. Face proportions,
organic stripe placement, and the softness and direction of the groom need
further art work. These files have no skeletal rig, driving pose, or animation.
The reduced exports contain approximately 87,000–91,000 triangles per cat;
their performance in the Godot Web game has not been tested. They have not
replaced the currently shipped game characters.

Build with Blender `--background --python-exit-code 1 --python
../build_soft_kittens.py -- mallow silverbelt fastrat gulu munchkin mochi`.
Review with `../review_soft_kittens.py -- --six` (optional `--side` or `--rear`).
Validate exported GLBs with `../validate_soft_exports.py`.
