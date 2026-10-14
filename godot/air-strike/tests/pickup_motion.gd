extends SceneTree

func _initialize(): call_deferred("verify")

func verify():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	for mobile in [false,true]:
		game.mobile_skill_cards = mobile
		for kind in ["coin","energy","repair"]:
			game.reset_run()
			game.state = "playing"
			game.pickup_player_previous = Vector2(100,300)
			game.player = Vector2(300,300)
			game.hp = 1
			game.drops = [{"pos":Vector2(200,300),"kind":kind,"age":0.0,"value":3}]
			game.update_drops(0.01)
			assert(game.drops.is_empty(),"A pickup crossing the aircraft path is collected")
			assert(game.score==25 if kind=="coin" else (game.progression.energy==3 if kind=="energy" else game.hp==2))
			var result = Vector3(game.score,game.progression.energy,game.hp)
			game.update_drops(0.01)
			assert(result==Vector3(game.score,game.progression.energy,game.hp),"Each reward is applied exactly once")
		game.reset_run()
		game.state = "playing"
		game.player = Vector2(250,300)
		game.pickup_player_previous = game.player
		game.drops = [{"pos":Vector2(170,300),"kind":"coin","age":0.0}]
		game.update_drops(0.01)
		assert(game.drops.size()==1 and game.drops[0].attracted)
		game.pickup_player_previous = game.player
		game.player = Vector2(400,300)
		var distance = game.drops[0].pos.distance_to(game.player)
		game.update_drops(0.05)
		assert(game.drops[0].attracted and game.drops[0].pos.distance_to(game.player)<distance,"Attraction persists outside its initial range")
		game.pickup_player_previous = game.player
		game.update_drops(0.2)
		assert(game.drops.is_empty(),"Locked attraction catches a moving aircraft")
	print("PICKUP MOTION: PASS coins / energy / repair, desktop + mobile")
	game.free()
	quit()
