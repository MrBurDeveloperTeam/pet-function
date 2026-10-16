extends SceneTree

# Run against --main-pack public/games/cat-kart/index.pck, not the source
# project. This catches missing dynamic loads in the selected export list.
func _initialize():
	call_deferred("check_pack")

func check_pack():
	var scene = load("res://main.tscn")
	if not scene is PackedScene:
		push_error("Missing packaged main scene")
		quit(1)
		return
	var game = scene.instantiate()
	if not game.has_method("make_kart"):
		push_error("Packaged game script or one of its preloads did not load")
		game.free()
		quit(1)
		return
	root.add_child(game)
	await process_frame
	for index in range(6):
		var kart = game.make_kart(index)
		if kart == null or not kart.has_node("Driver") or not kart.has_node("FrontL/Spin"):
			push_error("Missing packaged kart or its animation nodes: " + str(index))
			quit(1)
			return
		kart.queue_free()
	for path in ["res://built/circuit.scn", "res://art/engine-loop.wav", "res://art/Quadrit.ttf", "res://contact_shadow.gdshader", "res://pixel_world.gdshader"]:
		if load(path) == null:
			push_error("Missing packaged runtime resource: " + path)
			quit(1)
			return
	game.queue_free()
	await process_frame
	print("PACKAGED CAT KART: scene, six cats, animation nodes, shaders, font and audio passed")
	quit()
