extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.set_process(false)
	game.allow_skill_choices = false
	for mobile in [false,true]:
		game.mobile_skill_cards = mobile
		game.reset_run()
		game.state = "playing"
		game.visual_quality = 0
		game.slow_frame_time = 0
		game.stable_frame_time = 0
		for frame in range(24): game.update_visual_quality(0.06)
		assert(game.visual_quality==2,"Sustained slow rendering lowers visual quality")
		assert(game.particle_budget()==24 and game.effect_budget()==16)
		game.burst(game.player,500,"spark")
		assert(game.particles.size()<=24)
		for i in range(50): game.add_effect(game.player,"impact",0.3,40)
		assert(game.effects.size()<=6)
		game.explode(game.player,40)
		game.explode(Vector2(200,100),100,true)
		assert(game.effects.filter(func(e):return e.essential).size()==4,"Aircraft and boss explosions survive budget limits")
		game.fire_player()
		var shot_count = game.shots.size()
		var damage = game.shots[0].damage
		game.update_visual_effects(0.01)
		assert(game.shots.size()==shot_count and game.shots[0].damage==damage,"Visual budgets never drop attacks or alter damage")
		for frame in range(270): game.update_visual_quality(1.0/30 if mobile else 1.0/60)
		assert(game.visual_quality<2,"Stable frames gradually restore visual quality")
		game.visual_quality = 0
		game.update_visual_quality(2)
		assert(game.visual_quality==0,"Background stalls do not force quality changes")
	print("ADAPTIVE VISUAL BUDGET: PASS desktop / mobile, protected effects, unchanged attacks")
	game.free()
	quit()
