# Kitten character study

The current visual target is `concepts/six-kittens-soft-style-v1.png`.
It is an AI-generated 2D concept board, not a render of the current model.
The procedural studies below do not yet match its anatomy or coat quality.

This is a separate, unfinished character art study. The browser game's
canonical driver and kart models have not been replaced by this study.

The target is a soft, seated kitten with large pupils, short front legs,
rounded cheeks, ears growing continuously out of the crown, and six distinct
coats matching the existing characters. The supplied kitten picture is the
style reference; the six original cat sprites are the identity references.

`kitten_cat.py -- <identity>` builds one character, saves
`source/<identity>_kitten_sculpt.blend`, and exports a GLB study. It uses
`kitten_coat.py` for coat painting and `kitten_groom.py` for short fur geometry.
The original sprite is sampled only for forehead fur markings. Eyes, nose,
mouth and whiskers are geometry; the sprite face is not projected on the head.

`kitten_review.py -- --six` creates `source/six_kitten_review.blend`, checks
that each head and seated body is one connected mesh, and renders the study.
Use Blender's `--python-exit-code 1` so script failures fail the command.

Still required before game integration: refine likeness and fur appearance,
inspect all six side and rear views, fit forepaws to the steering wheel,
create a lower-detail groom for racing, and test frame rate in Godot Web.
Do not use `rebuild.py` to regenerate these studies: its existing driver
pipeline generates the earlier character iteration.
