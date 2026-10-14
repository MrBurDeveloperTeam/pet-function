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
		var readiness = game.campaign.recommended_power()/1000.0
		check(is_equal_approx(scale.hp,pow(readiness,0.85)*0.69),"Campaign HP increased by 15 percent from the reduced baseline at every stage")
		check(is_equal_approx(scale.damage,pow(readiness,0.28)*0.69),"Campaign damage increased by 15 percent from the reduced baseline at every stage")
		for key in previous:
			check(scale[key] >= previous[key],"stage difficulty never decreases: "+key)
		previous = scale
		game.reset_run()
		game.spawn_enemy("ship",Vector2(300,200),0,"tank",true)
		var elite_hp = game.enemies.back().hp
		game.spawn_boss()
		var boss = game.enemies.back()
		var base_boss_hp: float = boss.hp
		game.campaign.prepare_boss(boss)
		var expected_hp: float = base_boss_hp*scale.hp*(1.8+(stage-1)/99.0*0.8)*(0.7/1.15)
		check(is_equal_approx(boss.max_hp,expected_hp),"Boss health reduced by 30 percent independently of the overall increase")
		check(boss.max_hp > elite_hp*10,"boss durability exceeds elite enemy at every stage")
		boss.pos.y = game.boss_entry_y()
		game.campaign.update_boss(boss,0.01)
		var cadence = boss.attack_cadence
		boss.hp = boss.max_hp*0.25
		game.campaign.update_boss(boss,0.01)
		check(boss.attack_cadence > cadence,"boss pressure escalates at low health")
	check(game.campaign.recommended_power() == 12100,"stage 100 matches displayed recommendation")
	check(previous.hp > 4.8 and previous.damage < 2.1,"late-game durability grows without excessive one-hit damage")
	game.infinite_mode = true
	for wave in [1,10,100,101,300,301,1000]:
		game.campaign.infinite_wave = wave
		var w = maxi(0,wave-1)
		var health = 1+mini(w,100)*0.02+clampi(w-100,0,200)*0.01+maxi(0,w-300)*0.005
		var builds = game.progression.routes(true).size()
		var scale = game.campaign.scaling()
		check(is_equal_approx(scale.hp,health*(1+builds*0.06)*0.69),"Endless HP increased by 15 percent from the reduced baseline across scaling boundaries")
		check(is_equal_approx(scale.damage,(1+minf(w*0.002,1.5))*0.69),"Endless damage increased by 15 percent from the reduced baseline")
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
