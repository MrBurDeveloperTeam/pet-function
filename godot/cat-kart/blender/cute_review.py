import bpy,os,math,sys,bmesh
from mathutils import Vector,Quaternion
base=os.path.dirname(__file__)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for i,angle in enumerate([0,math.pi/4,math.pi/2,math.pi]):
 with bpy.data.libraries.load(os.path.join(base,'source','mallow_cute_sculpt.blend'),link=False) as (src,dst):dst.objects=src.objects
 objects=[o for o in dst.objects if o is not None]
 for o in objects:bpy.context.collection.objects.link(o)
 root=next(o for o in objects if o.type=='EMPTY' and o.parent is None)
 root.location.x=(i%2-.5)*2.1;root.location.z=(1-i//2)*1.85;root.rotation_euler.z=angle
 if i==0:
  for obj in objects:
   if obj.type!='MESH' or not obj.name.startswith('Continuous'):continue
   bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
   unseen=set(bm.verts);components=[]
   while unseen:
    todo=[unseen.pop()];size=0
    while todo:
     v=todo.pop();size+=1
     for edge in v.link_edges:
      other=edge.other_vert(v)
      if other in unseen:unseen.remove(other);todo.append(other)
    components.append(size)
   print('SCULPT CONNECTIVITY',obj.name,sorted(components,reverse=True))
   assert(len(components)==1,'Anatomy must be a single connected surface')
   bm.free()
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
   area.spaces.active.region_3d.view_rotation=Quaternion((0,0,1),math.pi) @ Quaternion((1,0,0),math.pi/2)
   area.spaces.active.region_3d.view_distance=5.6;area.spaces.active.region_3d.view_location=(0,0,1.65);area.spaces.active.region_3d.view_perspective='ORTHO'
scene=bpy.context.scene
bpy.ops.object.camera_add(location=(0,10,1.65));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.65))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=5.2;scene.camera=camera
for position,power in [((3,4,6),500),((-4,1,3),270)]:
 bpy.ops.object.light_add(type='AREA',location=position);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=5
 lamp.rotation_euler=(Vector((0,0,1.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.13,.13,.13);scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'source','mallow_cute_review.blend'))
scene.render.filepath=os.path.join(base,'mallow-cute.local.png');bpy.ops.render.render(write_still=True)
