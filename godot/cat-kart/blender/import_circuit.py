import bpy, os
from mathutils import Vector
folder=os.path.join(os.path.dirname(__file__),'source')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(folder,'circuit.glb'))
scene=bpy.context.scene
scene.world.color=(.3,.3,.3)
bpy.ops.object.camera_add(location=(190,-175,160))
cam=bpy.context.object
cam.name='Circuit overview'
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=430
scene.camera=cam
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=280
   area.spaces.active.region_3d.view_location=(0,0,0)
   area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder,'circuit.blend'))
print('BLENDER CIRCUIT OVERVIEW SAVED')
