"""Gulu reference sculpt: native connected anatomy, volumetric eyes and groom.
Run with Blender --background --python this_file. Does not replace game assets.
"""
import bpy, os, math, sys, json, bmesh
from mathutils import Vector, Quaternion
BASE=os.path.dirname(__file__)
exec(compile(open(os.path.join(BASE,'build_soft_kittens.py'),encoding='utf-8').read().split('def build(identity):')[0],'gulu_helpers','exec'))
OUT=os.path.join(BASE,'gulu-reference-model-v1');os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
root=bpy.data.objects.new('Gulu',None);bpy.context.collection.objects.link(root)
PALETTES[3]=('817363','302a24','e6d8c1','71913c')

def coat(pos,identity=3):
 x,y,z=pos;base,dark,cream,_=map(rgb,PALETTES[3]);c=base.copy()
 front=1-smooth(-.08,.08,y)
 # Broken mackerel markings flow over a genuine volume rather than a face card.
 a=math.atan2(x,y-.04);stripe=0
 if z<.86:
  for k in range(6):
   line=.15+k*.119+.028*math.sin(a*2.1+k*.6)+.025*math.sin(abs(x)*13+k)
   stroke=1-smooth(.014,.029,abs(z-line))
   stripe=max(stripe,stroke*(.45+.55*math.sin(a*1.6+k*.6)**2))
 elif z>1.34:
  for offset in [.045,.13,.235]:
   stripe=max(stripe,(1-smooth(.013,.026,abs(abs(x)-offset-.028*math.sin(z*14+offset*15))))*.94)
  if y>.10:stripe=max(stripe,(1-smooth(.02,.047,abs(x)))*.9)
 else:
  for k in range(3):
   line=.98+k*.083+.24*(abs(x)-.24)+.015*math.sin(y*17+k)
   stripe=max(stripe,(1-smooth(.009,.024,abs(z-line)))*smooth(.17,.29,abs(x)))
 c=mix(c,dark,min(1,stripe)*.93)
 muzzle=(x/.18)**2+((z-.989)/.116)**2
 white=(1-smooth(.78,1.16,muzzle))*front
 bib=(x/.125)**2+((z-.59)/.32)**2
 white=max(white,(1-smooth(.7,1.15,bib))*front*.88)
 white=max(white,1-smooth(.115,.157,z))
 c=mix(c,cream,min(1,white))
 for s in [-1,1]:
  inner=((x-s*.338)/.09)**2+((z-1.55)/.142)**2
  if inner<1.05 and -.13<y<.04 and z>1.405:
   c=mix(c,rgb('c18c87'),(1-smooth(.58,1.07,inner))*.95)
 return c*(1+.017*math.sin(x*381+z*172)*math.sin(y*327+z*229))

parts=[ellipsoid('Skull',(0,.035,1.22),(.415,.325,.36)),
 ellipsoid('Lower feline face',(0,-.006,1.064),(.355,.293,.224)),
 ellipsoid('Compact pear torso',(0,.074,.478),(.277,.25,.42)),
 ellipsoid('Connected neck',(0,.035,.839),(.222,.222,.19))]
for s in [-1,1]:
 parts.extend([ellipsoid('Rounded cheek',(s*.21,-.042,1.105),(.19,.245,.182)),
  ellipsoid('Whisker pad',(s*.061,-.283,.994),(.095,.098,.075)),
  ellipsoid('Seated haunch',(s*.211,.092,.252),(.17,.208,.235)),
  ellipsoid('Hind paw',(s*.262,-.039,.09),(.125,.158,.082)),
  ellipsoid('Shoulder',(s*.153,-.072,.654),(.103,.125,.155)),
  ellipsoid('Foreleg',(s*.133,-.135,.364),(.092,.106,.29)),
  ellipsoid('Forepaw',(s*.133,-.23,.085),(.112,.15,.079)),
  ellipsoid('Ear root',(s*.292,.03,1.431),(.148,.137,.143))])
 for toe in [-1,0,1]:parts.append(ellipsoid('Toe',(s*.133+toe*.04,-.327,.077),(.036,.059,.063)))
 vv=[];ff=[]
 for x,z,w,d,y in [(s*.28,1.38,.255,.22,.02),(s*.322,1.49,.235,.173,.022),(s*.371,1.64,.115,.085,.026),(s*.386,1.71,.014,.015,.033)]:
  for j in range(24):vv.append((x+w*.5*math.cos(j*math.tau/24),y+d*.5*math.sin(j*math.tau/24),z))
 for k in range(3):
  for j in range(24):ff.append((k*24+j,k*24+(j+1)%24,(k+1)*24+(j+1)%24,(k+1)*24+j))
 ff.extend([tuple(range(23,-1,-1)),tuple(range(72,96))]);parts.append(mesh('Integrated ear',vv,ff))
body=union(parts);body.name='Gulu connected sculpt'
for s in [-1,1]:
 difference(body,ellipsoid('Orbital recess',(s*.18,-.291,1.19),(.155,.143,.151)),'Recessed eye socket')
 difference(body,ellipsoid('Ear concha',(s*.338,-.071,1.545),(.079,.087,.133)),'Connected ear hollow')
fur=fur_material(3);paint(body,3,fur)

def round_eye(s):
 o=eyeball(s*.18,3);o.name=('Left' if s<0 else 'Right')+' spherical eye'
 # Convert the old ellipsoid helper to a genuinely spherical eyeball.
 for v in o.data.vertices:
  v.co.x*=.141/.129;v.co.y*=.141/.083;v.co.z*=.141/.129
 o.location=(s*.18,-.149,1.19)
 # Surface-projected iris remains attached to the curved eyeball.
 uv=o.data.uv_layers.active
 for p in o.data.polygons:
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(.5+co.x/.268,.5+co.z/.268)
 return o
for s in [-1,1]:
 round_eye(s)
 points=[]
 for j in range(65):
  a=j*math.tau/64;points.append((s*.18+.129*math.cos(a),-.210-.006*math.sin(a),1.19+.127*math.sin(a)))
 lid=sweep(('Left' if s<0 else 'Right')+' soft eyelid',points,[.009]*65,10)
 paint(lid,3,fur)
nosemat=material('Pink nose skin','cc8c83',.46)
nose=mesh('Gulu rounded triangular nose',[(-.041,-.373,1.035),(.041,-.373,1.035),(0,-.403,.996),(-.035,-.351,1.027),(.035,-.351,1.027),(0,-.372,.999)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
nose.data.materials.append(nosemat);bpy.context.view_layer.objects.active=nose
mod=nose.modifiers.new('Rounded nasal cartilage','BEVEL');mod.width=.011;mod.segments=4;bpy.ops.object.modifier_apply(modifier=mod.name)
for s in [-1,1]:difference(nose,ellipsoid('Nostril cutter',(s*.024,-.384,1.020),(.008,.010,.006)),'Small nostril depression')
for p in nose.data.polygons:p.use_smooth=True
# Mouth seams are recessed in the muzzle mesh, not floating curves.
mouthmat=material('Mouth interior','574137',.88)
paths=[[(0,-.381,1.002),(0,-.380,.977)],[(0,-.380,.977),(-.03,-.376,.965),(-.052,-.363,.970)],[(0,-.380,.977),(.03,-.376,.965),(.052,-.363,.970)]]
for i,pts in enumerate(paths):
 cutter=sweep('Mouth groove cutter',pts,[.004]*len(pts),8);difference(body,cutter,'Shallow mouth crease')
 inset=sweep('Recessed mouth '+str(i),[(x,y+.004,z) for x,y,z in pts],[.0013]*len(pts),8);inset.data.materials.append(mouthmat)
body.data.update();paint(body,3,fur)
whiskermat=material('Ivory whiskers','eee5d6',.55)
for s in [-1,1]:
 for j in range(5):
  z=.98+j*.018
  w=sweep('Whisker',[(s*.088,-.376,z),(s*.245,-.366,z+.008*(j-2)),(s*(.41+j*.012),-.305,z+.02*(j-2))],[.0009,.00065,.00012],5);w.data.materials.append(whiskermat)
points=[]
for i in range(40):
 t=i/39;points.append((-.13-.35*math.sin(t*math.pi*.64),.16+.09*math.sin(t*math.pi),.18+.45*t))
tail=sweep('Thick ringed tail',points,[.075*(1-.75*(i/39)**4) for i in range(40)],20);tail.data.materials.append(fur)
attr=tail.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
for v in tail.data.vertices:
 t=v.index//20/39;ring=1-smooth(.2,.4,abs(math.sin(t*math.pi*6)))
 attr.data[v.index].color=(*mix(rgb(PALETTES[3][0]),rgb(PALETTES[3][1]),ring*.9),1)
padmat=material('Soft paw pads','b68076',.72)
for x,y in [(-.133,-.235),(.133,-.235),(-.262,-.04),(.262,-.04)]:
 ellipsoid('Central paw pad',(x,y,.014),(.052,.045,.012),padmat)
 for k in [-1,0,1]:ellipsoid('Toe pad',(x+k*.035,y-.062,.017),(.021,.022,.011),padmat)
# Groom starts on the actual connected mesh. Studio has fine strands;
# separate game export below retains fewer strands without changing anatomy.
studiofur=groom(body,3,fur,58000);studiofur.name='Studio groom — disable for game'
def tail_groom(count):
 h=groom(tail,3,fur,count);h.name='Tail groom'
 for v in h.data.vertices:
  t=max(0,min(1,(v.co.z-.18)/.45));ring=1-smooth(.2,.4,abs(math.sin(t*math.pi*6)))
  h.data.color_attributes['Coat'].data[v.index].color=(*mix(rgb(PALETTES[3][0]),rgb(PALETTES[3][1]),ring*.9),1)
 return h
studio_tail=tail_groom(7000)
def compact(obj,inverse=False):
 if obj.type!='MESH':return
 for v in obj.data.vertices:
  p=obj.matrix_world@v.co
  if inverse:p.z=p.z/.78 if p.z<.6864 else p.z+.1936
  else:p.z=p.z*.78 if p.z<.88 else p.z-.1936
  v.co=obj.matrix_world.inverted()@p
bpy.context.view_layer.update()
for o in list(bpy.context.scene.objects):compact(o)
for o in list(bpy.context.scene.objects):
 if o!=root:o.parent=root
model=bpy.data.collections.new('GULU MODEL');bpy.context.scene.collection.children.link(model)
for o in list(bpy.context.scene.objects):
 for c in list(o.users_collection):c.objects.unlink(o)
 model.objects.link(o)
refs=bpy.data.collections.new('REFERENCE IMAGES — hidden in render');bpy.context.scene.collection.children.link(refs);refs.hide_render=True
refdir=os.path.join(BASE,'concepts','gulu-reference-v1')
for name in ['gulu-six-views.png','gulu-facial-structure.png','gulu-underside-study.png','six-cats-original.png']:
 image=bpy.data.images.load(os.path.join(refdir,name));image.pack()
 o=bpy.data.objects.new(name,None);o.empty_display_type='IMAGE';o.data=image;o.empty_display_size=2.1;o.location=(2.6,0,1);o.rotation_euler.x=math.pi/2;refs.objects.link(o);o.hide_viewport=True
scene=bpy.context.scene;scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.24,.22,.20,1);scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.35
for position,power,size in [((-3,-4,5),260,3),((3,-2,3),160,3),((0,3,4),320,3)]:
 bpy.ops.object.light_add(type='AREA',location=position);lamp=bpy.context.object;lamp.name='Studio area';lamp.data.energy=power;lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,.9))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-4,.86));camera=bpy.context.object;camera.name='Orthographic review';camera.rotation_euler=(Vector((0,0,.86))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.94;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.render.film_transparent=True
scene.render.resolution_x=850;scene.render.resolution_y=900;scene.render.resolution_percentage=100
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
   area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2);area.spaces.active.region_3d.view_distance=3.3;area.spaces.active.region_3d.view_location=(0,0,.86)
bm=bmesh.new();bm.from_mesh(body.data);remaining=set(bm.verts);components=[]
while remaining:
 stack=[remaining.pop()];n=0
 while stack:
  v=stack.pop();n+=1
  for e in v.link_edges:
   other=e.other_vert(v)
   if other in remaining:remaining.remove(other);stack.append(other)
 components.append(n)
bm.free();assert len(components)==1,components
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'gulu-sculpt.blend'))
angles=[('front',(0,-4,.86)),('left',(4,0,.86)),('right',(-4,0,.86)),('back',(0,4,.86)),('top',(0,0,5)),('bottom',(0,0,-4))]
for name,pos in angles:
 camera.location=pos;camera.rotation_euler=(Vector((0,0,.86))-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=os.path.join(OUT,'gulu-'+name+'.png');bpy.ops.render.render(write_still=True)
camera.location=(0,-4,.95);camera.rotation_euler=(Vector((0,0,.95))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.99
scene.render.filepath=os.path.join(OUT,'gulu-face.png');bpy.ops.render.render(write_still=True)
# Preserve a distinct reduced export file; never overwrite the sculpt master.
bpy.data.objects.remove(studiofur,do_unlink=True)
bpy.data.objects.remove(studio_tail,do_unlink=True)
bpy.context.view_layer.objects.active=body
mod=body.modifiers.new('Game body reduction','DECIMATE');mod.ratio=.32;bpy.ops.object.modifier_apply(modifier=mod.name)
compact(body,inverse=True)
gamefur=groom(body,3,fur,1600);compact(body);compact(gamefur);gamefur.parent=root;gamefur.name='Game short fur'
compact(tail,inverse=True);game_tail=tail_groom(350);compact(tail);compact(game_tail);game_tail.parent=root
root.name='Gulu';root.rotation_mode='XYZ';root.rotation_euler.z=math.pi
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'gulu-game.glb'),export_format='GLB',export_yup=True,use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'gulu-game.blend'))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children if o.type=='MESH')
with open(os.path.join(OUT,'validation.json'),'w') as f:json.dump({'connected_body_components':len(components),'game_triangles':tris,'game_glb_bytes':os.path.getsize(os.path.join(OUT,'gulu-game.glb')),'front_axis_game':'-Z','rigged':False},f,indent=2)
print('GULU REFERENCE MODEL COMPLETE',tris,flush=True)
