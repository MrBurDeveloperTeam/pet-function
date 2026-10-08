extends SceneTree
func _initialize():
	for name_value in ["circuit","mallow","silverbelt","fastrat","gulu","munchkin","mochi"]:
		var path="res://built/"+name_value+".scn"
		assert(ResourceSaver.save(load(path),path,ResourceSaver.FLAG_COMPRESS)==OK)
	print("COMPRESSED GAME SCENES")
	quit()
