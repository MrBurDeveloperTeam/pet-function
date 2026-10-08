import bpy,os,math
from mathutils import Vector
base=os.path.dirname(__file__)
for name in ['mallow','silverbelt','fastrat','gulu','munchkin','mochi']:
 bpy.ops.wm.open_mainfile(filepath=os.path.join(base,'source',name+'_driver.blend'))
 scene=bpy.context.scene
 scene.render.engine='CYCLES';scene.cycles.samples=16
 scene.render.resolution_x=480;scene.render.resolution_y=600;scene.render.resolution_percentage=100
 scene.world.color=(.15,.15,.15)
 scene.view_settings.view_transform='Standard'
 bpy.ops.object.camera_add(location=(0,4,.75))
 camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.75))-camera.location).to_track_quat('-Z','Y').to_euler()
 camera.data.type='ORTHO';camera.data.ortho_scale=1.85;scene.camera=camera
 bpy.ops.object.light_add(type='AREA',location=(1,3,3));bpy.context.object.data.energy=130;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=4
 scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(base,name+'-review.local.png')
 bpy.ops.render.render(write_still=True)
