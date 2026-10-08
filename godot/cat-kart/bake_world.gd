extends SceneTree
func _initialize():call_deferred("run")
func own(node: Node, owner_node: Node):
	for child in node.get_children():
		child.owner=owner_node
		own(child,owner_node)
func save_scene(node: Node, path: String):
	own(node,node)
	var scene=PackedScene.new()
	assert(scene.pack(node)==OK)
	assert(ResourceSaver.save(scene,path,ResourceSaver.FLAG_COMPRESS)==OK)
func run():
	DirAccess.make_dir_recursive_absolute("res://built")
	var game=load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	game.set_physics_process(false)
	await process_frame
	await process_frame
	var circuit=Node3D.new()
	root.add_child(circuit)
	circuit.name="TownCircuit"
	var dynamic=[]
	for racer in game.racers:dynamic.append(racer.node)
	for pickup in game.boxes:dynamic.append(pickup.node)
	for node in game.get_children():
		if (node is Node3D or node is WorldEnvironment) and not node is Camera3D and not node is CharacterBody3D and not node in dynamic:node.reparent(circuit,true)
	save_scene(circuit,"res://built/circuit.scn")
	print("CIRCUIT LENGTH: ",game.sample_length,"m")
	for i in 6:
		var kart=game.make_kart(i)
		await process_frame
		# queue_free is flushed after the frame signal; wait through that flush
		# before packing or both original parts and their merged copies get saved.
		await process_frame
		kart.name=game.CAT_NAMES[i]+"Kart"
		save_scene(kart,"res://built/"+game.CAT_IDS[i]+".scn")
		kart.queue_free()
	var document=GLTFDocument.new()
	var state=GLTFState.new()
	assert(document.append_from_scene(circuit,state)==OK)
	assert(document.write_to_filesystem(state,"res://blender/source/circuit.glb")==OK)
	print("BAKED CIRCUIT AND SIX RACERS")
	game.queue_free()
	circuit.queue_free()
	await process_frame
	quit()
