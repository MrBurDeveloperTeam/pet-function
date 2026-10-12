extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	game.reset_run()
	game.progression.skills.append("drone")
	for pos in [game.player_bounds.position,game.player_bounds.end,Vector2(game.player_bounds.position.x,game.player_bounds.end.y),Vector2(game.player_bounds.end.x,game.player_bounds.position.y)]:
		game.player = pos
		for drone in game.progression.drone_positions():
			assert(drone.distance_to(pos)>=77.99,"Drone cannot overlap player at arena corners")
			assert(drone.x>=38 and drone.y>=38 and drone.x<=game.arena_size.x-38 and drone.y<=game.arena_size.y-38,"Drone remains visible")
	game.player = game.player_bounds.get_center()
	game.enemies.clear()
	game.spawn_enemy("fighter",game.player)
	var enemy = game.enemies[0]
	enemy.hp = 100
	var hp = game.hp
	game.invincible = 0
	game.update_enemies(0)
	assert(game.hp<hp and enemy.hp<100,"Contact damages both aircraft")
	var remaining = enemy.hp
	game.update_enemies(0)
	assert(enemy.hp==remaining,"Contact cooldown prevents frame-rate damage")
	game.free()
	print("CONTACT SPACING: PASS / corner spacing, visibility, mutual damage and cooldown")
	quit()
