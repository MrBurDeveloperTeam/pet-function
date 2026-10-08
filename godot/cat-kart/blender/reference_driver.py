"""Volume meshes shaped and UV-painted from the six approved front views.

The eyes, muzzle, stripes and accessories use the supplied pixels, rather than
independently invented shapes. All heads/bodies have closed front and rear surfaces.
"""
import json

def reference_driver(id):
 name=IDS[id]
 path=os.path.abspath(os.path.join(OUT,'..','art','references',name+'.png'))
 data=json.load(open(path.replace('.png','.json')))
 w,h=data['width'],data['height']; rows=data['rows']; unit=1.48/h
 image=bpy.data.images.load(path,check_existing=True)
 # Sprite outlines describe a 2D silhouette, not purple fur on a 3D cheek.
 # Keep the original files intact; extend coat colour under transparent borders.
 pixel_values=list(image.pixels)
 coat=tuple(int(FUR[id][i:i+2],16)/255 for i in (0,2,4))
 for pixel in range(0,len(pixel_values),4):
  r,g,b,a=pixel_values[pixel:pixel+4]
  if a<.1 or (r>g*1.15 and b>g*1.15 and abs(r-b)<.10):
   pixel_values[pixel:pixel+3]=coat
 image.pixels[:]=pixel_values
 image.pack()
 painted=mat(name+' approved original artwork',FUR[id])
 nodes=painted.node_tree.nodes; tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest'
 painted.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
 fur=pixel_skin(name+'_coat',id); dark=mat(name+' stripe pigment',DARK[id])
 driver=empty('Driver'); head=empty('Head',driver);tail=empty('Tail',driver)
 def volume(label,top,bottom,depth,parent):
  verts=[];uvs=[];steps=32;count=27
  for row in range(count):
   t=row/(count-1); py=(top+(bottom-top)*t)*h
   nearby=rows[max(0,int(py)-3):min(h,int(py)+4)]
   left=sum(pair[0] for pair in nearby)/len(nearby)
   right=sum(pair[1] for pair in nearby)/len(nearby)
   half=min((right-left+1)/2,w*.39)
   # Rounded crown/chin and shoulders, rather than a ball with pasted features.
   if row in [0,count-1]:half*=.70
   cx=w-1-(left+right)/2
   y=(h-1-py)*unit
   profile=(.07+.93*math.sqrt(max(0,math.sin(math.pi*t)))) if parent==head else (.30+.70*math.sqrt(max(0,math.sin(math.pi*t))))
   for k in range(steps):
    a=k*math.tau/steps
    rear=max(0,-math.sin(a))
    # Round the back independently of the pixel staircase in the front silhouette.
    dome=math.sqrt(max(.015,1-((t-.48)/.54)**2))
    rounded_half=w*(.36 if parent==head else .28)*dome
    radius=half*(1-rear)+rounded_half*rear
    x=(cx-w*.5+radius*math.cos(a))*unit
    z=-math.sin(a)*depth*profile
    # A broad, gently curved front keeps the reference proportions legible.
    if z<0:
     z=-depth*profile*math.sin(a)**.62
     if parent==head:z*=1+.12*math.exp(-((t-.70)/.13)**2)*math.sin(a)**4
    z+=.13*profile if parent==head else .11*profile
    verts.append((x,y,z));uvs.append((.5-x/(unit*w),1-py/h))
  faces=[]
  for r in range(count-1):
   for k in range(steps):faces.append(((r+1)*steps+k,(r+1)*steps+(k+1)%steps,r*steps+(k+1)%steps,r*steps+k))
  faces.extend([tuple(range(steps-1,-1,-1)),tuple((count-1)*steps+k for k in range(steps))])
  obj=mesh(label,verts,faces,painted,parent);obj.data.materials.append(fur)
  uv=obj.data.uv_layers.new(name='Reference front projection')
  for poly in obj.data.polygons:
   center=sum((verts[i][2] for i in poly.vertices))/len(poly.vertices)
   poly.material_index=0 if center<-.055 else 1
   poly.use_smooth=True
   for li in poly.loop_indices:
    vi=obj.data.loops[li].vertex_index
    uv.data[li].uv=uvs[vi] if poly.material_index==0 else ((vi%steps)/steps,vi//steps/(count-1))
  return obj
 volume('Reference shaped cheek and cranium',.13,.605,.43,head)
 volume('Seated torso with original bib and forelegs',.54,.992,.35,driver)
 # Trace each ear independently, so its edge never extends beyond the approved art.
 pixels=list(image.pixels);segments=16
 for half in range(2):
  strips=[]
  for py in range(int(h*.23)):
   xs=[x for x in range(half*w//2,(half+1)*w//2) if (x<w*.36 or x>w*.64) and pixels[((h-1-py)*w+x)*4+3]>.1]
   if xs:strips.append((py,min(xs),max(xs)))
  verts=[];uvs=[]
  for r,(py,left,right) in enumerate(strips):
   cx=w-1-(left+right)/2;radius=max(.35,(right-left)/2)
   for k in range(segments):
    a=k*math.tau/segments;x=(cx-w*.5+radius*math.cos(a))*unit
    verts.append((x,(h-1-py)*unit,.08-math.sin(a)*(.045+.12*r/max(1,len(strips)-1))))
    uvs.append((.5-x/(unit*w),1-py/h))
  faces=[]
  for r in range(len(strips)-1):
   for k in range(segments):faces.append(((r+1)*segments+k,(r+1)*segments+(k+1)%segments,r*segments+(k+1)%segments,r*segments+k))
  faces.extend([tuple(range(segments-1,-1,-1)),tuple((len(strips)-1)*segments+k for k in range(segments))])
  ear=mesh('Traced tapered ear',verts,faces,painted,head);ear.data.materials.append(fur);uv=ear.data.uv_layers.new(name='Approved ear pixels')
  for poly in ear.data.polygons:
   poly.material_index=0 if sum(verts[i][2] for i in poly.vertices)/len(poly.vertices)<.08 else 1
   poly.use_smooth=True
   for li in poly.loop_indices:uv.data[li].uv=uvs[ear.data.loops[li].vertex_index]
 # Hindquarters and paws form actual volume, their approved art remains on the front.
 for s in [-1,1]:
  oval('Rear haunch',(s*.26,.18,.22),(.26,.36,.40),fur,driver)
 # Tail lives behind the torso, with directional side stripes.
 points=[];faces=[]
 tail_side=1 if id in [3,4] else -1
 for i in range(25):
  t=i/24;r=.075*(1-.9*t*t*t)
  for k in range(8):
   a=k*math.tau/8
   peak=[.26,.36,.68,.65,.66,.50][id]
   points.append((tail_side*(.28+.36*math.sin(t*2.3))+r*math.cos(a),.12+(peak-.12)*t,.38+.12*math.sin(t*math.pi)+r*math.sin(a)))
 for i in range(24):
  for k in range(8):faces.append((i*8+k,i*8+(k+1)%8,(i+1)*8+(k+1)%8,(i+1)*8+k))
 faces.append(tuple(24*8+k for k in range(8)))
 obj=mesh('Curved striped tail',points,faces,fur,tail);obj.data.materials.append(dark)
 for poly in obj.data.polygons:poly.material_index=(poly.index//24)%2 if id else 0;poly.use_smooth=True
 # Accessories have thickness and the same colours as their reference photos.
 if id==1:
  torus('Red collar',(0,.53,0),.245,.020,mat('Silverbelt red collar','b23330'),driver)
  oval('Gold bell',(.065,.34,-.232),(.10,.10,.06),mat('Bell brass','d7a53a',.6),driver)
 if id==4:
  scarf=mesh('Orange bandana volume',[(-.24,.44,-.24),(.24,.44,-.24),(0,.23,-.245),(-.24,.44,-.22),(.24,.44,-.22),(0,.23,-.225)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],painted,driver)
  uv=scarf.data.uv_layers.new(name='Original bandana and diamond')
  for poly in scarf.data.polygons:
   for li in poly.loop_indices:
    co=scarf.data.vertices[scarf.data.loops[li].vertex_index].co
    uv.data[li].uv=(.5-co.x/(unit*w),co.z/(unit*h))
 return driver
