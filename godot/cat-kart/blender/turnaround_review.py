"""Visible front/side/back comparison of the rebuilt cat volumes."""
import bpy,os,math,sys
from mathutils import Quaternion,Vector
base=os.path.dirname(__file__)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for row,name in enumerate(['mallow','mallow'] if '--clay' in sys.argv else ['mallow','fastrat']):
 for column,angle in enumerate([0,math.pi/2,math.pi]):
  with bpy.data.libraries.load(os.path.join(base,'source',name+'_driver.blend'),link=False) as (src,dst):dst.objects=src.objects
  objects=[o for o in dst.objects if o is not None]
  for o in objects:bpy.context.collection.objects.link(o)
  if '--clay' in sys.argv and row==1:
   clay=bpy.data.materials.new('Unpainted anatomy');clay.diffuse_color=(.43,.43,.43,1);clay.use_nodes=True
   clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=clay.diffuse_color
   clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.75
   for o in objects:
    if o.type=='MESH':
     o.data.materials.clear();o.data.materials.append(clay)
     for poly in o.data.polygons:poly.material_index=0
  root=next(o for o in objects if o.parent is None and o.type=='EMPTY')
  root.location.x=(column-1)*1.85
  root.location.z=(1-row)*1.85
  root.rotation_euler.z=angle
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL'
   area.spaces.active.overlay.show_overlays=False
   area.spaces.active.region_3d.view_rotation=Quaternion((0,0,1),math.pi) @ Quaternion((1,0,0),math.pi/2)
   area.spaces.active.region_3d.view_distance=6.5
   area.spaces.active.region_3d.view_location=(0,0,1.65)
   area.spaces.active.region_3d.view_perspective='ORTHO'
scene=bpy.context.scene
bpy.ops.object.camera_add(location=(0,10,1.65))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.65))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=6.1
scene.camera=camera
for position,power,scale in [((3,4,6),650,5),((-4,1,3),350,4)]:
 bpy.ops.object.light_add(type='AREA',location=position)
 light=bpy.context.object
 light.data.energy=power
 light.data.shape='DISK'
 light.data.size=scale
 light.rotation_euler=(Vector((0,0,1.5))-light.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.13,.13,.13)
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.render.resolution_x=1440
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
output='anatomical_structure_review' if '--clay' in sys.argv else ('anatomical_cats_turnaround' if '--anatomy' in sys.argv else 'rounded_cats_turnaround')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'source',output+'.blend'))
if '--render' in sys.argv:
 scene.render.filepath=os.path.join(base,output+'.local.png')
 bpy.ops.render.render(write_still=True)
