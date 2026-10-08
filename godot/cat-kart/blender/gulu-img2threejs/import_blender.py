import bpy, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'gulu-img2threejs-r7.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
report={'source':'img2threejs procedural TypeScript factory, exported from actual Three.js scene','status':'draft; reference fidelity gates failed','meshCount':len(meshes),'triangles':sum(len(o.data.polygons) for o in meshes)}
for o in meshes:
    for p in o.data.polygons:p.use_smooth=True
    o['source']='img2threejs';o['reviewStatus']='draft'
collection=bpy.data.collections.new('REFERENCE — Gulu clay turnaround');bpy.context.scene.collection.children.link(collection)
for view,pos,rot in [('front',(0,.55,.5),(math.pi/2,0,0)),('left',(.6,0,.5),(math.pi/2,0,math.pi/2))]:
    im=bpy.data.images.load(str(ROOT/f'reference-{view}.png'));im.pack()
    o=bpy.data.objects.new('Reference_'+view,None);o.empty_display_type='IMAGE';o.data=im;o.empty_display_size=1.05;o.location=pos;o.rotation_euler=rot;o.empty_image_depth='BACK';o.color[3]=.45;collection.objects.link(o)
collection.hide_render=True;collection.hide_viewport=True
bpy.ops.object.camera_add(location=(1.5,-2.7,1.15));camera=bpy.context.object;camera.name='ReviewCamera';camera.data.type='ORTHO';camera.data.ortho_scale=1.35
camera.rotation_euler=(Vector((-.04,0,.51))-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=camera
for loc,power,size in [((-2,-3,4),450,4),((3,-1,2),150,3),((0,3,3),350,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.world.color=(.22,.22,.22)
scene['reviewStatus']='REFERENCE SHAPE NOT ACCEPTED — see comparison-front.png'
scene['provenance']='Generated using installed img2threejs skill; this Blender file is an editable import of the procedural output.'
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=700;scene.render.resolution_y=740;scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='MATERIAL';space.region_3d.view_distance=1.9;space.region_3d.view_location=Vector((-.04,0,.50));space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'gulu-img2threejs-r7.blend'))
(ROOT/'blender-import-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))





