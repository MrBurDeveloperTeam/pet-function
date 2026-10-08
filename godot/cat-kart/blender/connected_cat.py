"""Connected cat sculpt prototype. Ear roots and all limbs are remeshed in place."""
import bpy,os,math,sys
from mathutils import Vector,Quaternion
base=os.path.dirname(__file__)
helpers=open(os.path.join(base,'rebuild.py')).read().split('exec(compile(')[0].replace('segments=24,ring_count=12','segments=48,ring_count=32')
exec(compile(helpers,'kart_helpers','exec'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
identity='mallow';id=0
original=bpy.data.images.load(os.path.join(base,'..','art','references',identity+'.png'),check_existing=False)
w,h=original.size;unit=1.48/h;pixels=list(original.pixels)
cx=(.5-42.75/w)*w*unit;eye_y=(h-1-42)*unit
fur=mat('Mallow charcoal fur','595c63');cream=mat('Mallow warm white fur','e8e4db');pink=mat('Ear cartilage','b88580')
for m in [fur,cream,pink]:
 bs=m.node_tree.nodes.get('Principled BSDF');c=bs.inputs['Base Color'].default_value
 bs.inputs['Base Color'].default_value=(*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c[:3]),1)
driver=empty('Driver');head=empty('Head',driver);tail=empty('Tail',driver)
def combine(parts,label,parent,voxel=.014):
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 bpy.ops.object.join();o=bpy.context.object;o.name=label
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 remesh=o.modifiers.new('Weld continuous anatomy','REMESH');remesh.mode='VOXEL';remesh.voxel_size=voxel
 bpy.ops.object.modifier_apply(modifier=remesh.name)
 smooth=o.modifiers.new('Relax sculpt surface','SMOOTH');smooth.factor=.60;smooth.iterations=8
 bpy.ops.object.modifier_apply(modifier=smooth.name)
 for p in o.data.polygons:p.use_smooth=True
 return o
parts=[oval('Rounded feline skull',(cx,eye_y+.015,.065),(.85,.665,.615),fur,head)]
for s in [-1,1]:
 parts.append(oval('Cheek',(cx+s*.245,eye_y-.13,-.025),(.31,.29,.40),fur,head))
 parts.append(oval('Muzzle',(cx+s*.063,eye_y-.145,-.245),(.185,.14,.135),cream,head))
 # Wide ear bases sink into the crown and cheeks, rather than sitting on top.
 vv=[(cx+s*.16,eye_y+.205,-.035),(cx+s*.43,eye_y+.205,.075),(cx+s*.36,eye_y+.445,.055),
     (cx+s*.16,eye_y+.205,.145),(cx+s*.43,eye_y+.205,.21),(cx+s*.36,eye_y+.445,.17)]
 ear=mesh('Ear root and shell',vv,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],fur,head)
 bpy.context.view_layer.objects.active=ear
 bevel=ear.modifiers.new('Soft ear edges','BEVEL');bevel.width=.017;bevel.segments=3
 bpy.ops.object.modifier_apply(modifier=bevel.name);parts.append(ear)
skull=combine(parts,'Continuous head cheeks muzzle and ear roots',head)
def carve(obj,cutter,label):
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new(label,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
for x in [(w*.5-28)*unit,(w*.5-57.5)*unit]:
 cutter=oval('Orbital excavation',(x,eye_y,-.228),(.235,.18,.17),fur,head)
 carve(skull,cutter,'Shallow orbital cavity')
 # Elliptical curved eyes nest behind the original facial surface.
 eye=oval('Inset eyeball',(x,eye_y,-.143),(.177,.137,.132),fur,head)
 # Coat artwork is only the iris colour on a physically curved eye.
 material=mat('Original amber iris','c3993b');tex=material.node_tree.nodes.new('ShaderNodeTexImage')
 tex.image=original;tex.interpolation='Closest';original.pack()
 material.node_tree.links.new(tex.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 eye.data.materials[0]=material
 uv=eye.data.uv_layers.active
 bpy.context.view_layer.update()
 for p in eye.data.polygons:
  for li in p.loop_indices:
   co=eye.matrix_local @ eye.data.vertices[eye.data.loops[li].vertex_index].co
   uv.data[li].uv=(.5-co.x/(w*unit),(co.z/unit+1)/h)
for s in [-1,1]:
 inner=[(cx+s*.235,eye_y+.26,-.035),(cx+s*.387,eye_y+.26,.020),(cx+s*.351,eye_y+.40,.045)]
 vv=[(x,y,z-.065) for x,y,z in inner]+[(x,y,z+.043) for x,y,z in inner]
 cutter=mesh('Ear bowl cutter',vv,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],pink,head)
 carve(skull,cutter,'Inset ear cartilage')
 liner=mesh('Connected inner ear bowl',[(x,y,z+.041) for x,y,z in inner],[(0,2,1)],pink,head)
# Colour masks on the sculpted surface: they cannot change its silhouette.
skull.data.materials.clear();skull.data.materials.append(fur);skull.data.materials.append(cream)
bpy.context.view_layer.update()
for poly in skull.data.polygons:
 co=skull.matrix_local @ poly.center
 gx,gy,gz=co.x,co.z,-co.y
 muzzle=((gx-cx)/.195)**2+((gy-(eye_y-.147))/.102)**2<1
 bridge=abs(gx-cx)<min(.075,.025+.26*(eye_y+.055-gy)) and eye_y-.16<gy<eye_y+.055
 if gz<-.13 and (muzzle or bridge):poly.material_index=1
# Rounded nose is supported by the continuous muzzle underneath it.
mesh('Leather nose',[(cx-.033,eye_y-.12,-.315),(cx+.033,eye_y-.12,-.315),(cx,eye_y-.153,-.323),
                    (cx-.032,eye_y-.12,-.29),(cx+.032,eye_y-.12,-.29),(cx,eye_y-.153,-.298)],
     [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],pink,head)
ink=mat('Mouth creases','342b2d')
rod('Philtrum',(cx,eye_y-.153,-.315),(cx,eye_y-.177,-.310),.0025,ink,head)
for s in [-1,1]:
 rod('Mouth crease',(cx,eye_y-.177,-.310),(cx+s*.035,eye_y-.185,-.30),.0023,ink,head)
 for j in range(3):rod('Whisker',(cx+s*.105,eye_y-.145+j*.014,-.292),(cx+s*(.31+j*.03),eye_y-.17+j*.045,-.255),.0018,cream,head)
parts=[oval('Ribcage',(cx,.37,.105),(.59,.69,.54),fur,driver),oval('Neck',(cx,.63,.075),(.36,.30,.37),fur,driver)]
for s in [-1,1]:
 parts.append(oval('Shoulder',(cx+s*.155,.46,-.055),(.22,.28,.245),fur,driver))
 parts.append(oval('Foreleg',(cx+s*.155,.255,-.132),(.17,.43,.205),fur,driver))
 parts.append(oval('Forepaw',(cx+s*.155,.073,-.202),(.20,.145,.26),cream,driver))
 parts.append(oval('Seated thigh',(cx+s*.235,.19,.13),(.27,.36,.38),fur,driver))
 parts.append(oval('Hindpaw',(cx+s*.26,.063,-.010),(.215,.13,.25),cream,driver))
 for off in [-.038,.038]:parts.append(oval('Toe',(cx+s*.155+off,.053,-.281),(.067,.085,.11),cream,driver))
body=combine(parts,'Continuous seated body shoulders four legs and paws',driver)
body.data.materials.clear();body.data.materials.append(fur);body.data.materials.append(cream)
bpy.context.view_layer.update()
for poly in body.data.polygons:
 co=body.matrix_local @ poly.center;x,y,z=co.x-cx,co.z,-co.y
 if y<.11 or (z<-.085 and .23<y<.65 and abs(x)<.075+.10*(y-.23)/.42):poly.material_index=1
# The base of the tail overlaps the rump, with a smooth tube and a tapered tip.
curve=bpy.data.curves.new('Curled tail','CURVE');curve.dimensions='3D';curve.bevel_depth=.045;curve.bevel_resolution=3
spline=curve.splines.new('BEZIER');spline.bezier_points.add(3)
for p,co,r in zip(spline.bezier_points,[(cx-.22,.15,.28),(cx-.40,.09,.32),(cx-.55,.12,.24),(cx-.58,.23,.16)],[1,1,.7,.1]):
 p.co=xyz(co);p.handle_left_type='AUTO';p.handle_right_type='AUTO';p.radius=r
obj=bpy.data.objects.new('Attached curved tail',curve);bpy.context.collection.objects.link(obj);obj.parent=tail;curve.materials.append(fur)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'source','mallow_connected_sculpt.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(base,'..','models','mallow_connected_sculpt.glb'),export_format='GLB',export_yup=True)
print('CONNECTED MALLOW PROTOTYPE SAVED')
