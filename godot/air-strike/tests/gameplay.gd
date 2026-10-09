extends SceneTree
var game
var failures = 0
func check(condition: bool, message: String):
	if not condition:
		failures += 1
		push_error(message)
func _initialize():
	call_deferred("run")
func run():
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.allow_skill_choices = false
	game.set_physics_process(false)
	check(["player","fighter","bomber","ship","drone"].all(func(kind): return game.sprites.has(kind)) and game.ocean_texture != null, "all production visual assets load")
	for sprite in game.sprites.values():
		check(sprite.get_width() > 0 and sprite.get_height() > 0, "atlas regions have valid dimensions")
	game.burst(Vector2(200,200),700,"fire")
	check(game.particles.size() == 500, "visual particle cap holds under heavy explosions")
	game.reset_run()
	check(game.particles.is_empty(), "restart clears visual effects")
	check(game.hp == 3 and game.state == "playing", "start resets armor")
	check(game.health_indicator_rect(game.player,"player").end.y < game.player.y-game.aircraft_dimensions("player").y/2, "player health is in front of the nose")
	var fighter_pos = Vector2(300,200)
	check(game.health_indicator_rect(fighter_pos,"fighter").position.y > fighter_pos.y+game.aircraft_dimensions("fighter").y/2, "enemy health is in front of its downward-facing nose")
	game.fire_player()
	check(game.shots.size() == 1, "base single gun before purchased extra bullets")
	game.shots.clear()
	game.spawn_enemy("fighter",Vector2(240,400))
	game.enemies[0].hp = 1
	game.shots.append({"pos":Vector2(240,600),"vel":Vector2(0,-10000),"damage":1})
	game.update_shots(0.04)
	check(game.enemies.is_empty() and game.score == 100, "swept bullet collision prevents tunneling")
	check(game.effects[0].kind == "impact" and game.effects[0].pos.distance_to(Vector2(240,400)) < 30, "fast bullets emit impact at the enemy rather than beyond it")
	check(game.particles.any(func(p): return p.kind == "debris") and game.particles.any(func(p): return p.kind == "smoke"), "destroyed aircraft emit debris and smoke")
	game.spawn_enemy("bomber",Vector2(100,300))
	game.kill_enemy(0)
	check(game.drops.all(func(d): return d.kind != "power"),"bomber no longer drops weapon upgrades")
	game.shots.clear()
	game.fire_player()
	check(game.shots.size() == 1,"enemy kill does not add wing guns")
	game.enemy_shots.append({"pos":Vector2(200,200),"vel":Vector2.ZERO,"radius":5.0})
	game.spawn_enemy("bomber",Vector2(100,300))
	for key in [KEY_B,KEY_SPACE]:
		var press = InputEventKey.new()
		press.keycode = key
		press.pressed = true
		game._unhandled_input(press)
	check(game.enemy_shots.size() == 1 and game.enemies.size() == 1,"B and Space cannot trigger bombs")
	game.enemies.clear()
	game.enemy_shots.clear()
	game.toggle_pause()
	var time = game.elapsed
	var pos = game.player
	game._physics_process(1)
	check(game.elapsed == time and game.player == pos, "pause stops gameplay")
	game.toggle_pause()
	for i in range(3):
		game.invincible = 0
		game.hit_player()
	check(game.state == "ending_defeat" and game.hp == 0, "three armor hits end run")
	check(game.effects.any(func(e): return e.kind == "damage") and game.effects.any(func(e): return e.kind == "explosion"), "fatal player hit emits damage feedback and explosion")
	game._physics_process(2.0)
	check(game.effects.is_empty() and game.particles.is_empty() and game.hit_flash == 0, "effects finish after defeat instead of freezing behind results")
	game.reset_run()
	game.pointer_press(Vector2(200,500))
	game.pointer_move(Vector2(400,1000))
	check(game.target == (game.player+Vector2(200,500)).clamp(game.player_bounds.position,game.player_bounds.end), "relative drag clamps to playfield")
	game.reset_run()
	game.wave = game.campaign.wave_limit()
	game.campaign.waiting = 0
	game._physics_process(0.01)
	check(game.boss_spawned and game.enemies[0].kind == "boss", "boss appears at end of stage")
	game.enemies[0].hp = 1
	game.kill_enemy(0)
	check(game.state == "ending_victory", "boss defeat clears mission")
	game.reset_run()
	check(game.score == 0 and game.enemies.is_empty() and game.shots.is_empty() and game.drops.is_empty() and not game.boss_spawned, "restart clears previous run")
	game.hp = 2
	game.invincible = 1
	game.hit_player()
	check(game.hp == 2, "invulnerability prevents repeated hits")
	check(game.effects.is_empty() and game.hit_flash == 0, "blocked hits do not show damage feedback")
	game.reset_run()
	game.dragging = true
	game.pointer_id = 0
	var touch = InputEventScreenTouch.new()
	touch.index = 1
	touch.pressed = true
	touch.position = Vector2(100,100)
	game._unhandled_input(touch)
	check(game.dragging and game.pointer_id == 0, "second finger is ignored while first finger steers")
	game.reset_run()
	for frame in range(4501):
		game.invincible = 999
		game._physics_process(1.0 / 60.0)
	check(game.boss_spawned and game.wave == 5, "complete stage reaches boss after five fixed waves")
	check(game.enemies.size() < 30 and game.enemy_shots.size() < 200 and game.shots.size() < 100, "full-stage entity counts remain bounded")
	game.reset_run()
	for size in [Vector2(960,540),Vector2(1440,540),Vector2(960,720),Vector2(960,1440),Vector2(1920,540)]:
		game.spawn_enemy("bomber",Vector2(game.arena_size.x*0.75,200))
		game.shots.append({"pos":game.player,"vel":Vector2(0,-690),"damage":1})
		game.resize_arena(size)
		check(game.arena_size == size, "battlefield expands to new viewport")
		check(game.combat_rect.encloses(Rect2(game.player-Vector2(40,40),Vector2(80,80))), "entire player and shield stay within safe combat bounds")
		check(game.combat_rect == Rect2(Vector2.ZERO,size), "battlefield fills viewport without HUD bands")
		check(Rect2(Vector2.ZERO,size).encloses(game.start_rect), "menu fits viewport")
		check(game.battle_clip.size == game.combat_rect.size, "render and collision use the same field")
		for kind in ["player","fighter","bomber","boss","ship"]:
			for corner in [Vector2.ZERO,Vector2(size.x,0),Vector2(0,size.y),size]:
				check(game.combat_rect.encloses(game.health_indicator_rect(corner,kind)), "health bar and count stay visible at viewport edges after resize")
		game.invincible = 999
		game._physics_process(0.02)
	game.enemies.clear()
	game.shots.clear()
	game.spawn_enemy("fighter",Vector2(game.arena_size.x/2,200))
	game.enemies[0].hp = 1
	game.shots.append({"pos":Vector2(game.arena_size.x/2,400),"vel":Vector2(0,-10000),"damage":1})
	game.update_shots(0.04)
	check(game.enemies.is_empty(), "collision still works after repeated resizes")
	game.reset_run()
	game.explode(Vector2(400,200),82,true)
	check(game.effects.size() == 8 and game.effects[1].life > game.effects[1].duration, "boss explosion schedules staggered fireballs")
	game.toggle_pause()
	var effect_life = game.effects[0].life
	game._physics_process(0.2)
	check(game.effects[0].life == effect_life, "pause freezes combat effects")
	game.toggle_pause()
	for i in range(100):
		game.explode(Vector2(400,200),82,true)
	check(game.effects.size() <= 128 and game.particles.size() <= 500, "chain explosions remain bounded")
	game.reset_run()
	game.campaign.update(2)
	check(game.enemies.size() == 2,"opening wave has only two enemies")
	game.resize_arena(Vector2(960,540))
	game.spawn_boss()
	check(game.enemies.size() == 1 and game.enemy_shots.is_empty(),"boss starts without leftover enemies or bullets")
	var boss = game.enemies[0]
	boss.pos = Vector2(480,108)
	boss.fire = 0
	game.update_boss_attack(boss,0.01)
	check(boss.warning and game.enemy_shots.is_empty(),"boss warns before attacking")
	game.update_boss_attack(boss,1.2)
	check(game.enemy_shots.size() == 7 and boss.volley == 2,"first fan volley is seven bullets")
	game.update_boss_attack(boss,0.66)
	game.update_boss_attack(boss,0.66)
	check(game.enemy_shots.size() == 21 and boss.attack == 1,"exactly three fan volleys then easy attack")
	game.update_boss_attack(boss,10)
	check(not boss.warning and game.enemy_shots.size() == 21,"next pattern waits for all previous boss bullets")
	game.enemy_shots.clear()
	game.update_boss_attack(boss,0.01)
	var gap = boss.gap_x
	game.update_boss_attack(boss,1.2)
	check(boss.attack == 2 and game.enemy_shots.size() < 16,"easy row followed by homing")
	check(game.enemy_shots.all(func(b): return absf(b.pos.x-gap) >= 95),"row reserves a 190-unit safe corridor")
	game.enemy_shots.clear()
	game.update_boss_attack(boss,2)
	game.update_boss_attack(boss,1.2)
	check(game.enemy_shots.size() == 2 and boss.attack == 3,"homing fires only two missiles then easy row")
	game.invincible = 999
	game.update_shots(0.8)
	check(game.enemy_shots.all(func(b): return b.homing_time == 0),"missiles stop tracking after 0.75 seconds")
	var locked_velocity = game.enemy_shots[0].vel
	game.player.x = 60
	game.update_shots(0.1)
	check(game.enemy_shots[0].vel == locked_velocity,"missiles do not chase indefinitely")
	for viewport_size in [Vector2(960,540),Vector2(1920,540),Vector2(960,1440)]:
		game.resize_arena(viewport_size)
		boss.gap_x = viewport_size.x/2
		boss.attack = 1
		game.enemy_shots.clear()
		game.fire_boss_pattern(boss)
		check(game.enemy_shots.size() <= 16 and game.enemy_shots.all(func(b): return absf(b.pos.x-boss.gap_x) >= 95),"row density and escape corridor hold after resize")
	print("AIR_STRIKE_TESTS: ", "PASS" if failures == 0 else "FAIL", " (",failures," failures)")
	game.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
