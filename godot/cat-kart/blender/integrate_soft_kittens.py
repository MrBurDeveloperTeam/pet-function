"""Fit the current volumetric kittens to the existing game karts."""
import bpy,os
BASE=os.path.dirname(__file__)
exec(compile(open(os.path.join(BASE,'rebuild.py')).read().split('exec(compile(')[0],'kart_helpers','exec'))
for identity,id in zip(IDS,range(6)):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=os.path.join(BASE,'soft-kittens-v2',identity+'.glb'))
 driver=next(o for o in bpy.context.scene.objects if o.parent is None);driver.name='Driver'
 driver.rotation_mode='XYZ'
 driver.rotation_euler=(0,0,math.pi)
 # The skull and body share one sculpt. Keep their geometry intact rather
 # than animating the face separately and tearing the continuous neck.
 head=empty('Head',driver);tail=empty('Tail',driver)
 for o in list(driver.children):
  if o.name.startswith('Curled tail'):o.parent=tail
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,identity+'_driver.glb'),export_format='GLB',export_yup=True)
 kart_model(driver,id)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,identity+'_kart.glb'),export_format='GLB',export_yup=True)
 print('INTEGRATED SOFT KITTEN',identity)
