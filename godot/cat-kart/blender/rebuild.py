import bpy, math, os, random, sys
from mathutils import Vector
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','models'))
os.makedirs(OUT,exist_ok=True)
SOURCE=os.path.join(os.path.dirname(__file__),'source')
os.makedirs(SOURCE,exist_ok=True)
IDS=['mallow','silverbelt','fastrat','gulu','munchkin','mochi']
FUR=['595c63','cabda6','cda563','a69a86','a69b87','595f61']
DARK=['515357','989082','4c4438','625044','666669','252630']
def rgb(s): return tuple(int(s[i:i+2],16)/255 for i in (0,2,4))
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb(color),1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=.43 if metal else .76;bs.inputs['Metallic'].default_value=metal
 return m
def xyz(p):return (p[0],-p[2],p[1])
def empty(name,parent=None,pos=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=xyz(pos);return o
def oval(name,pos,size,material,parent):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(0,0,0));o=bpy.context.object;o.name=name;o.parent=parent;o.location=xyz(pos);o.scale=(size[0]/2,size[2]/2,size[1]/2);o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 # Map the painted face to Godot's forward (-Z), Blender's +Y.
 # Assign coordinates explicitly instead of relying on the sphere operator's seam.
 uv=o.data.uv_layers.active.data
 for poly in o.data.polygons:
  values=[]
  for loop_id in poly.loop_indices:
   co=o.data.vertices[o.data.loops[loop_id].vertex_index].co.normalized()
   values.append((loop_id,(math.atan2(co.y,co.x)/math.tau)%1,.5+math.asin(max(-1,min(1,co.z)))/math.pi))
  seam=max(v[1] for v in values)-min(v[1] for v in values)>.5
  for loop_id,u,v in values:uv[loop_id].uv=(u+1 if seam and u<.5 else u,v)
 return o
def mesh(name,verts,faces,material,parent):
 data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in verts],[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(material);return o
def box(name,pos,size,material,parent,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=parent;o.location=xyz(pos)
 o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=2
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def rod(name,a,b,r,material,parent):
 va,vb=Vector(xyz(a)),Vector(xyz(b));bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(vb-va).length)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=(va+vb)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=(vb-va).to_track_quat('Z','Y');o.data.materials.append(material);return o
def torus(name,pos,major,minor,material,parent,axis='Z'):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,major_radius=major,minor_radius=minor)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=xyz(pos);o.data.materials.append(material)
 if axis=='X':o.rotation_euler.y=math.pi/2
 return o
def shell(name,rings,material,parent):
 verts=[]
 for z,y,w,h in rings:
  for i in range(12):
   a=i*math.tau/12;verts.append((w*math.cos(a),y+h*math.sin(a),z))
 faces=[]
 for r in range(len(rings)-1):
  for i in range(12):faces.append((r*12+i,r*12+(i+1)%12,(r+1)*12+(i+1)%12,(r+1)*12+i))
 faces.extend([tuple(range(11,-1,-1)),tuple((len(rings)-1)*12+i for i in range(12))])
 return mesh(name,verts,faces,material,parent)
def kart_model(driver,id):
 root=empty('Kart');driver.parent=root;driver.location=xyz((0,.88,.05))
 paint=mat('Enamel '+IDS[id],['239b9e','d89b32','c95440','747ec3','679961','b77f9d'][id],.45)
 metal=mat('Brushed aluminium','a9b4b9',.8);dark=mat('Carbon graphite','202b33',.35);rubber=mat('Rubber','182024');gold=mat('Anodised bronze','bc935a',.72)
 lamp=mat('Warm headlamp','f5e5ae');red=mat('Tail lamp','b93c33');seat=mat('Saddle upholstery','5a3f32')
 box('Undertray',(0,.3,0),(1.54,.12,3.12),dark,root,.06)
 shell('Long sculpted nose',[(-1.8,.54,.28,.12),(-1.45,.61,.54,.22),(-.8,.66,.48,.24),(-.46,.7,.42,.18)],paint,root)
 for s in [-1,1]:
  pod=shell('Radiator sidepod',[(-.55,.55,.25,.22),(.22,.57,.33,.26),(1.12,.58,.29,.23),(1.42,.53,.19,.17)],paint,root);pod.location.x=s*.74
  box('Side intake',(s*.75,.68,-.5),(.4,.23,.09),dark,root,.025)
  for vent in range(6):box('Louvred radiator',(s*.97,.68,.30+vent*.115),(.035,.23,.052),dark,root,.01)
  for z in [-1.05,.97]:
   for height in [.37,.53]:
    rod('Suspension wishbone',(s*.38,height,z-.22),(s*1.05,height,z),.03,metal,root)
    rod('Suspension wishbone',(s*.38,height,z+.22),(s*1.05,height,z),.03,metal,root)
   rod('Damper',(s*.5,.76,z),(s*.93,.46,z),.055,gold,root)
   # Continuous helical suspension spring.
   spring=[]
   for k in range(49):
    t=k/48;a=t*math.tau*6;spring.append((s*(.52+.38*t)+.057*math.cos(a),.76-.29*t+.04*math.sin(a),z+.057*math.sin(a)))
   for k in range(48):rod('Spring winding',spring[k],spring[k+1],.012,red,root)
   steering=empty(('Front' if z<0 else 'Rear')+('L' if s<0 else 'R'),root,(s*1.1,.45,z));spin=empty('Spin',steering)
   tire=torus('Profiled racing tyre',(0,0,0),.325,.12,rubber,spin,'X')
   for side in [-1,1]:
    torus('Forged rim lip',(side*.14,0,0),.255,.025,gold,spin,'X')
    rod('Hub',(side*.12,0,0),(side*.18,0,0),.08,metal,spin)
    for k in range(6):
     a=k*math.tau/6;rod('Forged wheel spoke',(side*.16,0,0),(side*.16,.235*math.sin(a),.235*math.cos(a)),.035,gold,spin)
   for k in range(20):
    a=k*math.tau/20;groove=box('Tyre tread',(0,.439*math.sin(a),.439*math.cos(a)),(.23,.021,.046),dark,spin);groove.rotation_euler.x=a
  rod('Roll hoop',(s*.41,.81,.65),(s*.41,1.45,.65),.055,metal,root)
  rod('Rear wing pylon',(s*.55,.7,1.22),(s*.55,1.39,1.34),.045,dark,root)
  box('Wing endplate',(s*1.08,1.45,1.31),(.065,.30,.6),paint,root,.025)
  box('Rear lamps',(s*.66,.62,1.45),(.32,.11,.065),red,root,.02)
  rod('Exhaust pipe',(s*.43,.52,1.1),(s*.43,.52,1.72),.105,metal,root)
  rod('Exhaust opening',(s*.43,.52,1.73),(s*.43,.52,1.75),.077,dark,root)
  box('Front wing',(s*.59,.33,-1.81),(.91,.07,.44),dark,root,.025)
  box('Wing endplate',(s*1.04,.43,-1.8),(.055,.23,.45),paint,root,.025)
  box('LED headlight',(s*.38,.62,-1.45),(.24,.09,.07),lamp,root,.02)
  for z in [-.2,.16,.52]:rod('Body panel fastener',(s*1.0,.62,z),(s*1.026,.62,z),.025,metal,root)
 box('Rear aerofoil',(0,1.39,1.31),(2.16,.1,.52),dark,root,.045)
 box('Rear wing enamel',(0,1.44,1.24),(2.06,.027,.27),paint,root,.01)
 box('Bucket seat',(0,.79,.22),(.76,.18,.67),seat,root,.07)
 box('Seat back',(0,1.15,.62),(.73,.71,.16),seat,root,.08)
 box('Engine block',(0,.57,1.1),(.6,.26,.46),dark,root,.03)
 for k in range(7):box('Engine cooling fin',(-.27+k*.09,.76,1.14),(.035,.08,.45),metal,root,.006)
 rod('Steering column',(0,.6,-.75),(0,1.03,-.20),.047,metal,root)
 wheel=torus('Steering wheel',(0,1.03,-.20),.205,.032,dark,root);wheel.rotation_euler.x=.75
 for s in [-1,1]:rod('Steering spoke',(0,1.03,-.20),(s*.18,1.03,-.20),.022,metal,root)
 box('Dashboard',(0,1.0,-.65),(.57,.18,.17),dark,root,.03)
 box('Telemetry screen',(0,1.09,-.66),(.27,.025,.09),paint,root,.005)
 for s in [-1,1]:box('Livery stripe',(s*.10,.85,-1.05),(.07,.008,.64),lamp,root)
 for k in range(5):box('Diffuser fin',(-.6+k*.3,.27,1.42),(.04,.18,.46),dark,root)
 return root
def pixel_skin(name,id,head=False):
 # Original artwork painted procedurally on spherical UVs; no protruding facial parts.
 size=256;im=bpy.data.images.new(name,width=size,height=size,alpha=True);pixels=[]
 f=rgb(FUR[id]);d=rgb(DARK[id]);rng=random.Random(9)
 for y in range(size):
  v=y/(size-1);lat=(v-.5)*math.pi
  for x in range(size):
   u=x/(size-1);a=u*math.tau
   px=math.cos(a)*math.cos(lat)*.5;py=math.sin(lat)*.5;pz=-math.sin(a)*math.cos(lat)*.5
   noise=.95+rng.random()*.08;c=tuple(t*noise for t in f)
   # Broken tapered tabby strokes, rather than continuous horizontal rings.
   stripe=math.sin(v*32+math.sin(a*2.0)*2.8+math.cos(a*5)*.7)
   taper=max(0,math.sin(a*3.0+v*9))
   if id and stripe>.80 and taper>.18:c=tuple(t*.95 for t in d)
   if rng.random()<.10:c=tuple(min(1,t*1.12) for t in c)
   if head and pz<-.20:
    ex=abs(px)-.19;ey=py-.055;er=(ex/.112)**2+(ey/.088)**2
    if er<1.16:c=rgb('303136')
    if er<.85:c=rgb('d5a140') if id in [0,4,5] else rgb('a3ba72')
    if (ex/.063)**2+(ey/.084)**2<1:c=rgb('171c20')
    if ((ex+.025)/.018)**2+((ey-.03)/.019)**2<1:c=(1,1,.93)
    if (px/.22)**2+((py+.20)/.12)**2<1:c=rgb('eee8d9')
    if id==0 and -.16<py<.12 and abs(px)<.025+.12*(.12-py):c=rgb('eee8d9')
    if -.155<py<-.105 and abs(px)<(-.105-py):c=rgb('c27e87')
    if abs(px)<.007 and -.22<py<-.15:c=rgb('54413d')
    if abs(py+.232-abs(px)*.3)<.005 and abs(px)<.06:c=rgb('54413d')
   pixels.extend((*c,1))
 im.pixels=pixels;im.filepath_raw=os.path.join(OUT,name+'.png');im.file_format='PNG';im.save();im.pack()
 m=mat(name,FUR[id]);nodes=m.node_tree.nodes;t=nodes.new('ShaderNodeTexImage');t.image=im;t.interpolation='Closest';m.node_tree.links.new(t.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);return m
exec(compile(open(os.path.join(os.path.dirname(__file__),'reference_driver.py')).read(),'reference_driver.py','exec'))
exec(compile(open(os.path.join(os.path.dirname(__file__),'anatomical_driver.py')).read(),'anatomical_driver.py','exec'))
for id in range(6):
 if '--' in sys.argv and IDS[id] not in sys.argv[sys.argv.index('--')+1:]:continue
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 driver=reference_driver(id)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,IDS[id]+'_driver.blend'))
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,IDS[id]+'_driver.glb'),export_format='GLB',export_yup=True)
 kart_model(driver,id)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,IDS[id]+'_kart.blend'))
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,IDS[id]+'_kart.glb'),export_format='GLB',export_yup=True)
print('SIX REFERENCE SHAPED VOLUME CAT MODELS EXPORTED')

