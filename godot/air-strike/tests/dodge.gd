extends SceneTree
func _initialize():
	call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	game.reset_run()
	var p = game.progression
	p.skills = ["evade"]
	assert(is_equal_approx(p.dodge_chance(),0.25))
	game.rng.seed = 42
	var dodges = 0
	for i in range(10000):
		if p.prevent_hit(): dodges += 1
	assert(dodges > 2300 and dodges < 2700)
	assert(game.effects.any(func(e): return e.kind == "dodge" and e.duration >= 0.7))
	for i in range(100): assert(not p.prevent_hit(false))
	p.skills.append("double_counter")
	assert(is_equal_approx(p.dodge_chance(),0.45))
	p.skills.clear()
	assert(p.dodge_chance() == 0)
	game.free()
	print("DODGE: PASS, 25% probability and visible feedback")
	quit()
