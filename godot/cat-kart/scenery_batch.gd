extends RefCounted
static func eligible(node: Node) -> bool:
	return node is MeshInstance3D and node.mesh!=null and not str(node.name) in ["Shield","ExhaustL","ExhaustR"]
static func collect(root: Node, meshes: Array, skip_names: Array=[]) -> void:
	for child in root.get_children():
		if str(child.name) in skip_names:continue
		if eligible(child):meshes.append(child)
		collect(child,meshes,skip_names)
static func merge(root: Node3D, direct: bool=false, skip_names: Array=[]) -> void:
	var meshes: Array=[]
	if direct:
		for child in root.get_children():
			if eligible(child):meshes.append(child)
	else:collect(root,meshes,skip_names)
	var groups={}
	for node in meshes:
		var merged_all=true
		for index in node.mesh.get_surface_count():
			var mat: Material=node.get_active_material(index)
			if mat==null:
				merged_all=false
				continue
			var key=""
			var source_mesh: Mesh=node.mesh
			var source_index=index
			if mat is StandardMaterial3D:
				mat.texture_filter=BaseMaterial3D.TEXTURE_FILTER_NEAREST
				if mat.transparency!=BaseMaterial3D.TRANSPARENCY_DISABLED:
					merged_all=false
					continue
				if mat.albedo_texture==null and not mat.vertex_color_use_as_albedo:
					# Keep each building's colour in vertex data rather than creating
					# another draw for every paint colour in every spatial chunk.
					var arrays=node.mesh.surface_get_arrays(index)
					var colours=PackedColorArray()
					colours.resize(arrays[Mesh.ARRAY_VERTEX].size())
					colours.fill(mat.albedo_color)
					arrays[Mesh.ARRAY_COLOR]=colours
					var coloured=ArrayMesh.new()
					coloured.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
					source_mesh=coloured
					source_index=0
					mat=mat.duplicate()
					mat.albedo_color=Color.WHITE
					mat.vertex_color_use_as_albedo=true
					mat.vertex_color_is_srgb=true
				key=str(mat.albedo_color)+str(mat.metallic)+str(mat.roughness)+str(mat.cull_mode)+str(mat.shading_mode)+str(mat.albedo_texture)+str(mat.vertex_color_use_as_albedo)
			elif mat is ShaderMaterial:
				key=mat.shader.resource_path+str(mat.get_shader_parameter("plaster"))+str(mat.get_shader_parameter("stone"))
			else:
				merged_all=false
				continue
			if not groups.has(key):
				var surface=SurfaceTool.new()
				surface.begin(Mesh.PRIMITIVE_TRIANGLES)
				groups[key]={"surface":surface,"material":mat}
			groups[key].surface.append_from(source_mesh,source_index,root.global_transform.affine_inverse()*node.global_transform)
		if merged_all:node.queue_free()
	for group in groups.values():
		var merged=MeshInstance3D.new()
		group.surface.index()
		var full_mesh:ArrayMesh=group.surface.commit()
		# Batching otherwise loses the GLB importer's distance-based mesh levels.
		var importer=ImporterMesh.new()
		importer.add_surface(Mesh.PRIMITIVE_TRIANGLES,full_mesh.surface_get_arrays(0))
		importer.generate_lods(60,0,[])
		merged.mesh=importer.get_mesh()
		merged.material_override=group.material
		root.add_child(merged)
	if not direct:print("Scenery batched: ",meshes.size()," parts -> ",groups.size()," draws")
