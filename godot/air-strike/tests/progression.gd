extends SceneTree
var game
var failures = 0
func check(ok: bool, message: String):
	if not ok:
		failures += 1
		push_error(message)
func _initialize():
	call_deferred("run")
func run():
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	var p = game.progression
	game.reset_run()
	p.talents = [1,2,4,5,6,7,8,9,10,11,12,13,14,15]
	game.fire_player()
	check(game.shots.size() == 3 and game.shots[0].vel.x < 0 and game.shots[2].vel.x > 0,"talent II starts with three fan lanes, does not add I twice")
	check(is_equal_approx(p.damage_scale(),1.1) and is_equal_approx(p.crit_scale(),2.4),"damage and crit talents apply")
	game.shots.clear()
	game.spawn_enemy("bomber",Vector2(400,200))
	p.update(5.1)
	check(game.shots.filter(func(b): return b.missile).size() == 3,"player plus two drone missiles every five seconds")
	check(game.shots.filter(func(b): return b.source == "drone" and not b.missile).size() == 2,"two drones shoot, not three")
	game.hp = 1
	game.invincible = 0
	game.hit_player()
	check(game.hp == 1 and p.unyielding_used and not p.revive_used,"unyielding saves first fatal hit")
	game.invincible = 0
	game.hit_player()
	check(game.hp == 1 and p.revive_used,"revive separately saves next fatal hit")
	game.invincible = 0
	game.hit_player()
	check(game.state == "defeat","per-level saves cannot loop forever")
	game.reset_run()
	check(not p.revive_used and not p.unyielding_used and p.kills == 0,"restart resets per-level talent charges")
	p.kills = 29
	p.killed()
	game.enemies.clear()
	game.spawn_enemy("fighter",Vector2(100,100))
	game.spawn_enemy("bomber",Vector2(200,100))
	p.update(0.01)
	check(game.enemies.size() == 1 and game.enemies[0].hp == 6,"30 kills bomb kills fighters and halves bomber HP")
	check(p.kills == 30 and not p.airstrike_pending,"airstrike kills do not recursively trigger airstrike")
	game.reset_run()
	p.talents.clear()
	p.skills = ["life","shield","defense"]
	p.shield_layers = 1
	game.invincible = 0
	game.hit_player()
	check(game.hp == 3 and p.shield_layers == 0 and game.invincible == 0,"shield absorbs before dodge or invulnerability")
	game.hit_player()
	check(is_equal_approx(game.hp,2.08),"defense uses fractional damage")
	p.skills = ["crit_damage","crit_chance"]
	var supercrit = p.LIBRARY.filter(func(s): return s[0] == "supercrit")[0]
	check(not p.eligible(supercrit),"ultimate requires both advanced prerequisites")
	p.skills.append_array(["double_damage","crit_bomb"])
	check(p.eligible(supercrit),"super critical unlocks with both advanced skills")
	p.skills = ["ring_laser","supercrit","double_counter","vamp_drone"]
	check(p.routes(true).size() == 4,"ultimate route count is distinct")
	var vitality = p.LIBRARY.filter(func(s): return s[0] == "life")[0]
	check(not p.eligible(vitality),"cannot enter fifth evolution route")
	p.skills = ["ring_laser","reflect"]
	var reflect2 = p.LIBRARY.filter(func(s): return s[0] == "reflect2")[0]
	check(not p.eligible(reflect2),"ring laser makes ricochet II unavailable")
	game.reset_run()
	game.allow_skill_choices = true
	p.offer(true)
	check(game.state == "skill_choice" and p.choices.size() == 3 and p.choices.all(func(s): return s[3] == 1),"opening gives three initial skills")
	var time = game.elapsed
	game._physics_process(1)
	check(game.elapsed == time,"choice pauses battle")
	p.choose(0)
	p.collect_energy(6)
	check(game.state == "skill_choice" and p.skill_level == 1 and p.energy_required() == 9,"energy threshold grows on level up")
	p.choose(0)
	game.allow_skill_choices = false
	game.reset_run()
	game.wave = game.campaign.wave_limit()
	game.campaign.waiting = 0
	game._physics_process(0.01)
	check(game.boss_spawned and p.routes(true).is_empty(),"fixed wave boss appears without any ultimate skills")
	# Piercing hits each enemy once and stops after its allowed extra target.
	game.reset_run()
	p.talents = [6]
	game.spawn_enemy("bomber",Vector2(300,200))
	game.spawn_enemy("bomber",Vector2(300,300))
	game.shots.append(p.projectile(Vector2(300,400),Vector2(0,-1000),1))
	game.update_shots(0.25)
	check(game.enemies.all(func(e): return e.hp <= 11) and game.shots.is_empty(),"pierce I damages two enemies once")
	print("AIR_STRIKE_PROGRESSION: ","PASS" if failures == 0 else "FAIL"," (",failures," failures)")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
