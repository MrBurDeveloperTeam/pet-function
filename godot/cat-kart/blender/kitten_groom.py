"""Lightweight opaque short-fur ribbons, exported as ordinary GLB meshes."""
import bisect
def short_fur(obj,count,is_head):
 rng=random.Random(308+id+int(is_head)*100)
 obj.data.update();polys=list(obj.data.polygons);weights=[];total=0
 for p in polys:
  total+=p.area if p.material_index==0 else 0;weights.append(total)
 vertices=[];faces=[];uvs=[]
 for _ in range(count):
  p=polys[bisect.bisect_left(weights,rng.random()*total)]
  if len(p.vertices)<3:continue
  inds=list(p.vertices)[:3];a,b,c=[obj.data.vertices[k].co.copy() for k in inds]
  aa=rng.random();bb=rng.random()
  if aa+bb>1:aa=1-aa;bb=1-bb
  q=a*(1-aa-bb)+b*aa+c*bb
  world=obj.matrix_local @ q
  gx,gy,gz=world.x,world.z,-world.y
  if is_head and abs(gy-(eye_y-.130))<.17 and abs(abs(gx-cx)-.19)<.17 and gz<-.10:continue
  if is_head and gy<eye_y-.19 and gz<-.12:continue
  normal=sum((obj.data.vertices[k].normal for k in inds),Vector()).normalized()
  axis=Vector((0,0,1))
  tangent=normal.cross(axis)
  if tangent.length<.1:tangent=normal.cross(Vector((1,0,0)))
  tangent.normalize();other=normal.cross(tangent).normalized()
  width=rng.uniform(.0003,.0006);length=rng.uniform(.007,.014)
  tip=q+normal*length+other*length*.25
  uv=obj.data.uv_layers.active.data
  loops=list(p.loop_indices)[:3]
  coord=uv[loops[0]].uv*(1-aa-bb)+uv[loops[1]].uv*aa+uv[loops[2]].uv*bb
  start=len(vertices)
  for point in [q-tangent*width,q+tangent*width,tip,q-other*width,q+other*width,tip]:
   vertices.append(tuple(point));uvs.append(tuple(coord))
  faces.extend([(start,start+1,start+2),(start+3,start+4,start+5)])
 data=bpy.data.meshes.new('Groomed short fur');data.from_pydata(vertices,[],faces);data.update()
 layer=data.uv_layers.new(name='Coat UV')
 for p in data.polygons:
  for li in p.loop_indices:layer.data[li].uv=uvs[data.loops[li].vertex_index]
 hair=bpy.data.objects.new('Short cheek and crown fur' if is_head else 'Short body fur',data)
 bpy.context.collection.objects.link(hair);hair.parent=obj.parent;hair.matrix_local=obj.matrix_local.copy()
 material=obj.data.materials[0].copy();material.name=identity+' soft short fur'
 bs=material.node_tree.nodes.get('Principled BSDF');tex=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
 material.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.12
 data.materials.append(material)
 print('REAL SHORT FUR',identity,hair.name,len(faces),'triangles')
short_fur(skull,8500,True);short_fur(body,6500,False)
