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
	var rocket = game.shots.filter(func(b): return b.missile and b.source == "player")[0]
	check(absf(rocket.pos.x-game.player.x) == 36 and absf(rocket.vel.x) > 200 and rocket.vel.y < 0,"missile launches outward from aircraft wing")
	var launch_velocity: Vector2 = rocket.vel
	game.update_shots(0.1)
	check(rocket.vel == launch_velocity,"wing launch has a visible outward segment before homing")
	game.update_shots(0.1)
	check(rocket.vel != launch_velocity and rocket.trail.size() > 1,"missile curves toward target and records luminous trail")
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
	check(game.state == "ending_defeat","per-level saves cannot loop forever")
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
	var drone_skill = p.LIBRARY.filter(func(s): return s[0] == "drone")[0]
	var drone_upgrade = p.LIBRARY.filter(func(s): return s[0] == "drone_boost")[0]
	check(drone_skill[3] == 1 and p.eligible(drone_skill),"drone is an eligible initial skill")
	check(p.drone_count() == 0 and not p.eligible(drone_upgrade),"drone upgrade hidden before selecting initial drone")
	p.skills = ["drone","damage"]
	game.player_tier = 4
	check(p.drone_count() == 1 and p.eligible(drone_upgrade),"initial drone generates one drone and unlocks upgrade")
	game.shots.clear()
	p.update(0.01)
	check(game.shots.size() == 1 and game.shots[0].source == "drone" and is_equal_approx(game.shots[0].damage,0.65),"drone deals half tier four aircraft base damage")
	p.talents = [10,12]
	check(p.drone_count() == 2,"initial drone does not add a third drone to twin drones")
	p.talents.clear()
	p.skills.append("drone_boost")
	game.shots.clear()
	p.update(0.5)
	check(game.shots.size() == 2,"drone upgrade doubles initial drone bullets")
	game.reset_run()
	check(p.drone_count() == 0 and not p.eligible(drone_upgrade),"new run resets initial drone and upgrade eligibility")
	game.player_tier = 1
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
	check(p.choice_age == 0,"new skill offer resets its entrance animation")
	game._physics_process(0.1)
	check(is_equal_approx(p.choice_age,0.1),"skill card animation progresses while combat is paused")
	var time = game.elapsed
	game._physics_process(1)
	check(game.elapsed == time,"choice pauses battle")
	p.choose(0)
	p.collect_energy(8)
	check(game.state == "playing" and p.skill_level == 0,"energy below new threshold does not level up")
	p.collect_energy(1)
	check(game.state == "skill_choice" and p.skill_level == 1 and p.energy_required() == 14,"1.5x energy threshold grows and rounds up on level up")
	p.choose(0)
	check(p.choice_age == 0,"energy upgrade restarts the card animation")
	p.skills = ["ring_laser","supercrit","double_counter"]
	p.offer()
	check(game.state == "skill_choice" and not p.choices.is_empty(),"three completed routes still allow skills")
	p.skills.append("vamp_drone")
	p.choices.clear()
	game.state = "playing"
	p.energy = 0
	p.skill_level = 0
	p.collect_energy(58)
	check(game.state == "playing" and p.choices.is_empty() and p.skill_level == 3 and p.energy == 17,"four ultimate routes stop cards but continue energy leveling")
	p.offer()
	check(game.state == "playing" and p.choices.is_empty(),"direct offers cannot bypass completed routes")
	game.allow_skill_choices = false
	game.reset_run()
	game.wave = game.campaign.wave_limit()
	game.campaign.waiting = 0
	game._physics_process(0.01)
	check(not game.boss_spawned and not game.enemies.is_empty() and p.routes(true).is_empty(),"ordinary waves continue until an ultimate skill is owned")
	# Piercing hits each enemy once and stops after its allowed extra target.
	game.reset_run()
	p.talents = [6]
	game.spawn_enemy("bomber",Vector2(300,200))
	game.spawn_enemy("bomber",Vector2(300,300))
	game.shots.append(p.projectile(Vector2(300,400),Vector2(0,-1000),1))
	game.update_shots(0.25)
	check(game.enemies.all(func(e): return e.hp <= 11) and game.shots.is_empty(),"pierce I damages two enemies once")
	game.reset_run()
	p.talents.clear()
	p.skills = ["laser"]
	game.player = Vector2(300,450)
	game.spawn_enemy("bomber",Vector2(300,100))
	game.spawn_enemy("bomber",Vector2(300,280))
	game.shots.append(p.projectile(Vector2(300,400),Vector2(0,-580),1))
	game.update_shots(0.01)
	check(game.enemies.all(func(e): return e.hp == e.max_hp),"laser charge does not damage enemies before emission")
	check(game.shots[0].pos.is_equal_approx(game.laser_origin()),"laser charges at the aircraft nose")
	game.update_shots(0.1)
	check(game.enemies.all(func(e): return e.hp < e.max_hp),"long laser immediately hits multiple enemies across its full beam")
	var laser_hp = game.enemies[0].hp
	game.update_shots(0.01)
	check(game.enemies[0].hp == laser_hp and game.shots.size() == 1,"visible laser pulse cannot damage the same enemy each frame")
	game.update_shots(0.2)
	check(game.shots.is_empty(),"laser pulse fades before next base firing interval")
	print("AIR_STRIKE_PROGRESSION: ","PASS" if failures == 0 else "FAIL"," (",failures," failures)")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
