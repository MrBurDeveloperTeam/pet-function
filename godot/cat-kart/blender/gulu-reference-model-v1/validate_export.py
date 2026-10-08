import bpy, os, json, math
base=os.path.dirname(__file__)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(base,'gulu-game.glb'))
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
eyes=[o for o in meshes if 'spherical eye' in o.name]
assert len(eyes)==2
for eye in eyes:
 assert min(eye.dimensions)>.26,('eye must be spherical',eye.dimensions[:])
 assert eye.matrix_world.translation.y>.10,('export eye faces Blender +Y / Godot -Z',eye.matrix_world.translation[:])
for o in meshes:
 assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
body=next(o for o in meshes if o.name.startswith('Gulu connected sculpt'))
assert body.data.color_attributes, 'coat vertex colours lost'
report={'roundtrip_glb_valid':True,'mesh_objects':len(meshes),'spherical_eyes':len(eyes),'materials':len(bpy.data.materials),'animation_rig':False}
with open(os.path.join(base,'export-check.json'),'w') as f:json.dump(report,f,indent=2)
print('GULU EXPORT CHECK PASSED',report,flush=True)
