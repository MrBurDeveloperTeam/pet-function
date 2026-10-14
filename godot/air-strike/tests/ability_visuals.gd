extends SceneTree

func _initialize():
	call_deferred("verify")

func verify():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	for mobile in [false,true]:
		game.mobile_skill_cards = mobile
		game.arena_size = Vector2(480,960) if mobile else Vector2(960,540)
		game.reset_run()
		game.state = "playing"
		for i in range(10):
			game.spawn_enemy("fighter",Vector2(40+i*35,100))
		assert(game.dense_combat_visuals())
		assert(game.disc_texture != null)
		for i in range(40):
			game.add_effect(Vector2(200,200),"impact",0.3,52)
		assert(game.effects.filter(func(effect): return effect.kind=="impact").size()==12)
		game.trigger_ultimate_visual()
		game.trigger_revival_visual("TALENT REVIVAL")
		game.trigger_unyielding_visual()
		for frame in range(48):
			game.redraw_layers()
			await process_frame
			game.update_visual_effects(0.2)
		assert(game.ultimate_visual_time==0 and game.revival_visual_time==0 and game.unyielding_visual_time==0)
	print("ABILITY VISUALS / LANDSCAPE+PORTRAIT: completed without rendering errors")
	game.free()
	quit()
