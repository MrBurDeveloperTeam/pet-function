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
	game.reset_run()
	game.spawn_boss()
	var pattern_boss = game.enemies.back()
	pattern_boss.pos = Vector2(game.arena_size.x/2,game.boss_entry_y())
	pattern_boss.aim_point = Vector2(game.arena_size.x/2,game.arena_size.y-100)
	check(game.boss_patterns.LABELS.size() == 18,"ten new distinct boss patterns registered")
	for viewport in [Vector2(960,540),Vector2(1920,540),Vector2(960,1440)]:
		game.resize_arena(viewport)
		pattern_boss.pos = Vector2(viewport.x/2,game.boss_entry_y())
		pattern_boss.gap_x = viewport.x/2
		pattern_boss.aim_point = Vector2(viewport.x/2,viewport.y-100)
		for attack in range(8,18):
			pattern_boss.attack = attack
			pattern_boss.volley = 0
			game.enemy_shots.clear()
			game.fire_boss_pattern(pattern_boss)
			check(game.enemy_shots.size() > 0 and game.enemy_shots.size() <= 18,"new pattern has bounded density on all viewports")
			if attack in [9,11,13,17]:
				check(game.enemy_shots.any(func(shot): return is_equal_approx(shot.pos.x,pattern_boss.gap_x-60)) and game.enemy_shots.any(func(shot): return is_equal_approx(shot.pos.x,pattern_boss.gap_x+60)),"both narrowed corridor borders remain populated on all viewports")
			for shot in game.enemy_shots:
				check(shot.vel.is_finite() and shot.vel.length() <= 240,"new bullet trajectories have controlled speeds")
				if attack in [8,9,11,13,17]:
					var end_x = shot.pos.x+shot.vel.x*maxf(0,(viewport.y-shot.pos.y)/shot.vel.y)
					check(absf(shot.pos.x-pattern_boss.gap_x) >= 60 and absf(end_x-pattern_boss.gap_x) >= 60,"narrow lane patterns leave space throughout travel")
				if attack == 15:
					check(absf(wrapf(shot.vel.angle()-PI/2,-PI,PI)) >= 0.35,"open ring reserves its narrower downward escape wedge")
				if attack == 16: check(shot.homing_time <= 0.45,"comet tracking expires quickly")
	game.resize_arena(Vector2(960,540))
	game.reset_run()
	var strike = {"vertical":true,"line":0.5,"width":0.045,"age":0.0,"life":3.5}
	c.hazards = [strike]
	game.player = Vector2(game.arena_size.x/2,game.arena_size.y-100)
	game.invincible = 0
	c.update_hazards(0.25)
	check(c.hazard_position(strike).y < c.hazard_station(strike).y and game.hp == 3,"strike plane enters without beam damage")
	c.update_hazards(0.5)
	check(c.hazard_position(strike) == c.hazard_station(strike) and not c.hazard_firing(strike) and game.hp == 3,"strike plane charges at a fixed station")
	check(game.enemies.is_empty() and p.nearest(game.player).is_empty(),"invulnerable strike plane cannot be targeted")
	c.update_hazards(1.35)
	check(c.hazard_firing(strike) and game.hp == 2,"strike laser damages only during firing")
	game.invincible = 0
	c.update_hazards(1.0)
	check(not c.hazard_firing(strike) and game.hp == 2 and c.hazard_position(strike) != c.hazard_station(strike),"strike plane exits without beam damage")
	c.update_hazards(0.5)
	check(c.hazards.is_empty(),"strike plane leaves the arena after shooting")
	game.reset_run()
	game.spawn_boss()
	var attack_boss = game.enemies.back()
	check(attack_boss.max_hp == 504,"boss base health increased by twenty percent")
	attack_boss.shield = 1
	check(c.damage_enemy(attack_boss,999) == 0 and attack_boss.hp == 504 and attack_boss.shield == 1,"entering boss blocks damage without consuming shields")
	attack_boss.shield = 0
	p.airstrike_pending = true
	p.update(0)
	check(attack_boss.hp == 504,"airstrike cannot damage entering boss")
	attack_boss.pos = Vector2(game.arena_size.x/2,game.boss_entry_y()-10)
	check(not game.boss_can_take_damage(attack_boss),"partially visible tail keeps boss invulnerable")
	attack_boss.pos.y = game.boss_entry_y()
	check(game.boss_can_take_damage(attack_boss) and c.damage_enemy(attack_boss,10) == 10,"fully visible boss accepts damage")
	attack_boss.pos = Vector2(game.arena_size.x/2,100)
	attack_boss.gap_x = game.arena_size.x/2
	for pattern in [4,5,7]:
		attack_boss.attack = pattern
		game.enemy_shots.clear()
		game.fire_boss_pattern(attack_boss)
		check(not game.enemy_shots.is_empty() and game.enemy_shots.size() <= 16,"new boss patterns have bounded density")
		for bullet in game.enemy_shots:
			var travel = (game.arena_size.y-bullet.pos.y)/bullet.vel.y
			var end_x = bullet.pos.x+bullet.vel.x*travel
			check(absf(bullet.pos.x-attack_boss.gap_x) >= 60 and absf(end_x-attack_boss.gap_x) >= 60,"new curtains preserve narrow escape corridor throughout flight")
	attack_boss.attack = 6
	attack_boss.aim_point = Vector2(game.arena_size.x/2,400)
	game.player.x = 70
	game.enemy_shots.clear()
	game.fire_boss_pattern(attack_boss)
	check(game.enemy_shots.size() == 2,"locked burst fires only two aimed shots")
	for bullet in game.enemy_shots:
		check(bullet.vel.normalized().dot((attack_boss.aim_point-bullet.pos).normalized()) > 0.999,"burst aims at warning position rather than chasing player")
	attack_boss.volley = 0
	attack_boss.fire = 0
	attack_boss.warning = false
	game.update_boss_attack(attack_boss,1)
	check(not attack_boss.warning,"next attack waits until prior boss shots leave")
	game.reset_run()
	game.allow_skill_choices = true
	p.energy = 12
	c.active = true
	c.update(0.01)
	check(game.state == "playing" and p.choices.is_empty() and p.energy == 12,"wave clear cannot offer skills below energy threshold")
	game.infinite_mode = true
	c.infinite_wave = 50
	c.boss_defeated()
	check(game.state == "playing" and p.choices.is_empty() and c.super_offer,"endless boss bonus waits for energy upgrade")
	game.infinite_mode = false
	game.stage_level = 99
	c.bosses_defeated = 0
	c.boss_defeated()
	check(game.state == "playing" and p.choices.is_empty(),"boss rush cannot offer skills below energy threshold")
	game.allow_skill_choices = false
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
	boss.pos = Vector2(game.arena_size.x/2,game.boss_entry_y())
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
		check(game.state == ("ending_victory" if i == 2 else "playing"),"boss rush clears only after three bosses")
	game.stage_level = 1
	game.reset_run()
	game.allow_skill_choices = true
	p.talents = [3]
	p.offer(true)
	check(p.choices.size() == 3,"talent 3 keeps the three-card limit")
	var selected = p.choices[0][0]
	p.choose(0)
	check(p.skills == [selected] and game.state == "skill_choice" and p.choices.size() <= 3,"talent 3 offers an extra opening choice")
	p.choose(0)
	check(p.skills.size() == 2 and game.state == "playing","extra opening choice grants a second distinct skill")
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
	p.skills = ["ring_laser","supercrit","double_counter","vamp_drone"]
	game.allow_skill_choices = true
	game.state = "playing"
	p.choices.clear()
	p.offer()
	check(p.choices.is_empty() and game.state == "playing","endless also stops offers after four ultimate routes")
	for viewport in [Vector2(960,540),Vector2(1920,1080),Vector2(960,1440)]:
		game.resize_arena(viewport)
		p.skills.clear()
		p.offer(true)
		for i in range(p.choices.size()): check(game.combat_rect.encloses(game.skill_card_rect(i)),"four-choice cards fit every viewport")
	print("AIR_STRIKE_CAMPAIGN: ","PASS" if failures == 0 else "FAIL"," (",failures," failures)")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
