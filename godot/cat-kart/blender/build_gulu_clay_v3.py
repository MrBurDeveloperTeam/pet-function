"""Neutral Gulu silhouette study from the two translucent construction sheets.
No colour, fur, texture, rig or game replacement. Dedicated editable blockout.
"""
import bpy, math, os, json, bmesh
from mathutils import Vector, Quaternion
BASE=os.path.dirname(__file__)
exec(compile(open(os.path.join(BASE,'build_soft_kittens.py'),encoding='utf-8').read().split('def build(identity):')[0],'shape_helpers','exec'))
OUT=os.path.join(BASE,'gulu-clay-v3');os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
clay=material('Neutral grey clay','a7a7a7',.79)
root=bpy.data.objects.new('Gulu — clay reference study v3',None);bpy.context.collection.objects.link(root)
parts=[]
def loft(name,rings,n=48):
 verts=[];faces=[]
 for z,rx,front,back in rings:
  middle=(back+front)*.5;depth=(back-front)*.5
  for j in range(n):
   a=j*math.tau/n;verts.append((rx*math.cos(a),middle+depth*math.sin(a),z))
 for k in range(len(rings)-1):
  for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
 faces.extend([tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+j for j in range(n))])
 o=mesh(name,verts,faces);bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('Organic contour interpolation','SUBSURF');m.levels=2;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
parts.append(loft('Rounded skull contour',[(.705,.07,-.15,.13),(.75,.225,-.24,.20),(.84,.338,-.308,.263),(.96,.381,-.313,.312),(1.08,.385,-.301,.33),(1.2,.345,-.258,.30),(1.3,.255,-.176,.22),(1.35,.12,-.04,.11),(1.36,.015,.03,.05)]))
parts.append(loft('Compact seated torso',[(.04,.11,-.08,.22),(.1,.245,-.125,.29),(.24,.281,-.15,.334),(.42,.271,-.13,.32),(.56,.249,-.10,.27),(.69,.211,-.09,.211),(.78,.18,-.10,.16),(.85,.11,-.065,.125),(.87,.05,-.015,.07)]))
def interpolate(points,radii):
 out=[];rr=[]
 p=[Vector(points[0])]+[Vector(v) for v in points]+[Vector(points[-1])]
 r=[radii[0]]+radii+[radii[-1]]
 for i in range(1,len(p)-2):
  for j in range(8):
   t=j/8;t2=t*t;t3=t2*t
   weights=(-t+2*t2-t3,2-5*t2+3*t3,t+4*t2-3*t3,-t2+t3)
   out.append(tuple(sum((p[i-1+k]*weights[k] for k in range(4)),Vector())*.5))
   rr.append(sum(r[i-1+k]*weights[k] for k in range(4))*.5)
 out.append(points[-1]);rr.append(radii[-1]);return out,rr
for s in [-1,1]:
 parts.extend([ellipsoid('Soft muzzle',(s*.053,-.309,.87),(.074,.044,.054)),
  ellipsoid('Internal shoulder transition',(s*.158,.025,.574),(.105,.126,.14)),
  ellipsoid('Folded hind thigh',(s*.235,.104,.25),(.145,.216,.219)),
  ellipsoid('Hind paw',(s*.262,-.038,.09),(.109,.146,.079)),
  ellipsoid('Front paw',(s*.14,-.25,.082),(.108,.143,.075))])
 leg_points,leg_radius=interpolate([(s*.177,-.116,.596),(s*.171,-.156,.48),(s*.15,-.207,.303),(s*.14,-.25,.126)],[.09,.111,.103,.082])
 parts.append(sweep('Tapered natural foreleg',leg_points,leg_radius,24))
 for k in [-1.5,-.5,.5,1.5]:parts.append(ellipsoid('Four rounded front toes',(s*.14+k*.034,-.342,.073),(.031,.052,.056)))
 # Broad roots overlap the cranium; ear bowl is carved only after union.
 parts.append(ellipsoid('Broad ear root',(s*.294,.027,1.257),(.127,.118,.131)))
 vv=[];ff=[]
 for x,z,w,d,y in [(s*.292,1.22,.26,.21,.015),(s*.326,1.32,.243,.17,.016),(s*.377,1.46,.151,.096,.018),(s*.404,1.545,.025,.025,.026)]:
  for j in range(24):vv.append((x+w*.5*math.cos(j*math.tau/24),y+d*.5*math.sin(j*math.tau/24),z))
 for k in range(3):
  for j in range(24):ff.append((k*24+j,k*24+(j+1)%24,(k+1)*24+(j+1)%24,(k+1)*24+j))
 ff.extend([tuple(range(23,-1,-1)),tuple(range(72,96))]);parts.append(mesh('Connected curved pinna',vv,ff))
 # Tail follows the front reference: cat's right / viewer's left, upright tip.
tail_path=[(-.08,.285,.257),(-.22,.303,.177),(-.37,.272,.206),(-.497,.242,.30),(-.558,.214,.426),(-.555,.192,.562),(-.525,.185,.681)]
tail_radius=[.095,.112,.127,.13,.125,.119,.105]
tail_points,tail_radii=interpolate(tail_path,tail_radius)
tail=sweep('Full tail volume',tail_points,tail_radii,24);parts.append(tail)
parts.append(ellipsoid('Round tail tip',tail_path[-1],(.109,.109,.109)))
body=union(parts);body.name='Connected Gulu grey sculpt including tail'
for s in [-1,1]:
 difference(body,ellipsoid('Ear concha cutter',(s*.344,-.071,1.365),(.077,.078,.122)),'Concave ear bowl')
 difference(body,ellipsoid('Shallow socket cutter',(s*.148,-.279,1.018),(.098,.105,.102)),'Shallow eye socket')
 eye=ellipsoid(('Left' if s<0 else 'Right')+' unpainted eyeball',(s*.148,-.211,1.018),(.107,.107,.107),clay);eye.parent=root
 # Shallow sculpted iris and pupil on the curved globe, with no material colour.
 for v in eye.data.vertices:
  if v.co.y<0:
   radius=math.hypot(v.co.x,v.co.z)
   v.co.y+=.004*(1-smooth(.038,.048,radius))
   v.co.y-=.0015*math.exp(-((radius-.060)/.005)**2)
body.data.materials.clear();body.data.materials.append(clay);body.parent=root
# Nose is a real rounded solid, retained separately for later refinement.
nose=mesh('Unpainted rounded nose',[(-.033,-.342,.900),(.033,-.342,.900),(0,-.361,.872),(-.029,-.323,.894),(.029,-.323,.894),(0,-.343,.874)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
nose.data.materials.append(clay);nose.parent=root;bpy.context.view_layer.objects.active=nose
m=nose.modifiers.new('Soft nose contour','BEVEL');m.width=.008;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
for p in nose.data.polygons:p.use_smooth=True
for pts in [[(0,-.349,.875),(0,-.349,.852)],[(0,-.349,.852),(-.029,-.342,.841),(-.045,-.331,.846)],[(0,-.349,.852),(.029,-.342,.841),(.045,-.331,.846)]]:
 difference(body,sweep('Muzzle seam cutter',pts,[.0028]*len(pts),8),'Shallow closed mouth')
# Preserve the centerline as an editable guide without double-rendering it.
guides=bpy.data.collections.new('TAIL AND PROPORTION GUIDES');bpy.context.scene.collection.children.link(guides);guides.hide_render=True;guides.hide_viewport=True
curve=bpy.data.curves.new('Tail shape control','CURVE');curve.dimensions='3D';spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(tail_path)-1)
for p,co in zip(spline.bezier_points,tail_path):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
guide=bpy.data.objects.new('Editable tail centerline',curve);guides.objects.link(guide)
references=bpy.data.collections.new('TWO TRANSLUCENT REFERENCES');bpy.context.scene.collection.children.link(references);references.hide_render=True;references.hide_viewport=True
for i,name in enumerate(['gulu-translucent-six-views.png','gulu-hidden-connections.png']):
 im=bpy.data.images.load(os.path.join(BASE,'concepts','gulu-hidden-structure-v1',name));im.pack()
 o=bpy.data.objects.new(name,None);o.empty_display_type='IMAGE';o.data=im;o.empty_display_size=3;o.location=(3,0,i*2);o.rotation_euler.x=math.pi/2;references.objects.link(o)
im=bpy.data.images.load(os.path.join(OUT,'reference-sheet.png'));im.pack()
o=bpy.data.objects.new('PRIMARY CLAY REFERENCE',None);o.empty_display_type='IMAGE';o.data=im;o.empty_display_size=3;o.location=(3,0,4);o.rotation_euler.x=math.pi/2;references.objects.link(o)
scene=bpy.context.scene;scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.25,.25,.25,1);bg.inputs['Strength'].default_value=.4
for position,power,size in [((-3,-4,5),400,4),((3,-2,3),220,3),((0,3,4),450,3)]:
 bpy.ops.object.light_add(type='AREA',location=position);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,.75))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-4,.77));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.72;scene.camera=cam
cam.rotation_euler=(Vector((-.06,0,.77))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.film_transparent=True
scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='SOLID';area.spaces.active.overlay.show_overlays=False
   area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2);area.spaces.active.region_3d.view_location=(-.06,0,.77);area.spaces.active.region_3d.view_distance=3
# Connection checks on the actual final body, including the tail base.
bm=bmesh.new();bm.from_mesh(body.data);remaining=set(bm.verts);components=[]
while remaining:
 stack=[remaining.pop()];n=0
 while stack:
  v=stack.pop();n+=1
  for e in v.link_edges:
   w=e.other_vert(v)
   if w in remaining:remaining.remove(w);stack.append(w)
 components.append(n)
nonmanifold=sum(not e.is_manifold for e in bm.edges);bm.free()
assert len(components)==1,components
bpy.context.view_layer.update()
with open(os.path.join(OUT,'shape-check.json'),'w') as f:json.dump({'connected_body_and_tail_components':len(components),'nonmanifold_edges':nonmanifold,'dimensions_xyz':list(body.dimensions),'reference_units':'normalized design units; source has no physical measurements','colours':False,'fur':False,'rigged':False},f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'gulu-clay-study.blend'))
for name,pos,target in [('front',(0,-4,.77),(0,0,.77)),('left',(4,0,.77),(0,0,.77)),('right',(-4,0,.77),(0,0,.77)),('back',(0,4,.77),(0,0,.77)),('top',(0,0,5),(0,0,.77)),('bottom',(0,0,-4),(0,0,.77)),('three-quarter',(3,-4,1.6),(0,0,.77))]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children):o.select_set(True)
root.rotation_mode='XYZ';root.rotation_euler.z=math.pi
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'gulu-clay-study.glb'),export_format='GLB',use_selection=True,export_yup=True)
print('GULU GREY BLOCKOUT COMPLETE',flush=True)
