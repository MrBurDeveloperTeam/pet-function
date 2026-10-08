"""Replace photographic anatomy with embedded eyes and actual seated limbs."""
legacy_reference_driver=reference_driver

def reference_driver(id):
 driver=legacy_reference_driver(id)
 name=IDS[id];head=next(o for o in driver.children if o.name=='Head')
 path=os.path.abspath(os.path.join(OUT,'..','art','references',name+'.png'))
 source=bpy.data.images.load(path,check_existing=False)
 w,h=source.size;unit=1.48/h;pixels=list(source.pixels)
 # Eye/nose coordinates measured against each supplied sprite, not a generic face.
 lx,rx,ey,nx,ny,erx,ery=[(28/96,57.5/96,42/124,42.5/96,52.5/124,8/96,7/124),
                       (25.5/99,60.5/99,50.5/124,43.5/99,58.5/124,9/99,9/124),
                       (27.5/98,55.5/98,49/135,42/98,59.5/135,9/98,9/135),
                       (54/120,86/120,45.5/146,70.5/120,57/146,9/120,8/146),
                       (55.5/114,88/114,51.5/116,74/114,59.5/116,9/114,10/116),
                       (24.5/100,56.5/100,45/124,40/100,55/124,9/100,8/124)][id]
 def point(x,y):return ((.5-x)*w*unit,(h-1-y*h)*unit)
 eyes=[point(lx,ey),point(rx,ey)];nx,ny=point(nx,ny)
 fur=pixel_skin(name+'_anatomical_fur',id)
 def pigment(label,value):
  m=mat(name+label,value)
  c=rgb(value);linear=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
  m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*linear,1)
  return m
 cream=pigment(' cream fur','e8e2d6');dark=pigment(' eyelid pigment','333034')
 black=pigment(' pupil','171d20');pink=pigment(' nose leather','be7e80')
 iris=pigment(' iris',['d0a040','a3b75b','d5a14c','a3b975','68b6ce','a3b750'][id])
 shine=pigment(' corneal reflection','fff5df')
 for m in [black,iris]:m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.30
 def painted(label,image):
  m=mat(name+label,FUR[id]);t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;t.interpolation='Closest'
  m.node_tree.links.new(t.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
 limb_image=source.copy();limb_pixels=list(pixels)
 for y in range(int(h*.56),int(h*.84)):
  for x in range(w):
   i=((h-1-y)*w+x)*4;r,g,b,a=limb_pixels[i:i+4]
   # Collar/bandana/bell colours belong to their own meshes, never the legs.
   if (id in [1,4] and r>g*1.25 and r>b*1.35) or (id==1 and r>g*1.12 and g>b*1.35):limb_pixels[i:i+3]=rgb(FUR[id])
 limb_image.pixels[:]=limb_pixels;limb_image.pack()
 limb=painted(' limb reference coat',limb_image);source.pack()
 # Remove the old pictured legs, thighs and accessories before replacing anatomy.
 for o in list(driver.children):
  if o.type=='MESH' and any(s in o.name for s in ['Seated torso','Rear haunch','collar','bell','bandana']):bpy.data.objects.remove(o,do_unlink=True)
 skull=next(o for o in head.children if o.type=='MESH' and 'cranium' in o.name)
 # Remove eye/nose/mouth ink underneath the actual new parts.
 clean=source.copy();clean.name=name+' face coat without painted anatomy';cp=list(pixels)
 def sample(x,y):
  i=((h-1-min(h-1,max(0,int(y))))*w+min(w-1,max(0,int(x))))*4
  return pixels[i:i+3]
 for y in range(h):
  for x in range(w):
   i=((h-1-y)*w+x)*4;colour=None
   for ex in [lx,rx]:
    if ((x/w-ex)/(erx*1.16))**2+((y/h-ey)/(ery*1.25))**2<1:colour=sample(ex*w,(ey-ery*1.5)*h)
   px,py=point(x/w,y/h)
   if ((px-nx)/.15)**2+((py-(ny-.035))/.105)**2<1:colour=sample((.5-nx/(w*unit)-.13)*w,(1-(ny-.025)/(h*unit))*h)
   rr,gg,bb,aa=cp[i:i+4]
   if y/h<.23:
    # Continue the real forehead paint up the curved crown; a flat fill would
    # produce a visible horizontal colour band under the ears.
    colour=rgb(FUR[id])
    for crown_y in range(int(h*.23),int(h*.38)):
     ci=((h-1-crown_y)*w+x)*4;rrr,ggg,bbb,aaa=pixels[ci:ci+4]
     if aaa>.9 and not (rrr>ggg*1.15 and bbb>ggg*1.15):
      colour=pixels[ci:ci+3];break
   if aa<.1 or (rr>gg*1.15 and bb>gg*1.15 and abs(rr-bb)<.10):colour=rgb(FUR[id])
   if colour is not None:cp[i:i+3]=colour
   cp[i+3]=1
 clean.pixels[:]=cp;clean.pack()
 face=painted(' sculpted face coat',clean);skull.data.materials[0]=face
 # Increase sculpt resolution before depressing the orbital region.
 bpy.context.view_layer.objects.active=skull
 sub=skull.modifiers.new('Rounded anatomical surface','SUBSURF');sub.levels=1
 bpy.ops.object.modifier_apply(modifier=sub.name)
 def front_z(x,y):
  candidates=sorted([((v.co.x-x)**2+(v.co.z-y)**2,v.co.y) for v in skull.data.vertices if v.co.y>0])[:4]
  weights=[1/max(.00001,d) for d,z in candidates]
  return -sum(z*weight for (d,z),weight in zip(candidates,weights))/sum(weights) if candidates else -.25
 bases=[front_z(x,y)+.025 for x,y in eyes]
 for v in skull.data.vertices:
  if v.co.z>1.17:
   v.co.z=min(v.co.z,1.18+.105*math.sqrt(max(0,1-((v.co.x-nx)/.46)**2)))
  if v.co.y>0:
   for (ex,yy),base in zip(eyes,bases):
    d=((v.co.x-ex)/(erx*w*unit*1.4))**2+((v.co.z-yy)/(ery*h*unit*1.4))**2
    v.co.y-=.047*math.exp(-d*2.2)
    r=math.sqrt(((v.co.x-ex)/(erx*w*unit))**2+((v.co.z-yy)/(ery*h*unit))**2)
    # Keep the full curved eye visible inside the socket, including its edge.
    amount=max(0,min(1,(1.3-r)/.2))
    v.co.y-=max(0,v.co.y-(-base-.019))*amount
 # Each socket contains a shallow eye; lids stay in front of the eyeball.
 for index,((ex,yy),base) in enumerate(zip(eyes,bases)):
  root=empty('EyeSocket'+('L' if index==0 else 'R'),head);ax=erx*w*unit;ay=ery*h*unit
  verts=[];faces=[]
  for j in range(8):
   b=j*math.tau/8
   for k in range(48):
    a=k*math.tau/48
    xx=ex+(ax*1.18+.005*math.cos(b))*math.cos(a);yy_rim=yy+(ay*1.18+.005*math.cos(b))*math.sin(a)
    verts.append((xx,yy_rim,front_z(xx,yy_rim)-.002-.004*math.sin(b)))
  for j in range(8):
   for k in range(48):faces.append((j*48+k,j*48+(k+1)%48,((j+1)%8)*48+(k+1)%48,((j+1)%8)*48+k))
  rim=mesh('Inset upper and lower eyelid',verts,faces,fur,root);rim.data.materials.append(dark)
  for p in rim.data.polygons:
   p.use_smooth=True
   p.material_index=1 if sum(verts[i][1] for i in p.vertices)/len(p.vertices)>yy+ay*.65 else 0
  oval('Embedded eyeball',(ex,yy,base+.044),(ax*2,ay*2,.085),black,root)
  # An iris is a curved closed cap; black pupil is also geometry on its surface.
  def cap(label,ax,ay,z,bulge,m):
   vv=[(ex,yy,z-bulge)];ff=[];n=32
   for j in range(1,5):
    r=j/4
    for k in range(n):
     a=k*math.tau/n;vv.append((ex+ax*r*math.cos(a),yy+ay*r*math.sin(a),z-bulge*math.sqrt(max(0,1-r*r))))
   for k in range(n):ff.append((0,1+k,1+(k+1)%n))
   for j in range(3):
    for k in range(n):ff.append((1+j*n+k,1+j*n+(k+1)%n,1+(j+1)*n+(k+1)%n,1+(j+1)*n+k))
   ff.append(tuple(1+3*n+k for k in range(n-1,-1,-1)))
   obj=mesh(label,vv,ff,m,root)
   for p in obj.data.polygons:p.use_smooth=True
  # Project the actual iris artwork onto the embedded curved eye, preserving
  # its amber/green/blue iris, pupil proportions and original highlights.
  cap('Curved reference eyeball',ax,ay,base+.012,.014,limb)
  cap_obj=next(o for o in root.children if o.name.startswith('Curved reference eyeball'))
  uv=cap_obj.data.uv_layers.new(name='Original eye colour on curved surface')
  for poly in cap_obj.data.polygons:
   for li in poly.loop_indices:
    v=cap_obj.data.vertices[cap_obj.data.loops[li].vertex_index].co
    uv.data[li].uv=(.5-v.x/(w*unit),(v.z/unit+1)/h)
 # Muzzle pads are modest protrusions; the nose is connected to their surface.
 z=front_z(nx,ny)-.010
 for s in [-1,1]:oval('Whisker pad',(nx+s*.066,ny-.035,z),(.175,.128,.115),cream,head)
 nz=z-.060
 mesh('Three dimensional triangular nose',[(nx-.034,ny+.015,nz+.006),(nx+.034,ny+.015,nz+.006),(nx,ny-.024,nz),(nx-.034,ny+.015,nz+.030),(nx+.034,ny+.015,nz+.030),(nx,ny-.024,nz+.025)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],pink,head)
 rod('Philtrum',(nx,ny-.024,nz+.010),(nx,ny-.049,nz+.013),.003, dark,head)
 for s in [-1,1]:
  rod('Mouth crease',(nx,ny-.049,nz+.013),(nx+s*.030,ny-.058,nz+.023),.003,dark,head)
  rod('Mouth corner',(nx+s*.030,ny-.058,nz+.023),(nx+s*.052,ny-.047,nz+.035),.0025,dark,head)
  for j in range(3):rod('Fine whisker',(nx+s*.10,ny-.03+j*.016,nz+.039),(nx+s*(.30+j*.03),ny-.05+j*.048,nz+.075),.0023,cream,head)
 # Open ear shells: a front lip, side thickness and a deeper inner bowl.
 for o in list(head.children):
  if o.type=='MESH' and 'ear' in o.name:
   side=1 if sum(v.co.x for v in o.data.vertices)/len(o.data.vertices)>nx else -1
   root=empty('EarBowl'+('L' if side<0 else 'R'),head)
   bpy.data.objects.remove(o,do_unlink=True)
   outer=[(side*.40,1.445,.005),(side*.18,1.20,-.085),(side*.44,1.23,-.070)]
   inner=[(side*.39,1.402,.020),(side*.235,1.248,-.040),(side*.409,1.265,-.028)]
   outer=[(x+nx,y,z) for x,y,z in outer];inner=[(x+nx,y,z) for x,y,z in inner]
   ev=outer+inner+[(x,y,.15) for x,y,z in outer]
   shell=mesh('Ear lip and outer shell',ev,[(0,1,4,3),(1,2,5,4),(2,0,3,5),(0,6,7,1),(1,7,8,2),(2,8,6,0),(6,8,7)],fur,root)
   for p in shell.data.polygons:p.use_smooth=True
   mesh('Inset pink ear cartilage',inner+[(nx+side*.343,1.29,.025)],[(0,1,3),(1,2,3),(2,0,3)],pigment(' ear lining','c29b94'),root)
 # Torso and four independent limbs, rather than a torso printed with leg pixels.
 body=oval('Seated ribcage with white chest',(nx,.385,.11),(.62,.69,.57),fur,driver)
 body.data.materials.append(cream)
 for poly in body.data.polygons:
  # The bib is fur colour on the curved ribcage, not an inflated attached badge.
  co=poly.center
  x=co.x*.31;y=.385+co.z*.345;z=.11-co.y*.285
  width=.055+.115*math.sin(max(0,min(1,(y-.19)/.45))*math.pi/2)
  if id in [0,1,2,4] and z<-.035 and .19<y<.655 and abs(x)<width:poly.material_index=1
 def coat_projection(obj):
  bpy.context.view_layer.update();obj.data.materials.clear();obj.data.materials.append(limb)
  uv=obj.data.uv_layers.active
  for p in obj.data.polygons:
   for li in p.loop_indices:
    co=obj.matrix_local @ obj.data.vertices[obj.data.loops[li].vertex_index].co
    uv.data[li].uv=(.5-co.x/(w*unit),(co.z/unit+1)/h)
  return obj
 for s in [-1,1]:
  leg=empty('Foreleg'+('L' if s<0 else 'R'),driver)
  coat_projection(oval('Shoulder',(nx+s*.195,.49,-.117),(.19,.23,.22),fur,leg))
  coat_projection(oval('Forearm',(nx+s*.172,.283,-.191),(.15,.39,.18),fur,leg))
  coat_projection(oval('Front paw',(nx+s*.172,.075,-.246),(.19,.15,.235),cream,leg))
  for offset in [-.038,.038]:coat_projection(oval('Rounded front toe',(nx+s*.172+offset,.057,-.315),(.070,.087,.105),cream,leg))
  rear=empty('Hindleg'+('L' if s<0 else 'R'),driver)
  oval('Rear thigh',(nx+s*.272,.215,.19),(.275,.37,.37),fur,rear)
  oval('Hind paw',(nx+s*.29,.065,-.017),(.22,.14,.26),cream if id in [0,1] else fur,rear)
 next(o for o in driver.children if o.name=='Tail').location.x=nx
 if id==1:
  collar=torus('Red collar',(nx,.585,.07),.245,.02,mat(name+' collar','b23330'),driver);collar.scale.y=1.15
  oval('Gold bell',(nx+.04,.48,-.225),(.083,.083,.064),mat(name+' bell','d7a53a',.6),driver)
 if id==4:
  mesh('Folded orange bandana',[(nx-.24,.565,-.177),(nx+.24,.565,-.177),(nx,.35,-.24),(nx-.24,.565,-.157),(nx+.24,.565,-.157),(nx,.35,-.22)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],mat(name+' orange scarf','c75d2d'),driver)
  mesh('Bandana diamond',[(nx,.47,-.220),(nx-.038,.427,-.232),(nx,.385,-.234),(nx+.038,.427,-.232)],[(0,1,2,3)],mat(name+' scarf gold','efc66a'),driver)
 return driver
