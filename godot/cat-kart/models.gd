extends RefCounted
var g: Node3D
func _init(owner: Node3D) -> void:
	g=owner
func kart(id: int) -> Node3D:
	var imported=load("res://models/"+g.CAT_IDS[id]+"_kart.glb").instantiate()
	var n: Node3D=imported
	if imported.has_node("Kart"):
		n=imported.get_node("Kart")
		imported.remove_child(n)
		imported.free()
	g.add_child(n)
	# GLB includes coat vertex colours; explicitly enable them before batching.
	for mesh_node in n.find_children("*","MeshInstance3D",true,false):
		for surface_index in mesh_node.mesh.get_surface_count():
			var arrays=mesh_node.mesh.surface_get_arrays(surface_index)
			if arrays[Mesh.ARRAY_COLOR]!=null and arrays[Mesh.ARRAY_COLOR].size()>0:
				var material=mesh_node.get_active_material(surface_index)
				if material is StandardMaterial3D:
					material=material.duplicate()
					material.vertex_color_use_as_albedo=true
					material.vertex_color_is_srgb=false
					mesh_node.set_surface_override_material(surface_index,material)
	for wheel_name in ["FrontL","FrontR","RearL","RearR"]:
		for child in n.get_node(wheel_name).get_children():
			if str(child.name).begins_with("Spin"):child.name="Spin"
	for edge in [-1,1]:
		var flame=g.ball(n,Vector3(edge*.43,.52,1.95),Vector3(.18,.18,.65),Color("77dce4"))
		flame.name="ExhaustL" if edge<0 else "ExhaustR"
		flame.visible=false
		flame.material_override.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	var bubble=g.ball(n,Vector3(0,1.5,0),Vector3(3,3.3,3.7),Color(.25,.8,1,.14))
	bubble.name="Shield"
	bubble.material_override.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	bubble.visible=false
	return n
func animate(n: Node3D, velocity: float, turn: float, time: float, dt: float) -> void:
	for name_value in ["FrontL","FrontR","RearL","RearR"]:
		var wheel=n.get_node(name_value)
		if name_value.begins_with("Front"):
			wheel.rotation.y=lerpf(wheel.rotation.y,-turn*.42,minf(1,dt*12))
		wheel.get_node("Spin").rotation.x-=velocity*dt/.44
	var driver=n.get_node("Driver")
	driver.rotation.z=lerpf(driver.rotation.z,-turn*.12,minf(1,dt*7))
	driver.position.y=.88+sin(time*12)*minf(absf(velocity)/36,1)*.012
	driver.get_node("Head").rotation.y=lerpf(driver.get_node("Head").rotation.y,-turn*.18,minf(1,dt*5))
	driver.get_node("Tail").rotation.z=sin(time*3)*.08
