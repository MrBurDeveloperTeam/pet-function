extends SceneTree
var failures = 0
func _initialize(): call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	for stage in [1,50,100]:
		game.stage_level = stage
		game.player_tier = 1 if stage == 1 else 6
		game.progression.talents = [] if stage == 1 else range(1,16)
		game.rng.seed = 1945+stage
		game.reset_run()
		for frame in range(36000):
			if game.state == "skill_choice": game.progression.choose(0)
			game.invincible = 999
			game._physics_process(1.0/60)
			if game.enemies.size() > 40 or game.enemy_shots.size() > 140 or game.shots.size() > 300:
				failures += 1
				push_error("entity cap exceeded")
				break
			if game.state == "victory": break
		if not game.boss_spawned:
			failures += 1
			push_error("campaign scheduler stalled before boss")
		print("SOAK stage ",stage," time ",snappedf(game.elapsed,0.1)," state ",game.state," enemies ",game.enemies.size()," bullets ",game.enemy_shots.size())
	game.infinite_mode = true
	game.reset_run()
	for frame in range(18000):
		if game.state == "skill_choice": game.progression.choose(0)
		game.invincible = 999
		game._physics_process(1.0/60)
		if game.enemies.size() > 40 or game.enemy_shots.size() > 140 or game.shots.size() > 300:
			failures += 1
			push_error("endless entity cap exceeded")
			break
	print("SOAK endless wave ",game.wave," bosses ",game.campaign.bosses_defeated)
	print("AIR_STRIKE_SOAK: ","PASS" if failures == 0 else "FAIL")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
