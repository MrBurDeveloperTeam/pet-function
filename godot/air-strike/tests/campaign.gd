extends SceneTree
var game
var failures = 0
func check(ok: bool, message: String):
	if not ok:
		failures += 1
		push_error(message)
func _initialize(): call_deferred("run")
func run():
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	var c = game.campaign
	var p = game.progression
	for stage in range(1,101):
		game.stage_level = stage
		game.reset_run()
		var expected = 5 if stage <= 20 else (6 if stage <= 50 else (7 if stage <= 80 else 8))
		check(c.wave_limit() == expected,"wave count for stage %d" % stage)
		for wave in range(expected):
			c.update(2)
			check(game.wave == wave+1 and not game.boss_spawned,"fixed wave scheduling")
			game.enemies.clear()
			c.update(0.01)
		c.update(2)
		check(game.boss_spawned and game.enemies[0].kind == "boss","boss doesn't require ultimate skills")
	game.stage_level = 100
	var scale = c.scaling()
	check(is_equal_approx(scale.hp,3.2) and is_equal_approx(scale.damage,2.2) and is_equal_approx(scale.count,2.6),"bounded stage 100 scaling")
	p.talents = range(1,16)
	check(c.scaling() == scale,"permanent upgrades are not canceled by enemy scaling")
	game.reset_run()
	game.spawn_enemy("ship",Vector2(400,200),0,"healer")
	game.spawn_enemy("fighter",Vector2(430,200))
	var patient = game.enemies[1]
	patient.hp = 1
	c.update_enemy(game.enemies[0],3.1)
	check(is_equal_approx(patient.hp,1+patient.max_hp*0.08),"healer restores 8% nearby max HP every three seconds")
	game.spawn_enemy("ship",Vector2(440,200),0,"shield_support")
	c.update_enemy(game.enemies.back(),3.1)
	check(patient.shield == 1 and c.damage_enemy(patient,999) == 0 and patient.shield == 0,"shield support and shield-before-damage")
	game.spawn_enemy("ship",Vector2(300,100),0,"summoner")
	var count = game.enemies.size()
	c.update_enemy(game.enemies.back(),3.1)
	check(game.enemies.size() == count+2,"summoner creates two fighters")
	game.enemies.clear()
	game.spawn_boss()
	c.prepare_boss(game.enemies.back())
	var boss = game.enemies.back()
	boss.hp = boss.max_hp*0.74
	c.update_boss(boss,0.01)
	check(boss.stage_phase == 2 and game.enemies.size() == 4,"final phase two creates attack, shield and healing drones")
	boss.hp = boss.max_hp*0.49
	c.update_boss(boss,0.01)
	check(boss.stage_phase == 3 and c.hazard_timer == 0,"phase three arms field attack")
	boss.hp = boss.max_hp*0.24
	c.update_boss(boss,0.01)
	check(boss.stage_phase == 4 and boss.mutations.has("berserk"),"final phase four combines mechanics")
	game.stage_level = 99
	game.reset_run()
	c.boss_phase = true
	for i in range(3):
		c.boss_defeated()
		check(game.state == ("victory" if i == 2 else "playing"),"boss rush clears only after three bosses")
	game.stage_level = 1
	game.reset_run()
	game.allow_skill_choices = true
	p.talents = [3]
	p.offer(true)
	check(p.choices.size() == 4,"talent 3 creates four choices")
	var selected = p.choices[0][0]
	p.choose(0)
	check(p.skills == [selected] and game.state == "playing","talent 3 still grants exactly one skill")
	game.allow_skill_choices = false
	game.reset_run()
	p.skills = ["vampire"]
	game.hp = 1
	var target = {"hp":999999.0,"max_hp":999999.0,"pos":Vector2(100,100),"kind":"boss"}
	var bullet = {"crit":false,"base_damage":1.0,"source":"player"}
	for i in range(100):
		p.on_hit(bullet,target,1)
	check(target.hp == 999999 and game.hp <= p.max_health(),"lifesteal never drains a percentage of boss health")
	game.hp = 1
	for i in range(100): p.on_hit(bullet,target,0)
	check(game.hp == 1,"zero actual damage cannot heal")
	game.infinite_mode = true
	game.reset_run()
	p.skills = ["ring_laser","supercrit","double_counter","vamp_drone"]
	var life = p.LIBRARY.filter(func(s): return s[0] == "life")[0]
	check(p.eligible(life),"endless removes four-route limit")
	p.skills.clear()
	c.infinite_wave = 101
	var hp101 = c.scaling().hp
	c.infinite_wave = 301
	var hp301 = c.scaling().hp
	c.infinite_wave = 501
	check(is_equal_approx(hp101,3) and is_equal_approx(hp301,5) and is_equal_approx(c.scaling().hp,6),"endless health follows piecewise linear growth")
	game.wave = 49
	c.waiting = 0
	c.update(0.1)
	check(c.infinite_wave == 50 and game.enemies[0].mutations.size() >= 2,"wave 50 super boss has mutations")
	c.boss_defeated()
	check(not c.boss_phase and c.waiting == 2,"endless continues after boss")
	p.skills = ["ring_laser","reflect2","supercrit","double_counter","vamp_drone","dimension"]
	game.allow_skill_choices = true
	p.offer()
	check(p.choices.size() == 3 and p.choices[0][0] == "ascend_laser","complete builds unlock ascension")
	p.choose(2)
	check(p.ascensions.shield == 1,"ascension applies existing ability improvement")
	for viewport in [Vector2(960,540),Vector2(1920,1080),Vector2(960,1440)]:
		game.resize_arena(viewport)
		p.skills.clear()
		p.offer(true)
		for i in range(p.choices.size()): check(game.combat_rect.encloses(game.skill_card_rect(i)),"four-choice cards fit every viewport")
	print("AIR_STRIKE_CAMPAIGN: ","PASS" if failures == 0 else "FAIL"," (",failures," failures)")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
