"""Openable comparison scene with all approved characters, in material view."""
import bpy,os,math,sys
from mathutils import Quaternion,Vector
base=os.path.dirname(__file__)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for i,name in enumerate(['mallow','silverbelt','fastrat','gulu','munchkin','mochi']):
 with bpy.data.libraries.load(os.path.join(base,'source',name+'_driver.blend'),link=False) as (src,dst):dst.objects=src.objects
 objects=[o for o in dst.objects if o is not None]
 for o in objects:bpy.context.collection.objects.link(o)
 root=next(o for o in objects if o.parent is None and o.type=='EMPTY')
 root.location.x=(i%3-1)*1.6;root.location.z=(1-i//3)*1.8
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL'
   area.spaces.active.overlay.show_relationship_lines=False
   area.spaces.active.region_3d.view_rotation=Quaternion((0,0,1),math.pi) @ Quaternion((1,0,0),math.pi/2)
   area.spaces.active.region_3d.view_distance=6.5
   area.spaces.active.region_3d.view_location=(0,0,1.65)
   area.spaces.active.region_3d.view_perspective='ORTHO'
output='six_anatomical_cats.blend' if '--anatomy' in sys.argv else ('six_reference_cats_final.blend' if '--' in sys.argv else 'six_reference_cats.blend')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'source',output))
if '--render' in sys.argv:
 scene=bpy.context.scene
 bpy.ops.object.camera_add(location=(0,10,1.60))
 camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.60))-camera.location).to_track_quat('-Z','Y').to_euler()
 camera.data.type='ORTHO';camera.data.ortho_scale=5.4;scene.camera=camera
 for position,power in [((3,4,6),550),((-4,1,3),300)]:
  bpy.ops.object.light_add(type='AREA',location=position)
  lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=5
  lamp.rotation_euler=(Vector((0,0,1.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
 scene.world.color=(.13,.13,.13);scene.render.engine='CYCLES';scene.cycles.samples=16
 scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
 scene.view_settings.view_transform='Standard'
 scene.render.filepath=os.path.join(base,'six-anatomical-cats.local.png')
 bpy.ops.render.render(write_still=True)
