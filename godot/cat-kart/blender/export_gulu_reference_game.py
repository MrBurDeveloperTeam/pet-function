import bpy, os, math, json
BASE=os.path.dirname(__file__)
# Reuse exact coat equations and mesh helpers from the sculpt builder.
exec(compile(open(os.path.join(BASE,'build_gulu_reference_model.py'),encoding='utf-8').read().split('parts=[')[0],'gulu_export_helpers','exec'))
OUT=os.path.join(BASE,'gulu-reference-model-v1')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'gulu-sculpt.blend'))
root=bpy.data.objects['Gulu'];body=bpy.data.objects['Gulu connected sculpt'];tail=bpy.data.objects['Thick ringed tail']
fur=body.data.materials[0]
for o in list(root.children):
 if o.name.startswith(('Studio groom','Tail groom')):bpy.data.objects.remove(o,do_unlink=True)
def compact(obj,inverse=False):
 for v in obj.data.vertices:
  p=obj.matrix_world@v.co
  p.z=(p.z/.78 if p.z<.6864 else p.z+.1936) if inverse else (p.z*.78 if p.z<.88 else p.z-.1936)
  v.co=obj.matrix_world.inverted()@p
bpy.context.view_layer.objects.active=body
mod=body.modifiers.new('Game anatomy reduction','DECIMATE');mod.ratio=.12;bpy.ops.object.modifier_apply(modifier=mod.name)
compact(body,True);gamefur=groom(body,3,fur,1100);compact(body);compact(gamefur);gamefur.parent=root;gamefur.name='Game short fur'
compact(tail,True);tailfur=groom(tail,3,fur,250)
for v in tailfur.data.vertices:
 t=max(0,min(1,(v.co.z-.18)/.45));ring=1-smooth(.2,.4,abs(math.sin(t*math.pi*6)))
 tailfur.data.color_attributes['Coat'].data[v.index].color=(*mix(rgb(PALETTES[3][0]),rgb(PALETTES[3][1]),ring*.9),1)
compact(tail);compact(tailfur);tailfur.parent=root;tailfur.name='Game tail fur'
root.rotation_mode='XYZ';root.rotation_euler.z=math.pi
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'gulu-game.glb'),export_format='GLB',export_yup=True,use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'gulu-game.blend'))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children if o.type=='MESH')
with open(os.path.join(OUT,'validation.json')) as f:report=json.load(f)
report.update(game_triangles=tris,game_glb_bytes=os.path.getsize(os.path.join(OUT,'gulu-game.glb')))
with open(os.path.join(OUT,'validation.json'),'w') as f:json.dump(report,f,indent=2)
print('REDUCED GULU GAME EXPORT',tris,flush=True)
