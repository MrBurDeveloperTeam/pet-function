"""Volumetric kittens based on concepts/six-kittens-soft-style-v1.png.

Blender native geometry, real orbital cavities, curved eyes and strand groom.
The concept image is a reference only; it is never mapped onto the face.
"""
import bpy, math, os, sys, random, bisect, json
from mathutils import Vector, Quaternion
BASE=os.path.dirname(__file__)
OUT=os.path.join(BASE,'soft-kittens-v2')
os.makedirs(OUT,exist_ok=True)
IDS=['mallow','silverbelt','fastrat','gulu','munchkin','mochi']
PALETTES=[('34373e','303239','e8e3d8','c68c29'),('c9c6b7','72716b','ede7d9','829c42'),('c58e48','513b29','ede0c3','cb8a23'),('a09680','4c473f','dcd4bf','96af61'),('a5987a','4e473d','d8c9a9','3e9bbb'),('535a62','272d35','a8adb0','a4ba4b')]
def srgb(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(h):return Vector(tuple(srgb(int(h[i:i+2],16)/255) for i in (0,2,4)))
def mix(a,b,t):return a*(1-t)+b*t
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def material(name,color,rough=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=(*rgb(color),1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 return m
def ellipsoid(name,center,radii,mat=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=center)
 o=bpy.context.object;o.name=name;o.scale=radii
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if mat:o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
def mesh(name,verts,faces):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);return o
def sweep(name,points,radii,sides=12):
 vv=[];ff=[]
 for i,p in enumerate(points):
  p=Vector(p);tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
  axis=tangent.cross(Vector((0,1,0)))
  if axis.length<.1:axis=tangent.cross(Vector((1,0,0)))
  axis.normalize();other=tangent.cross(axis).normalized()
  for j in range(sides):vv.append(tuple(p+radii[i]*(axis*math.cos(j*math.tau/sides)+other*math.sin(j*math.tau/sides))))
 for i in range(len(points)-1):
  for j in range(sides):ff.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 ff += [tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))]
 o=mesh(name,vv,ff)
 for p in o.data.polygons:p.use_smooth=True
 return o
def union(parts):
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 o.name='Continuous feline anatomy'
 mod=o.modifiers.new('Continuous sculpt','REMESH');mod.mode='VOXEL';mod.voxel_size=.009
 bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Sculpt relaxation','SMOOTH');mod.factor=.62;mod.iterations=6
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 return o
def difference(o,cutter,label):
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new(label,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
def coat(pos,identity):
 x,y,z=pos;z+=.13*smooth(.80,.95,z);base,dark,cream,iris=map(rgb,PALETTES[identity]);front=1-smooth(-.02,.13,y)
 color=base.copy()
 if identity:
  a=math.atan2(x,y-.04)
  if z<1.00:
   # Separate tapered flank strokes instead of full horizontal rings.
   stripe=0
   for k in range(6):
    height=.19+k*.122+.032*math.sin(abs(x)*14+k*.8)+.03*math.sin(a*2+k)
    width=.013+.012*max(0,math.sin(a*2+k*.65))
    stroke=1-smooth(width*.65,width,abs(z-height))
    taper=smooth(.075,.16,abs(x))*(.5+.5*math.sin(a*2.1+k*.9)**2)
    stripe=max(stripe,stroke*taper)
  elif z>1.36 and y<.13:
   xx=abs(x);stroke=abs(xx-(.05+.018*math.sin((z-1.3)*14)))
   stroke=min(stroke,abs(xx-(.145+.04*math.sin((z-1.3)*8))))
   stripe=(1-smooth(.010,.023,stroke))*smooth(1.36,1.42,z)
  else:
   stripe=0
   for k in range(3):
    cheekline=1.07+k*.087+.17*(abs(x)-.24)+.018*math.sin(y*18+k)
    stripe=max(stripe,(1-smooth(.007,.017,abs(z-cheekline)))*smooth(.20,.29,abs(x)))
  color=mix(color,dark,stripe*.94)
 # Muzzle is a three-dimensional patch, with soft borders.
 muzzle=(x/.17)**2+((z-1.10)/.105)**2
 white=(1-smooth(.78,1.1,muzzle))*front if z>1 else 0
 if identity==0:
  width=.015+.12*(1.39-z)
  blaze=(1-smooth(width,width+.012,abs(x)))*smooth(1.06,1.15,z)*(1-smooth(1.37,1.41,z))*front
  white=max(white,blaze)
 if identity in [0,1,2,3]:
  bib=(x/.19)**2+((z-.65)/.34)**2
  white=max(white,(1-smooth(.82,1.08,bib))*front)
  white=max(white,1-smooth(.11,.145,z))
 if identity==4:
  white*=.7
 color=mix(color,cream,min(1,white))
 # The inner ear tint belongs to the sculpted ear surface itself.
 for s in [-1,1]:
  inner=((x-s*.355)/.080)**2+((z-1.685)/.145)**2
  if inner<1.1 and -.09<y<.045 and z>1.52:
   color=mix(color,rgb('c7827c'),(1-smooth(.65,1.08,inner))*.85)
 grain=1+.018*math.sin(x*350+math.sin(z*217)*2)*math.sin(y*311+z*190)
 return color*grain
def paint(o,identity,mat):
 attr=o.data.color_attributes.get('Coat') or o.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
 for v in o.data.vertices:attr.data[v.index].color=(*coat(v.co,identity),1)
 o.data.materials.clear();o.data.materials.append(mat)
def fur_material(identity):
 m=material(IDS[identity]+' volumetric coat',PALETTES[identity][0],.78)
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Sheen Weight'].default_value=.25
 attr=m.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Coat'
 m.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
 return m
def eyeball(x,identity):
 m=material('Glossy '+IDS[identity]+' iris',PALETTES[identity][3],.12)
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=.65;bs.inputs['Coat Roughness'].default_value=.055
 n=512;im=bpy.data.images.new(IDS[identity]+' radial iris',width=n,height=n);im.colorspace_settings.name='Non-Color';pix=[]
 iris=rgb(PALETTES[identity][3]);black=rgb('090c10')
 for yy in range(n):
  for xx in range(n):
   dx=(xx/(n-1)-.5)*2;dy=(yy/(n-1)-.5)*2;r=math.hypot(dx,dy);a=math.atan2(dy,dx)
   c=iris*(.68+.30*math.sin(a*97+math.sin(r*36)*2)**2+.14*math.sin(a*181+r*14)**2)
   c=mix(c,black,1-smooth(.74,.77,r));c=mix(c,black,smooth(.93,.99,r));pix.extend((*c,1))
 im.pixels=pix;im.pack()
 tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;tex.interpolation='Linear'
 m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
 o=ellipsoid('Curved inset eye',(x,-.182,1.155),(.129,.083,.129),m)
 uv=o.data.uv_layers.active
 for p in o.data.polygons:
  for li in p.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(.5+v.x/.258,.5+v.z/.258)
 return o
def groom(body,identity,mat,count=65000):
 rng=random.Random(430+identity);body.data.update();polys=list(body.data.polygons);acc=[];total=0
 for p in polys:total+=p.area;acc.append(total)
 verts=[];faces=[];cols=[]
 for _ in range(count):
  p=polys[bisect.bisect_left(acc,rng.random()*total)];inds=list(p.vertices)[:3]
  a,b,c=[body.data.vertices[k].co for k in inds];u=rng.random();v=rng.random()
  if u+v>1:u=1-u;v=1-v
  q=a*(1-u-v)+b*u+c*v;x,y,z=q
  # Leave eye sockets, nose pads and ear hollows bare.
  if y<-.12 and abs(abs(x)-.185)<.145 and abs(z-1.155)<.155:continue
  if y<-.26 and abs(x)<.14 and .87<z<1.07:continue
  if z>1.40 and abs(abs(x)-.355)<.085 and -.09<y<.045:continue
  normal=sum((body.data.vertices[k].normal for k in inds),Vector()).normalized()
  flow=Vector((x*.6,-.05,-1))
  if z>1.43:flow=Vector((x,0,1))
  tangent=(flow-normal*flow.dot(normal)).normalized()
  length=rng.uniform(.017,.035);radius=rng.uniform(.00020,.00040)
  if z<.15:length*=.5
  direction=(normal*.55+tangent*.8).normalized()
  axis=direction.cross(Vector((0,1,0)))
  if axis.length<.1:axis=direction.cross(Vector((1,0,0)))
  axis.normalize();other=direction.cross(axis).normalized();start=len(verts);color=coat(q,identity)
  for seg in range(3):
   t=seg/2;center=q+normal*length*t*.6+tangent*length*t*t*.7
   for j in range(3):
    co=center+radius*(1-.96*t)*(axis*math.cos(j*math.tau/3)+other*math.sin(j*math.tau/3))
    verts.append(tuple(co));cols.append((*color*(.96+.09*t),1))
  for seg in range(2):
   for j in range(3):faces.append((start+seg*3+j,start+seg*3+(j+1)%3,start+(seg+1)*3+(j+1)%3,start+(seg+1)*3+j))
 hair=mesh('Groomed short fur',verts,faces);hair.data.materials.append(mat)
 attr=hair.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(cols):attr.data[i].color=c
 for p in hair.data.polygons:p.use_smooth=True
 return hair
def build(identity):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 root=bpy.data.objects.new(IDS[identity],None);bpy.context.collection.objects.link(root)
 parts=[ellipsoid('Cranium',(0,.015,1.32),(.405,.30,.355)),
        ellipsoid('Rounded lower face',(0,-.04,1.145),(.35,.285,.22))]
 vv=[];ff=[]
 for r in range(25):
  t=r/24;z=.055+t*.97;rx=.16+.115*math.sin(t*math.pi);ry=.13+.105*math.sin(t*math.pi)
  for j in range(40):vv.append((rx*math.cos(j*math.tau/40),.035+ry*math.sin(j*math.tau/40),z))
 for r in range(24):
  for j in range(40):ff.append((r*40+j,r*40+(j+1)%40,(r+1)*40+(j+1)%40,(r+1)*40+j))
 ff.extend([tuple(range(39,-1,-1)),tuple(range(960,1000))]);parts.append(mesh('Pear shaped torso',vv,ff))
 for s in [-1,1]:
  parts += [ellipsoid('Cheek',(s*.215,-.06,1.20),(.18,.235,.18)),ellipsoid('Whisker pad',(s*.055,-.265,1.10),(.085,.082,.067)),
            ellipsoid('Seated thigh',(s*.205,.075,.26),(.16,.195,.23)),ellipsoid('Hind paw',(s*.225,-.025,.085),(.12,.15,.081)),
            ellipsoid('Foreleg',(s*.122,-.117,.41),(.087,.098,.30)),ellipsoid('Forepaw',(s*.126,-.19,.09),(.111,.145,.086))]
  for t in [-1,0,1]:parts.append(ellipsoid('Rounded toe',(s*.126+t*.035,-.285,.074),(.033,.063,.057)))
  parts.append(ellipsoid('Connected ear shell root',(s*.29,.035,1.48),(.145,.13,.13)))
  vv=[];ff=[]
  for z,x,width,depth,y in [(1.425,.29,.29,.24,.025),(1.55,.325,.29,.18,.015),(1.74,.385,.16,.09,.015),(1.86,.411,.022,.020,.022)]:
   for j in range(20):vv.append((s*x+width*.5*math.cos(j*math.tau/20),y+depth*.5*math.sin(j*math.tau/20),z))
  for r in range(3):
   for j in range(20):ff.append((r*20+j,r*20+(j+1)%20,(r+1)*20+(j+1)%20,(r+1)*20+j))
  ff += [tuple(range(19,-1,-1)),tuple(range(60,80))];parts.append(mesh('Connected ear shell',vv,ff))
 for part in parts:
  if part.name.startswith(('Cranium','Rounded lower face','Cheek','Whisker pad','Connected ear shell')):part.location.z-=.13
 body=union(parts)
 for s in [-1,1]:
  difference(body,ellipsoid('Orbital cutter',(s*.185,-.265,1.155),(.137,.16,.137)),'Sculpted eye socket')
  difference(body,ellipsoid('Inner ear cutter',(s*.355,-.065,1.556),(.078,.089,.145)),'Shallow inner ear')
 body.data.update();fur=fur_material(identity);paint(body,identity,fur)
 for s in [-1,1]:
  eyeball(s*.185,identity)
  pts=[]
  for j in range(49):
   a=j*math.tau/48;pts.append((s*.185+.130*math.cos(a),-.208,1.155+.130*math.sin(a)))
  rim=sweep('Soft anatomical eyelid',pts,[.011]*49,8);paint(rim,identity,fur)
 nose=material('Soft pink nose','c47e7e',.55);mouth=material('Mouth seam','493333',.8)
 o=mesh('Sculpted nose', [(-.039,-.344,1.145),(.039,-.344,1.145),(0,-.368,1.099),(-.029,-.323,1.135),(.029,-.323,1.135),(0,-.338,1.102)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
 o.location.y=-.004;o.data.materials.append(nose);bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Soft nose edges','BEVEL');mod.width=.009;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 o=sweep('Philtrum',[(0,-.358,1.105),(0,-.354,1.078)], [.002,.002]);o.data.materials.append(mouth)
 for s in [-1,1]:
  o=sweep('Subtle mouth curve',[(0,-.354,1.078),(s*.028,-.348,1.067),(s*.05,-.335,1.075)],[.002,.002,.0008]);o.data.materials.append(mouth)
 white=material('Fine whiskers','eee9de',.55)
 for s in [-1,1]:
  for j in range(4):
   z=1.09+j*.018
   o=sweep('Whisker',[(s*.077,-.352,z),(s*.22,-.35,z+.004*(j-2)),(s*(.37+j*.015),-.305,z+.023*(j-1.5))],[.0011,.0008,.00015],5);o.data.materials.append(white)
 sign=-1 if identity in [3,4] else 1
 points=[]
 for i in range(28):
  t=i/27;points.append((sign*(.12+.36*t),.20+.10*math.sin(t*math.pi),.16+.42*t*t))
 tail=sweep('Curled tail',points,[.055*(1-.75*(i/27)**3) for i in range(28)],16);paint(tail,identity,fur)
 if identity in [1,4]:
  red=material('Red fabric','b63226',.83);gold=material('Gold bell and badge','c79329',.26,.65)
  pts=[(.225*math.cos(i*math.tau/48),.035+.23*math.sin(i*math.tau/48),.90) for i in range(49)]
  collar=sweep('Red collar',pts,[.021]*49);collar.data.materials.append(red)
  if identity==1:
   ellipsoid('Golden bell',(0,-.17,.852),(.044,.042,.046),gold)
   slit=sweep('Bell opening',[(0,-.212,.862),(0,-.213,.83)],[.003,.002]);slit.data.materials.append(mouth)
  else:
   orange=material('Orange neckerchief','d65225',.85)
   bib=mesh('Folded bandana',[(-.165,-.125,.91),(0,-.222,.89),(.165,-.125,.91),(0,-.24,.735)],[(0,3,1),(1,3,2)]);bib.data.materials.append(orange)
   solid=bib.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.005
   badge=mesh('Diamond badge',[(0,-.247,.83),(-.025,-.247,.8),(0,-.249,.77),(.025,-.247,.8)],[(0,1,2,3)]);badge.data.materials.append(gold)
 for o in list(bpy.context.scene.objects):
  if o.name.startswith(('Sculpted nose','Philtrum','Subtle mouth curve','Whisker')):o.location.z-=.13
  if o.name.startswith(('Red collar','Golden bell','Bell opening','Folded bandana','Diamond badge')):o.location.z-=.11
 hair=groom(body,identity,fur)
 # Match the design board's compact infant body. Deform the complete
 # geometry consistently so fur, feet and facial details stay attached.
 def kitten_proportion(obj):
  if obj.type!='MESH':return
  bpy.context.view_layer.update()
  for v in obj.data.vertices:
   co=obj.matrix_world @ v.co
   co.z=co.z*.78 if co.z<.88 else co.z-.1936
   v.co=obj.matrix_world.inverted() @ co
 for o in list(bpy.context.scene.objects):kitten_proportion(o)
 for o in list(bpy.context.scene.objects):
  if o!=root:o.parent=root
 # Real native modeling source; all parts are inspectable in Blender.
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':
    area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
    area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2)
    area.spaces.active.region_3d.view_distance=3.8;area.spaces.active.region_3d.view_location=(0,0,.95)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,IDS[identity]+'_studio.blend'))
 # Game export has fewer strands and a simplified connected body.
 bpy.data.objects.remove(hair,do_unlink=True)
 bpy.context.view_layer.objects.active=body
 mod=body.modifiers.new('Game topology reduction','DECIMATE');mod.ratio=.38;bpy.ops.object.modifier_apply(modifier=mod.name)
 # Groom before proportion change so its anatomical exclusion masks agree.
 for v in body.data.vertices:v.co.z=v.co.z/.78 if v.co.z<.6864 else v.co.z+.1936
 lowfur=groom(body,identity,fur,2500);lowfur.parent=root
 kitten_proportion(body);kitten_proportion(lowfur)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,IDS[identity]+'.glb'),export_format='GLB',export_yup=True)
 print('SOFT KITTEN COMPLETE',IDS[identity],len(body.data.vertices),'body vertices')
if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['mallow']
 for identity in args:build(IDS.index(identity))
