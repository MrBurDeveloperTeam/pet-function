# Gulu — img2threejs grey model study

Status: **generated draft, NOT accepted against the reference**. This is a real volumetric procedural mesh, not a generated bitmap or a photo on a flat plane. It is not yet a finished game character.

## Deliverables

- `gulu-img2threejs.blend`: editable Blender import of the newly generated Three.js model. Embedded front/profile reference images are in the hidden REFERENCE collection.
- `gulu-img2threejs.glb`: actual GLB exported by Three.js GLTFExporter and successfully imported into Blender 5.2.
- `src/createGuluModel.ts`: factory emitted by the installed img2threejs skill.
- `object-sculpt-spec.json`: measured anatomy, implicit volumes, subparts, neutral materials, quality contract and review history.
- `renders/`: seven camera views from the actual browser renderer.
- `comparison-front.png`: reference on the left, generated model on the right.
- `.img2threejs/state.json`: resumable skill checklist; incomplete gates must not be represented as passed.

## Validation and limitations

The subject-specific spec passes strict validation. Browser capture has no fatal page errors. Blender imported 25 meshes / 169,516 triangles and saved the .blend file. The mesh has volumetric sides and rear rather than a billboard.

The reference comparison failed: silhouette IoU 0.8015 (required 0.85), aspect-ratio delta 0.1676 (required <=0.05), scale delta 0.1441 (required <=0.08). These are image-mask diagnostics, not an anatomical similarity score. The turntable covers all four required azimuths, but its hole check fails; some background openings are the intentional gaps between seated limbs, so the result needs interpretation rather than being called clean. The final output exceeds the 100,000-triangle target and is not optimized for the racing game.

Visible remaining defects: muzzle pads are too weak, forehead/cheek shape differs, inner ear bowls are not yet sculpted, eye rims remain rough, front legs are too straight and paw volume/placement differs. Fur, coat colours, a deformation rig, blink animation and a kart driving pose are absent. No game assets have been replaced by this draft.

## Provenance

Installed `img2threejs` v2.0.0 from https://github.com/img2threejs/img2threejs into `C:/Users/ming/.codex/skills/img2threejs`. Local shape reference is the user's latest grey turnaround, isolated into six inspection crops. Back/top/bottom concepts are not treated as exact mutually consistent orthographic projections. No external image-to-3D hosted service was used and no reference was uploaded to one.

Model was constructed through the skill's procedural TypeScript/SDF factory. `fix_bounds.py` reproducibly carries the tail shading correction into the emitted code. Blender is used only to import and package that actual procedural geometry, not to substitute a different mesh.

## Preview

Local preview: http://127.0.0.1:8093/public/index.html . Drag to rotate, scroll to zoom, use the seven view buttons or export GLB. The server is started with `python -m http.server 8093 --bind 127.0.0.1` from this directory. The preview intentionally labels the mesh as an unaccepted study.

Dependency versions are pinned in package.json and pnpm-lock.yaml. The current specimen is static; animation readiness must not be inferred from the installed skill's description.
