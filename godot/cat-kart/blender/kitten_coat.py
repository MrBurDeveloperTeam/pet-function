"""Paint each kitten's coat on real volume; facial features stay geometric."""
features=[(28,57.5,42,8,7),(25.5,60.5,50.5,9,9),(27.5,55.5,49,9,9),(54,86,45.5,9,8),(55.5,88,51.5,9,10),(24.5,56.5,45,9,8)]
def coat_mesh(obj,is_head):
 n=256;buffer=[];rng=random.Random(72+id);left,right,ey,rx,ry=features[id]
 source_scale=(right-left)/.38
 low=eye_y-.32 if is_head else 0
 span=.88 if is_head else .78
 for j in range(n):
  yy=low+span*j/(n-1)
  for i in range(n):
   angle=(i/(n-1)-.5)*math.tau
   radius=.46 if is_head else .32
   if is_head:radius*=math.sqrt(max(.04,1-((yy-eye_y-.015)/.345)**2))
   xx=radius*math.sin(angle);front=math.cos(angle)
   color=rgb(FUR[id])
   if id:
    stripe=math.sin(yy*34+2.8*math.sin(angle*2)+.65*math.sin(angle*5))
    broken=.5+.5*math.cos(angle*3+yy*7)
    if stripe>.87 and broken>.22:color=rgb(DARK[id])
   if is_head and front>.10:
    sx=(left+right)*.5-xx*source_scale;sy=ey-(yy-eye_y)*source_scale
    ix=max(0,min(w-1,round(sx)));iy=max(0,min(h-1,round(sy)))
    off=((h-1-iy)*w+ix)*4
    inside_eye=any(((sx-ex)/(rx*1.22))**2+((sy-ey)/(ry*1.22))**2<1 for ex in [left,right])
    # Only transfer the forehead's fur markings. Eyes, whiskers and mouth
    # in the original sprite must never get projected onto the 3D face.
    if id and yy>eye_y+.12 and pixels[off+3]>.9 and not inside_eye:
     blend=max(0,min(1,(front-.1)/.7))
     color=tuple(c*(1-blend)+pixels[off+k]*blend for k,c in enumerate(color))
    if (xx/.19)**2+((yy-(eye_y-.16))/.105)**2<1 and front>.55:color=rgb('e8e4db')
    if id==0 and eye_y-.14<yy<eye_y+.06 and abs(xx)<.035+.20*(eye_y+.06-yy):color=rgb('e8e4db')
   if not is_head:
    if yy<.11:color=rgb('e8e4db') if id in [0,1,2,3] else color
    if front>.6 and (xx/.17)**2+((yy-.43)/.29)**2<1:
     color=rgb('e8e4db') if id in [0,1,2,3] else rgb(FUR[id])
   grain=.975+rng.random()*.05
   buffer.extend((*[max(0,min(1,c*grain)) for c in color],1))
 image=bpy.data.images.new(identity+(' head coat' if is_head else ' body coat'),width=n,height=n)
 image.pixels=buffer;image.filepath_raw=os.path.join(base,'..','models',identity+('_kitten_head.png' if is_head else '_kitten_body.png'));image.file_format='PNG';image.save();image.pack()
 material=mat(identity+' painted fur',FUR[id]);bs=material.node_tree.nodes.get('Principled BSDF')
 tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest'
 material.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
 bs.inputs['Roughness'].default_value=.88
 noise=material.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=145
 bump=material.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.003
 material.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);material.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
 obj.data.materials[0]=material
 # Preserve pink cartilage on the actual connected ear surface.
 for p in obj.data.polygons:
  if p.material_index!=2:p.material_index=0
 uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Coat UV')
 bpy.context.view_layer.update()
 for p in obj.data.polygons:
  values=[]
  for li in p.loop_indices:
   co=obj.matrix_local @ obj.data.vertices[obj.data.loops[li].vertex_index].co
   x,y,z=co.x-cx,co.z,-co.y
   if is_head:z-=.065
   else:z-=.105
   u=.5+math.atan2(x,-z)/math.tau;v=(y-low)/span
   values.append((li,u,v))
  seam=max(v[1] for v in values)-min(v[1] for v in values)>.5
  for li,u,v in values:uv.data[li].uv=(u+1 if seam and u<.5 else u,v)
coat_mesh(skull,True);coat_mesh(body,False)
if id in [1,4]:
 red=mat('Original red collar','ad3f33');gold=mat('Original golden accessory','d7ae49',.5)
 torus('Red collar',(cx,.625,.075),.185,.023,red,driver)
 if id==1:
  oval('Golden collar bell',(cx,.58,-.128),(.09,.09,.09),gold,driver)
 else:
  orange=mat('Orange neckerchief','dc8b51')
  mesh('Original triangular bandana',[(cx-.15,.615,-.128),(cx+.15,.615,-.128),(cx,.43,-.20)],[(0,2,1)],orange,driver)
  mesh('Diamond neckerchief badge',[(cx,.485,-.207),(cx-.025,.46,-.21),(cx,.435,-.212),(cx+.025,.46,-.21)],[(0,1,2,3)],gold,driver)
