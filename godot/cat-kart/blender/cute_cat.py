"""Cute seated kitten study: welded anatomy and physical inset eyes."""
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
parts=[oval('Rounded feline skull',(cx,eye_y+.015,.065),(.92,.67,.66),fur,head)]
for s in [-1,1]:
 parts.append(oval('Cheek',(cx+s*.245,eye_y-.135,-.025),(.35,.30,.42),fur,head))
 parts.append(oval('Muzzle',(cx+s*.055,eye_y-.15,-.225),(.17,.13,.105),cream,head))
 # A fleshy ear root grows through the crown. The shell tapers out of it,
 # with no flat bottom edge or separate triangular card.
 parts.append(oval('Broad blended ear root',(cx+s*.30,eye_y+.20,.04),(.34,.31,.33),fur,head))
 vv=[];rings=[(.12,.285,.32,.28,.045),(.23,.32,.27,.23,.025),(.34,.35,.17,.145,.025),(.46,.375,.025,.035,.03)]
 for yy,xx,width,depth,zz in rings:
  for j in range(16):
   a=j*math.tau/16;vv.append((cx+s*xx+width*.5*math.cos(a),eye_y+yy,zz+depth*.5*math.sin(a)))
 faces=[tuple(range(15,-1,-1)),tuple(range(48,64))]
 for r in range(3):
  for j in range(16):faces.append((r*16+j,r*16+(j+1)%16,(r+1)*16+(j+1)%16,(r+1)*16+j))
 parts.append(mesh('Tapered organic ear shell',vv,faces,fur,head))
skull=combine(parts,'Continuous head cheeks muzzle and ear roots',head)
def carve(obj,cutter,label):
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new(label,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
amber=mat('Honey amber iris','dca947');ink=mat('Warm dark pupil','171c21');glint=mat('Eye catchlight','fff5da')
for x in [cx-.18,cx+.18]:
 cutter=oval('Orbital excavation',(x,eye_y,-.225),(.275,.235,.115),fur,head)
 carve(skull,cutter,'Shallow orbital cavity')
 oval('Inset curved eyeball',(x,eye_y,-.148),(.239,.209,.118),ink,head)
 oval('Amber iris',(x,eye_y,-.199),(.212,.189,.032),amber,head)
 oval('Rounded feline pupil',(x,eye_y,-.214),(.155,.174,.017),ink,head)
 oval('Large catchlight',(x-.027,eye_y+.048,-.225),(.044,.051,.010),glint,head)
 oval('Small catchlight',(x+.026,eye_y-.036,-.225),(.018,.020,.009),glint,head)
for s in [-1,1]:
 cutter=oval('Shallow inner ear bowl',(cx+s*.335,eye_y+.305,-.083),(.13,.18,.115),pink,head)
 carve(skull,cutter,'Sculpted inner ear hollow')
# Colour masks on the sculpted surface: they cannot change its silhouette.
skull.data.materials.clear();skull.data.materials.append(fur);skull.data.materials.append(cream);skull.data.materials.append(pink)
bpy.context.view_layer.update()
for poly in skull.data.polygons:
 co=skull.matrix_local @ poly.center
 gx,gy,gz=co.x,co.z,-co.y
 muzzle=((gx-cx)/.195)**2+((gy-(eye_y-.147))/.102)**2<1
 bridge=abs(gx-cx)<min(.075,.025+.26*(eye_y+.055-gy)) and eye_y-.16<gy<eye_y+.055
 if gz<-.13 and (muzzle or bridge):poly.material_index=1
 # The pink is painted on the carved shell itself, never a floating liner.
 if ((abs(gx-cx)-.335)/.067)**2+((gy-(eye_y+.305))/.095)**2<1 and -.087<gz<-.017:poly.material_index=2
# Rounded nose is supported by the continuous muzzle underneath it.
mesh('Leather nose',[(cx-.033,eye_y-.12,-.283),(cx+.033,eye_y-.12,-.283),(cx,eye_y-.153,-.29),
                    (cx-.032,eye_y-.12,-.267),(cx+.032,eye_y-.12,-.267),(cx,eye_y-.153,-.274)],
     [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],pink,head)
ink=mat('Mouth creases','342b2d')
rod('Philtrum',(cx,eye_y-.153,-.283),(cx,eye_y-.177,-.28),.0025,ink,head)
for s in [-1,1]:
 rod('Mouth crease',(cx,eye_y-.177,-.28),(cx+s*.035,eye_y-.185,-.274),.0023,ink,head)
 for j in range(3):rod('Whisker',(cx+s*.105,eye_y-.145+j*.014,-.268),(cx+s*(.31+j*.03),eye_y-.17+j*.045,-.235),.0018,cream,head)
parts=[oval('Ribcage',(cx,.35,.105),(.62,.65,.58),fur,driver),oval('Neck',(cx,.63,.075),(.38,.30,.39),fur,driver)]
for s in [-1,1]:
 parts.append(oval('Foreleg',(cx+s*.14,.225,-.132),(.17,.35,.205),fur,driver))
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
# A kitten crouches on four paws; avoid the human-like upright shoulder line.
for o in list(head.children):o.location.z-=.145
for v in body.data.vertices:v.co.z*=.73
body.location.z*=.73
for o in tail.children:
 o.location.z*=.73
 for v in o.data.vertices:v.co.z*=.73
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'source','mallow_cute_sculpt.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(base,'..','models','mallow_cute_sculpt.glb'),export_format='GLB',export_yup=True)
print('CUTE MALLOW STUDY SAVED')
