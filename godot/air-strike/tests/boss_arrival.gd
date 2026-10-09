extends SceneTree
var failures = 0
func check(ok: bool, label: String):
	if not ok:
		failures += 1
		push_error(label)
func _initialize():
	call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.lobby_launch = true
	game.reset_run()
	game._physics_process(2.3)
	check(game.state == "skill_choice" and game.progression.choices.size() == 3,"arrival presents three opening choices")
	game.pointer_press(game.skill_card_rect(0).get_center())
	check(game.state == "skill_choice","arrival click cannot instantly dismiss cards")
	game._physics_process(0.4)
	game.pointer_press(game.skill_card_rect(0).get_center())
	check(game.state == "playing","fresh click selects opening skill")
	check(game.progression.energy_required() == 9,"initial energy requirement is 1.5x")
	var c = game.campaign
	game.enemies.clear()
	game.wave = c.wave_limit()
	c.waiting = 0
	c.active = false
	c.update(0.1)
	check(not c.boss_phase and not game.enemies.is_empty(),"ordinary waves continue before ultimate")
	game.progression.skills.append("ring_laser")
	game.enemies.clear()
	c.active = false
	c.waiting = 0
	c.update(0.1)
	check(game.state == "boss_alert" and game.enemies.is_empty(),"warning precedes boss")
	game._physics_process(2.0)
	check(game.enemies.is_empty(),"boss absent during warning")
	game._physics_process(1.1)
	check(game.state == "playing" and game.enemies.size() == 1,"boss enters after warning")
	var boss = game.enemies[0]
	boss.pos.y = game.boss_entry_y()
	c.update_boss(boss,4.9)
	check(game.enemies.size() == 1,"summons wait five seconds")
	c.update_boss(boss,0.1)
	check(game.enemies.size() == 4,"boss summons three planes")
	game.kill_enemy(3)
	check(game.drops.any(func(d): return d.kind == "energy"),"summoned plane drops energy")
	c.update_boss(boss,5.0)
	check(game.enemies.size() == 6,"summoning repeats after five seconds")
	print("BOSS ARRIVAL: %d failures" % failures)
	game.queue_free()
	quit(failures)
