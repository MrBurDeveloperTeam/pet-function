extends SceneTree
func _initialize() -> void:
	call_deferred("run")
func own_children(node: Node, owner: Node) -> void:
	for child in node.get_children():
		child.owner = owner
		own_children(child,owner)
func run() -> void:
	var game = load("res://main.gd").new()
	var builder = load("res://models.gd").new(game)
	DirAccess.make_dir_recursive_absolute("res://models")
	for i in 6:
		var kart = builder.kart(i)
		kart.name = game.CAT_NAMES[i]+"Kart"
		own_children(kart,kart)
		var packed = PackedScene.new()
		assert(packed.pack(kart)==OK)
		assert(ResourceSaver.save(packed,"res://models/"+game.CAT_IDS[i]+".tscn")==OK)
		kart.free()
	var town = load("res://town_art.gd").new(game,null)
	for i in 4:
		town.building(Vector3.ZERO,0,i)
		var building = game.get_child(game.get_child_count()-1)
		building.name = "TownShop"+str(i)
		var scene = PackedScene.new()
		building.owner = null
		own_children(building,building)
		assert(scene.pack(building)==OK)
		assert(ResourceSaver.save(scene,"res://models/shop_"+str(i)+".tscn")==OK)
		building.free()
	game.free()
	print("Saved six editable model scenes")
	quit()

