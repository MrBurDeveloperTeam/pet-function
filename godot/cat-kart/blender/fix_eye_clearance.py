"""Apply socket clearance to existing authored scenes without regenerating paint."""
import bpy,os,math
base=os.path.dirname(__file__)
for name in ['mallow','silverbelt','fastrat','gulu','munchkin','mochi']:
 for kind in ['driver','kart']:
  path=os.path.join(base,'source',name+'_'+kind+'.blend')
  bpy.ops.wm.open_mainfile(filepath=path)
  skull=next(o for o in bpy.data.objects if o.type=='MESH' and 'cranium' in o.name)
  eyes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Embedded eyeball')]
  for eye in eyes:
   ex,yy=eye.location.x,eye.location.z;ax,ay=eye.scale.x,eye.scale.z;base_z=-eye.location.y-.044
   for vertex in skull.data.vertices:
    v=vertex.co
    if v.y<=0:continue
    r=math.sqrt(((v.x-ex)/ax)**2+((v.z-yy)/ay)**2)
    amount=max(0,min(1,(1.3-r)/.2))
    v.y-=max(0,v.y-(-base_z-.019))*amount
   rim=next(o for o in eye.parent.children if o.type=='MESH' and o.name.startswith('Inset upper'))
   for vertex in rim.data.vertices:
    v=vertex.co;v.x=ex+(v.x-ex)*1.18/1.10;v.z=yy+(v.z-yy)*1.18/1.10
    candidates=sorted([((p.co.x-v.x)**2+(p.co.z-v.z)**2,p.co.y) for p in skull.data.vertices if p.co.y>0])[:4]
    weights=[1/max(.00001,d) for d,z in candidates]
    v.y=sum(z*wt for (d,z),wt in zip(candidates,weights))/sum(weights)+.002
  bpy.ops.wm.save_as_mainfile(filepath=path)
  bpy.ops.export_scene.gltf(filepath=os.path.join(base,'..','models',name+'_'+kind+'.glb'),export_format='GLB',export_yup=True)
print('ALL SIX SOCKET CLEARANCES UPDATED')
