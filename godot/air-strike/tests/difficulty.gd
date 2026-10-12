extends SceneTree
var failures = 0
func check(ok: bool, message: String):
	if not ok:
		failures += 1
		push_error(message)
func _initialize():
	call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	var previous = {"hp":0,"damage":0,"count":0,"fire":0}
	for stage in range(1,101):
		game.stage_level = stage
		var scale = game.campaign.scaling()
		for key in previous:
			check(scale[key] >= previous[key],"stage difficulty never decreases: "+key)
		previous = scale
		game.reset_run()
		game.spawn_enemy("ship",Vector2(300,200),0,"tank",true)
		var elite_hp = game.enemies.back().hp
		game.spawn_boss()
		var boss = game.enemies.back()
		game.campaign.prepare_boss(boss)
		check(boss.max_hp > elite_hp*20,"boss durability exceeds elite enemy at every stage")
		boss.pos.y = game.boss_entry_y()
		game.campaign.update_boss(boss,0.01)
		var cadence = boss.attack_cadence
		boss.hp = boss.max_hp*0.25
		game.campaign.update_boss(boss,0.01)
		check(boss.attack_cadence > cadence,"boss pressure escalates at low health")
	check(game.campaign.recommended_power() == 12100,"stage 100 matches displayed recommendation")
	check(previous.hp > 8 and previous.damage < 2.1,"late-game durability grows without excessive one-hit damage")
	game.progression.skills.clear()
	var normal = game.player_shot_interval()
	for skills in [["laser"],["ring_laser"],["laser","ring_laser"]]:
		game.progression.skills = skills
		check(is_equal_approx(normal/game.player_shot_interval(),0.75),"laser frequency is reduced by 25 percent once")
	game.progression.talents = [2]
	check(is_equal_approx(game.player_shot_interval(),normal/(0.75*1.1)),"rapid-fire talent remains multiplicative with laser reduction")
	game.free()
	print("DIFFICULTY/LASER: %d failures" % failures)
	quit(failures)
