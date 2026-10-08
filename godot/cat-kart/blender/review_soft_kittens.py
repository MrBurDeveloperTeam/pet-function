import bpy,os,sys,math,bmesh,json
from mathutils import Vector,Quaternion
BASE=os.path.dirname(__file__);OUT=os.path.join(BASE,'soft-kittens-v2')
six='--six' in sys.argv
identities=['mallow','silverbelt','fastrat','gulu','munchkin','mochi'] if six else ['mallow']*4
side='--side' in sys.argv;rear='--rear' in sys.argv
angles=[math.pi if rear else -math.pi/2 if side else 0]*6 if six else [0,-math.pi/3,-math.pi/2,math.pi]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
report=[]
for i,(identity,angle) in enumerate(zip(identities,angles)):
 with bpy.data.libraries.load(os.path.join(OUT,identity+'_studio.blend'),link=False) as (src,dst):dst.objects=src.objects
 objects=[o for o in dst.objects if o]
 for o in objects:bpy.context.collection.objects.link(o)
 root=next(o for o in objects if o.type=='EMPTY' and o.parent is None)
 cols=3 if six else 2;root.location=( (i%cols-(cols-1)/2)*1.55,0,(1-i//cols)*2.25 );root.rotation_euler.z=angle
 anatomy=next(o for o in objects if o.name.startswith('Continuous feline anatomy'))
 bm=bmesh.new();bm.from_mesh(anatomy.data);unseen=set(bm.verts);components=[]
 while unseen:
  stack=[unseen.pop()];n=0
  while stack:
   v=stack.pop();n+=1
   for e in v.link_edges:
    other=e.other_vert(v)
    if other in unseen:unseen.remove(other);stack.append(other)
  components.append(n)
 assert len(components)==1, (identity,'disconnected anatomy',components)
 assert sum(1 for o in objects if o.name.startswith('Curved inset eye'))==2
 report.append({'identity':identity,'connected_anatomy_components':len(components),'vertices':components[0]});bm.free()
 if six:
  bpy.ops.object.text_add(location=(root.location.x,-.15,root.location.z-.17),rotation=(math.pi/2,0,0))
  label=bpy.context.object;label.data.body=identity.capitalize();label.data.align_x='CENTER';label.data.size=.12
scene=bpy.context.scene;scene.world.use_nodes=True
world=scene.world.node_tree.nodes.get('Background');world.inputs['Color'].default_value=(.32,.32,.32,1);world.inputs['Strength'].default_value=.45
bpy.ops.object.camera_add(location=(0,-12,2.03));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,2.03))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.5 if six else 4.85;scene.camera=camera
for position,power,size in [((-3,-4,6),700,4),((4,-2,4),450,3),((0,3,5),900,3)]:
 bpy.ops.object.light_add(type='AREA',location=position);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,2))-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1800 if six else 1400;scene.render.resolution_y=1500 if six else 1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
   area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2);area.spaces.active.region_3d.view_location=(0,0,2.03);area.spaces.active.region_3d.view_distance=6
name=('six_soft_kittens'+('_side' if side else '_rear' if rear else '')) if six else 'mallow_turnaround'
with open(os.path.join(OUT,name+'_checks.json'),'w') as f:json.dump(report,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'.blend'))
scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
print('REVIEW COMPLETE',name)
