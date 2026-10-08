"""Reload the actual exported GLBs, not the modeling source."""
import bpy,os,json,math
base=os.path.join(os.path.dirname(__file__),'soft-kittens-v2');report=[]
for identity in ['mallow','silverbelt','fastrat','gulu','munchkin','mochi']:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 path=os.path.join(base,identity+'.glb');bpy.ops.import_scene.gltf(filepath=path)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 eyes=[o for o in meshes if o.name.startswith('Curved inset eye')]
 assert len(eyes)==2,(identity,'missing eyes')
 assert any(o.name.startswith('Groomed short fur') for o in meshes)
 assert any(o.name.startswith('Continuous feline anatomy') for o in meshes)
 for o in meshes:
  assert all(math.isfinite(c) for v in o.data.vertices for c in v.co),(identity,o.name,'nonfinite vertex')
  assert len(o.data.materials)>0,(identity,o.name,'missing material')
  if o.name.startswith('Curved inset eye'):assert min(o.dimensions)>.08,(identity,'flat eye')
 if identity=='silverbelt':assert any(o.name.startswith('Golden bell') for o in meshes)
 if identity=='munchkin':assert any(o.name.startswith('Folded bandana') for o in meshes)
 report.append({'identity':identity,'bytes':os.path.getsize(path),'mesh_count':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'roundtrip_import':'passed'})
with open(os.path.join(base,'export-validation.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
