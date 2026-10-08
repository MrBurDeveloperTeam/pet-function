extends Node2D
## Original arcade shooter. All gameplay runs in Godot, including touch input.
var arena_size = Vector2(960, 540)
var combat_rect = Rect2(0, 0, 960, 540)
var player_bounds = Rect2(60, 60, 840, 420)
var start_rect: Rect2
var hangar_rect: Rect2
var player_tier = 1
var stage_level = 1
var infinite_mode = false
var campaign = preload("res://campaign.gd").new()
var launch_token = ""
var run_id = 0
var lobby_launch = false
var paint: CanvasItem
var battle_clip: Control
var render_nodes: Array = []
const PLAYER_SPEED = 340.0
const ENEMY_FLIGHT_SPEED_SCALE = 0.5
const PLAYER_SHOT_INTERVAL = 0.28
var state = "menu"
var player = Vector2(480, 360)
var hp = 3.0
var progression = preload("res://progression.gd").new()
var skill_cards = preload("res://skill_cards.gd").new()
var allow_skill_choices = true
var bombs = 3
var power = 1
var score = 0
var best = 0
var elapsed = 0.0
var scroll = 0.0
var fire_timer = 0.0
var invincible = 0.0
var wave = 0
var next_wave = 1.0
var boss_spawned = false
var dragging = false
var pointer_id = -1
var drag_anchor = Vector2.ZERO
var drag_player = Vector2.ZERO
var target = player
var shots: Array = []
var enemies: Array = []
var enemy_shots: Array = []
var drops: Array = []
var effects: Array = []
var notice = ""
var notice_time = 0.0
var bomb_flash = 0.0
var impact_shake = 0.0
var impact_light = 0.0
var rng = RandomNumberGenerator.new()
var font: Font
var sfx: AudioStreamPlayer
var sprites: Dictionary = {}
var ocean_texture: Texture2D
var glow_texture: GradientTexture2D
var particles: Array = []
var visual_rng = RandomNumberGenerator.new()
var muzzle_flash = 0.0
var bank = 0.0
var hit_flash = 0.0

func _ready():
	progression.game = self
	campaign.game = self
	if OS.has_feature("web"):
		var purchased = str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('talents') || ''"))
		for id in purchased.split(",",false):
			if id.is_valid_int() and int(id) >= 1 and int(id) <= 15:
				progression.talents.append(int(id))
		player_tier = clampi(int(JavaScriptBridge.eval("Number(new URLSearchParams(location.search).get('tier') || 1)")),1,10)
		lobby_launch = bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('launch') === '1'"))
		stage_level = clampi(int(JavaScriptBridge.eval("Number(new URLSearchParams(location.search).get('stage') || 1)")),1,100)
		infinite_mode = bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('mode') === 'endless'"))
		launch_token = str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('token') || ''"))
	font = load("res://art/Quadrit.ttf")
	skill_cards.atlas = load("res://art/skill-atlas.png")
	skill_cards.drone_icon = load("res://art/skill-combat-drone.png")
	font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	visual_rng.seed = 1945
	var gradient = Gradient.new()
	gradient.colors = PackedColorArray([Color(1,1,1,0.8),Color(1,1,1,0.18),Color(1,1,1,0)])
	gradient.offsets = PackedFloat32Array([0.0,0.32,1.0])
	glow_texture = GradientTexture2D.new()
	glow_texture.width = 96
	glow_texture.height = 96
	glow_texture.gradient = gradient
	glow_texture.fill = GradientTexture2D.FILL_RADIAL
	glow_texture.fill_from = Vector2(0.5,0.5)
	glow_texture.fill_to = Vector2(1,0.5)
	if ResourceLoader.exists("res://art/mechanical-atlas-pixel.png"):
		var atlas: Texture2D = load("res://art/mechanical-atlas-pixel.png")
		var pixels = atlas.get_image()
		var kinds = ["player","fighter","bomber","ship"]
		var regions = [Rect2(0,0,0.515,0.45),Rect2(0.53,0,0.47,0.44),Rect2(0,0.45,0.60,0.55),Rect2(0.62,0.42,0.38,0.58)]
		for i in range(4):
			var dimensions = Vector2(pixels.get_width(),pixels.get_height())
			var region = Rect2i(regions[i].position*dimensions,regions[i].size*dimensions)
			var used = pixels.get_region(region).get_used_rect()
			var sprite_pixels = pixels.get_region(Rect2i(region.position+used.position,used.size))
			# Aircraft pixels are a further ~15% larger; ships retain the previous sampling.
			var sprite_width = [55,46,81,52][i]
			sprite_pixels.resize(sprite_width,maxi(1,roundi(sprite_width*used.size.y/float(used.size.x))),Image.INTERPOLATE_NEAREST)
			sprites[kinds[i]] = ImageTexture.create_from_image(sprite_pixels)
	if ResourceLoader.exists("res://art/coral-coast-pixel.png"):
		var coast: Texture2D = load("res://art/coral-coast-pixel.png")
		var coast_pixels = coast.get_image()
		coast_pixels.resize(768,512,Image.INTERPOLATE_NEAREST)
		ocean_texture = ImageTexture.create_from_image(coast_pixels)
	if ResourceLoader.exists("res://art/gulu-player-aircraft-levels-1-10-canopy.png"):
		var pilots: Texture2D = load("res://art/gulu-player-aircraft-levels-1-10-canopy.png")
		var frames = [Rect2i(8,110,288,365),Rect2i(300,100,268,378),Rect2i(570,90,306,388),Rect2i(877,85,306,395),Rect2i(1185,45,343,438),Rect2i(6,530,291,430),Rect2i(301,524,280,435),Rect2i(566,525,316,435),Rect2i(855,503,320,482),Rect2i(1151,480,385,538)]
		var pilot_pixels = pilots.get_image().get_region(frames[player_tier-1])
		pilot_pixels.resize(64,roundi(64*pilot_pixels.get_height()/float(pilot_pixels.get_width())),Image.INTERPOLATE_NEAREST)
		sprites["player"] = ImageTexture.create_from_image(pilot_pixels)
	var layer_script = preload("res://render_layer.gd")
	battle_clip = Control.new()
	battle_clip.clip_contents = true
	battle_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(battle_clip)
	for layer in ["ocean", "battle", "hud"]:
		var node = Node2D.new()
		node.set_script(layer_script)
		node.game = self
		node.layer = layer
		node.z_index = -1 if layer == "ocean" else (1 if layer == "hud" else 0)
		if layer == "battle":
			battle_clip.add_child(node)
		else:
			add_child(node)
		render_nodes.append(node)
	resize_arena(get_viewport_rect().size)
	get_viewport().size_changed.connect(func(): resize_arena(get_viewport_rect().size))
	rng.randomize()
	var save = ConfigFile.new()
	if save.load("user://sky-patrol.cfg") == OK:
		best = int(save.get_value("record", "best", 0))
	sfx = AudioStreamPlayer.new()
	add_child(sfx)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.airStrikeReady = true; window.parent.postMessage({source:'air-strike',type:'READY'}, window.location.origin)")
	redraw_layers()
	if lobby_launch:
		reset_run()


func redraw_layers():
	for node in render_nodes:
		if node.layer == "battle":
			node.position = Vector2(sin(impact_shake*91),cos(impact_shake*113))*impact_shake if state == "playing" else Vector2.ZERO
		node.queue_redraw()

func remap_point(point: Vector2, old: Rect2, next: Rect2) -> Vector2:
	return next.position + (point - old.position) / old.size * next.size

func resize_arena(next_size: Vector2):
	var previous = combat_rect
	arena_size = next_size.max(Vector2(960,540))
	combat_rect = Rect2(Vector2.ZERO,arena_size)
	player_bounds = Rect2(combat_rect.position+Vector2(60,60),combat_rect.size-Vector2(120,120))
	start_rect = Rect2(arena_size.x/2.0-150,arena_size.y/2.0+76,300,58)
	hangar_rect = Rect2(arena_size.x/2.0-150,arena_size.y/2.0+146,300,30)
	player = remap_point(player,previous,combat_rect).clamp(player_bounds.position,player_bounds.end)
	target = player
	dragging = false
	pointer_id = -1
	for entities in [shots,enemies,enemy_shots,drops,effects,particles]:
		for entity in entities:
			entity.pos = remap_point(entity.pos,previous,combat_rect)
			if entity.has("origin_x"):
				entity.origin_x *= combat_rect.size.x / previous.size.x
			if entity.has("gap_x"):
				entity.gap_x *= combat_rect.size.x / previous.size.x
	battle_clip.position = combat_rect.position
	battle_clip.size = combat_rect.size
	for node in render_nodes:
		if node.layer == "battle":
			node.position = -combat_rect.position
	redraw_layers()

func reset_run():
	progression.reset()
	campaign.reset()
	run_id += 1
	state = "playing"
	player = Vector2(arena_size.x / 2.0, player_bounds.end.y - 28.0)
	target = player
	hp = 3
	bombs = 3
	power = 1
	score = 0
	elapsed = 0.0
	fire_timer = 0.0
	invincible = 2.0
	wave = 0
	next_wave = 1.0
	boss_spawned = false
	dragging = false
	pointer_id = -1
	shots.clear()
	enemies.clear()
	enemy_shots.clear()
	drops.clear()
	effects.clear()
	particles.clear()
	muzzle_flash = 0
	hit_flash = 0
	bank = 0
	notice = "ENDLESS / THREAT 1" if infinite_mode else "MISSION %03d / %s" % [stage_level,campaign.CHAPTERS[campaign.chapter()]]
	notice_time = 3.0
	bomb_flash = 0.0
	impact_shake = 0.0
	impact_light = 0.0
	progression.offer(true)

func toggle_pause():
	if state == "playing":
		state = "paused"
		dragging = false
		pointer_id = -1
	elif state == "paused":
		state = "playing"

func _notification(what):
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and state == "playing":
		toggle_pause()

func _unhandled_input(event):
	if state == "skill_choice" and event is InputEventKey and event.pressed:
		if event.keycode in [KEY_1,KEY_2,KEY_3,KEY_4]:
			progression.choose(event.keycode-KEY_1)
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ENTER or event.keycode == KEY_SPACE:
			if state in ["defeat","victory"] and lobby_launch:
				return_to_hangar()
			elif state == "menu" or state == "defeat" or state == "victory":
				reset_run()
			elif event.keycode == KEY_SPACE:
				use_bomb()
		elif event.keycode == KEY_P or event.keycode == KEY_ESCAPE:
			toggle_pause()
		elif event.keycode == KEY_B:
			use_bomb()
	if event is InputEventScreenTouch:
		if event.pressed and state == "playing" and pointer_id != -1 and event.index != pointer_id:
			use_bomb()
		elif event.pressed and pointer_id == -1:
			pointer_id = event.index
			pointer_press(event.position)
		elif not event.pressed and event.index == pointer_id:
			dragging = false
			pointer_id = -1
	elif event is InputEventScreenDrag and event.index == pointer_id:
		pointer_move(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			pointer_press(event.position)
		else:
			dragging = false
	elif event is InputEventMouseMotion and dragging:
		pointer_move(event.position)

func pointer_press(pos: Vector2):
	if state == "skill_choice":
		for i in range(progression.choices.size()):
			if skill_card_rect(i).has_point(pos):
				progression.choose(i)
		return
	if lobby_launch and state == "paused" and hangar_rect.has_point(pos):
		return_to_hangar()
		return
	if state in ["menu", "victory", "defeat"]:
		if start_rect.has_point(pos):
			if state != "menu" and lobby_launch:
				return_to_hangar()
			else:
				reset_run()
		return
	if state == "paused" and start_rect.has_point(pos):
		toggle_pause()
		return
	if state != "playing":
		return
	if not combat_rect.has_point(pos):
		return
	dragging = true
	drag_anchor = pos
	drag_player = player
	target = player

func pointer_move(pos: Vector2):
	if dragging and state == "playing":
		target = drag_player + pos - drag_anchor
		target = target.clamp(player_bounds.position, player_bounds.end)

func _physics_process(delta):
	if state not in ["paused","skill_choice"]:
		scroll += delta * 44.0
		update_visual_effects(delta)
	if state != "playing":
		redraw_layers()
		return
	elapsed += delta
	invincible = maxf(0, invincible - delta)
	notice_time = maxf(0, notice_time - delta)
	var axis = Vector2(float(Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_DOWN) or Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_W)))
	if axis.length_squared() > 0:
		player += axis.normalized() * PLAYER_SPEED * delta
		target = player
	elif dragging:
		player = player.move_toward(target, 1000.0 * delta)
	player = player.clamp(player_bounds.position, player_bounds.end)
	bank = lerpf(bank,clampf(axis.x*0.13+(target.x-player.x)*0.002,-0.16,0.16),minf(delta*10,1))
	fire_timer -= delta
	if fire_timer <= 0:
		fire_player()
		fire_timer += PLAYER_SHOT_INTERVAL/(1.1 if progression.has(2) else 1.0)
	campaign.update(delta)
	if state != "playing":
		redraw_layers()
		return
	update_enemies(delta)
	update_shots(delta)
	update_drops(delta)
	if state == "playing":
		progression.update(delta)
	if shots.size() > 300:
		shots = shots.slice(shots.size()-300)
	redraw_layers()

func update_visual_effects(delta: float):
	impact_shake = move_toward(impact_shake,0.0,delta*38.0)
	impact_light = maxf(0.0,impact_light-delta)
	bomb_flash = maxf(0,bomb_flash-delta)
	muzzle_flash = maxf(0,muzzle_flash-delta)
	hit_flash = maxf(0,hit_flash-delta)
	for i in range(effects.size() - 1, -1, -1):
		effects[i].life -= delta
		if effects[i].life <= 0:
			effects.remove_at(i)
	for i in range(particles.size()-1,-1,-1):
		var particle = particles[i]
		particle.life -= delta
		particle.pos += particle.vel * delta
		particle.vel *= exp(-delta * 1.7)
		if particle.kind == "smoke":
			particle.vel.y -= delta*18.0
		if particle.life <= 0:
			particles.remove_at(i)

func laser_origin() -> Vector2:
	return player+Vector2(0,-aircraft_dimensions("player").y*0.48).rotated(bank)

func fire_player():
	muzzle_flash = 0.0 if progression.skill("laser") or progression.skill("ring_laser") else 0.065
	var count = (3 if progression.has(5) else (2 if progression.has(4) else 1))+(1 if progression.skill("bullet") else 0)
	var damage: float = progression.current_damage()
	if progression.skill("ring_laser"):
		count = 12
	for i in range(count):
		var offset = (i-(count-1)/2.0)*18
		var angle = (i-(count-1)/2.0)*0.13 if count >= 3 else 0.0
		if progression.skill("ring_laser"):
			angle = i*TAU/12
		shots.append(progression.projectile(player+Vector2(offset if count < 3 else 0,-30),Vector2(0,-690).rotated(angle),damage))
	if power >= 2:
		for side in [-1.0, 1.0]:
			shots.append(progression.projectile(player+Vector2(side*22,-10),Vector2(side*70,-660),damage))
	if power >= 3:
		shots.append(progression.projectile(player+Vector2(0,-38),Vector2(0,-730),damage*2))

func spawn_enemy(kind: String, pos: Vector2, phase: float = 0.0, role: String = "", elite: bool = false):
	var health = 3 if kind == "fighter" else (12 if kind == "bomber" else 18)
	var radius = 20.0 if kind == "fighter" else (34.0 if kind == "bomber" else 28.0)
	enemies.append({"kind": kind, "pos": pos, "origin_x": pos.x, "phase": phase, "age": 0.0, "hp": health, "max_hp": health, "radius": radius, "fire": 1.6 + phase * 0.1, "flash": 0.0})
	campaign.decorate(enemies.back(),role if role != "" else kind,elite)

func spawn_boss():
	boss_spawned = true
	# Give the boss phase a clean field; lingering ships must not fill its safe lanes.
	enemies.clear()
	enemy_shots.clear()
	notice = "WARNING  /  HEAVY BOMBER"
	notice_time = 3.0
	enemies.append({"kind": "boss", "pos": Vector2(arena_size.x * 0.5, combat_rect.position.y - 120), "origin_x": arena_size.x * 0.5, "phase": 0.0, "age": 0.0, "hp": 420, "max_hp": 420, "radius": 82.0, "fire": 2.0, "flash": 0.0,"attack":0,"volley":0,"warning":false,"telegraph":0.0,"gap_x":arena_size.x/2})

func update_enemies(delta: float):
	for i in range(enemies.size() - 1, -1, -1):
		if i >= enemies.size(): continue
		var e = enemies[i]
		campaign.update_enemy(e,delta)
		e.age += delta
		e.flash = maxf(0.0, e.flash - delta)
		if e.kind == "boss":
			e.pos.y = minf(combat_rect.position.y + 108.0, e.pos.y + delta * 70.0 * ENEMY_FLIGHT_SPEED_SCALE)
			e.pos.x = arena_size.x * 0.5 + sin(e.age * ENEMY_FLIGHT_SPEED_SCALE * (0.85 if e.get("mutations",[]).has("berserk") else 0.65)) * minf(arena_size.x * 0.25, 240.0)
		else:
			var speed = 120.0 if e.kind == "fighter" else (72.0 if e.kind == "bomber" else 44.0)
			e.pos.y += speed * e.get("speed_scale",1.0) * delta * ENEMY_FLIGHT_SPEED_SCALE
			if e.kind == "fighter":
				e.pos.x = clampf(e.origin_x + sin(e.age * 2.0 * ENEMY_FLIGHT_SPEED_SCALE + e.phase) * 48.0, e.radius + 16.0, arena_size.x - e.radius - 16.0)
		if e.kind == "boss":
			if e.pos.y >= combat_rect.position.y+108:
				update_boss_attack(e,delta)
		else:
			e.fire -= delta
		if e.kind != "boss" and e.fire <= 0 and e.pos.y > combat_rect.position.y + 20 and e.pos.y < player_bounds.end.y - 55:
			fire_enemy(e)
			e.fire = (2.4 if e.kind == "fighter" else 1.7)/(1.0+progression.routes(true).size()*0.02 if infinite_mode else 1.0)
			if e.get("affixes",[]).has("berserk"): e.fire *= 0.75
		if e.pos.y > combat_rect.end.y + 120:
			enemies.remove_at(i)
		elif e.pos.distance_to(player) < e.radius + 9.0:
			hit_player(false,e.get("damage",1.0))
			if e.get("role","") == "suicide": kill_enemy(i)

func fire_enemy(e: Dictionary):
	if campaign.fire(e): return
	var aim: Vector2 = (player - e.pos).normalized()
	if e.kind == "boss":
		fire_boss_pattern(e)
	elif e.kind == "bomber" or e.kind == "ship":
		for offset in [-0.23, 0.0, 0.23]:
			enemy_shots.append({"pos": e.pos + Vector2(0, 20), "vel": aim.rotated(offset) * 160.0, "radius": 5.0})
	else:
		enemy_shots.append({"pos": e.pos + Vector2(0, 20), "vel": aim * 185.0, "radius": 4.0})

func update_boss_attack(e: Dictionary, delta: float):
	e.fire = maxf(0,e.fire-delta)
	if e.fire > 0:
		return
	if e.volley > 0:
		fire_boss_pattern(e)
		e.volley -= 1
		e.fire = 0.65 if e.volley > 0 else 1.8
		if e.volley == 0:
			e.attack = (e.attack+1)%4
		return
	# Never begin another pattern before the previous pattern has left the field.
	if not campaign.hazards.is_empty(): return
	if enemy_shots.any(func(b): return b.get("boss",false)):
		return
	if not e.warning:
		e.warning = true
		e.telegraph = 1.1
		e.gap_x = clampf(player.x,150,arena_size.x-150)
		return
	e.telegraph -= delta
	if e.telegraph > 0:
		return
	e.warning = false
	fire_boss_pattern(e)
	if e.attack == 0:
		e.volley = 2
		e.fire = 0.65
	else:
		e.attack = (e.attack+1)%4
		e.fire = 1.8

func fire_boss_pattern(e: Dictionary):
	var origin: Vector2 = e.pos+Vector2(0,80)
	var first = enemy_shots.size()
	if e.attack == 0:
		for i in range(7):
			var angle = PI*0.28+float(i)/6*PI*0.44
			if e.get("stage_phase",1) >= 3 or stage_level == 97:
				angle = PI*0.17+float(i)/6*PI*0.66+sin(e.age)*0.08
			enemy_shots.append({"pos":origin,"vel":Vector2.from_angle(angle)*185,"radius":5.0,"boss":true})
	elif e.attack == 2:
		for side in [-1,1]:
			var launch = origin+Vector2(side*55,0)
			enemy_shots.append({"pos":launch,"vel":(player-launch).normalized()*150,"radius":6.0,"boss":true,"homing_time":0.75})
	else:
		var count = clampi(int(arena_size.x/90),8,16)
		for i in range(count):
			var x = lerpf(45,arena_size.x-45,float(i)/(count-1))
			if absf(x-e.gap_x) < 95:
				continue
			enemy_shots.append({"pos":Vector2(x,origin.y),"vel":Vector2(0,180),"radius":5.0,"boss":true})
	for i in range(first,enemy_shots.size()):
		enemy_shots[i].vel *= e.get("bullet_scale",1.0)
		enemy_shots[i].damage = e.get("damage",1.0)
	# Two-shot mutation narrows the fan instead of filling the safe lane.
	if e.get("mutations",[]).has("double_projectile") and e.attack == 2:
		enemy_shots.append({"pos":origin,"vel":Vector2(0,155),"radius":5.0,"boss":true,"damage":e.get("damage",1.0)})

func segment_hits(a: Vector2, b: Vector2, center: Vector2, radius: float) -> bool:
	return Geometry2D.get_closest_point_to_segment(center, a, b).distance_squared_to(center) <= radius * radius

func update_shots(delta: float):
	for i in range(shots.size() - 1, -1, -1):
		var b = shots[i]
		var prev: Vector2 = b.pos
		b.life = b.get("life",4.0)-delta
		if b.get("missile",false):
			var target_enemy = progression.nearest(b.pos,b.get("hits",[]))
			if not target_enemy.is_empty():
				var turn = clampf(wrapf((target_enemy.pos-b.pos).angle()-b.vel.angle(),-PI,PI),-4.2*delta,4.2*delta)
				b.vel = b.vel.rotated(turn)
		var laser: bool = b.get("laser",false)
		var endpoint: Vector2
		if laser:
			if b.get("bounce_count",0) == 0:
				b.pos = laser_origin()
				prev = b.pos
			if b.get("charge",0.0) > 0:
				b.charge = maxf(0,b.charge-delta)
				if b.charge > 0:
					continue
			endpoint = b.pos+b.vel.normalized()*arena_size.length()
			b.beam_end = endpoint
		else:
			b.pos += b.vel * delta
			endpoint = b.pos
		var consumed = false
		var candidates = enemies.filter(func(enemy): return enemy.hp > 0 and segment_hits(prev,endpoint,enemy.pos,enemy.radius+(5.0 if laser else 0.0)))
		candidates.sort_custom(func(a,c): return prev.distance_squared_to(a.pos) < prev.distance_squared_to(c.pos))
		for e in candidates:
			if not enemies.has(e) or e.hp <= 0:
				continue
			if b.get("hits",[]).has(e):
				continue
			if segment_hits(prev, endpoint, e.pos, e.radius+(5.0 if laser else 0.0)):
				var actual_damage = campaign.damage_enemy(e,b.damage,b.get("crit",false))
				if b.has("hits"):
					b.hits.append(e)
				if actual_damage > 0: progression.on_hit(b,e,actual_damage)
				e.flash = 0.13
				var impact: Vector2 = e.pos+(prev-e.pos).normalized()*e.radius*0.8
				add_effect(impact,"impact",0.32,52.0)
				burst(impact,22,"spark")
				impact_shake = maxf(impact_shake,2.5)
				if e.hp <= 0:
					kill_enemy(enemies.find(e))
				if e.kind != "boss" and b.get("bounces",0) > 0 and not progression.skill("ring_laser"):
					var other = progression.nearest(e.pos,b.get("hits",[]))
					if not other.is_empty():
						b.bounces -= 1
						b.bounce_count += 1
						if b.bounce_count == 3:
							b.damage *= 0.5
						b.pos = impact
						b.vel = (other.pos-impact).normalized()*690
						break
				if e.kind != "boss" and b.get("pierce",0) > 0:
					b.pierce -= 1
					continue
				if laser:
					continue
				consumed = true
				break
		if consumed or b.life <= 0 or not combat_rect.grow(40).has_point(b.pos):
			shots.remove_at(i)
	for i in range(enemies.size()-1,-1,-1):
		if i >= enemies.size(): continue
		if enemies[i].hp <= 0:
			kill_enemy(i)
	for i in range(enemy_shots.size() - 1, -1, -1):
		var b = enemy_shots[i]
		var prev: Vector2 = b.pos
		if b.get("homing_time",0.0) > 0:
			var tracking_delta = minf(delta,b.homing_time)
			var direction: Vector2 = player-b.pos
			var turn = clampf(wrapf(direction.angle()-b.vel.angle(),-PI,PI),-0.7*tracking_delta,0.7*tracking_delta)
			b.vel = b.vel.rotated(turn)
			b.homing_time = maxf(0,b.homing_time-delta)
		b.pos += b.vel * delta
		if segment_hits(prev, b.pos, player, 7.0 + b.radius):
			hit_player(true,b.get("damage",1.0))
			enemy_shots.remove_at(i)
		elif not combat_rect.grow(16).has_point(b.pos):
			enemy_shots.remove_at(i)

func kill_enemy(index: int):
	var e = enemies[index]
	enemies.remove_at(index)
	progression.killed()
	score += 100 if e.kind == "fighter" else (500 if e.kind != "boss" else 5000)
	explode(e.pos,e.radius,e.kind == "boss")
	play_sound(80.0, 0.18)
	if e.kind == "boss":
		campaign.boss_defeated()
	else:
		drops.append({"pos":e.pos+Vector2(-18,0),"kind":"energy","age":0.0,"value":3 if e.kind == "fighter" else 6})
		drops.append({"pos": e.pos, "kind": "coin", "age": 0.0})
		if e.kind == "bomber":
			drops.append({"pos": e.pos + Vector2(22, 0), "kind": "power", "age": 0.0})
		elif e.kind == "ship" and rng.randf() < 0.4:
			drops.append({"pos": e.pos + Vector2(22, 0), "kind": "repair", "age": 0.0})

func hit_player(allow_evade: bool = true, damage: float = 1.0):
	if state != "playing":
		return
	if progression.shield_layers > 0:
		progression.prevent_hit()
		return
	if invincible > 0 or progression.prevent_hit(allow_evade):
		return
	hp = maxf(0,hp-damage*(0.92 if progression.skill("defense") else 1.0))
	power = maxi(1, power - 1)
	invincible = 2.0
	hit_flash = 0.45
	add_effect(player,"damage",0.65,115.0)
	impact_shake = maxf(impact_shake,12.0)
	burst(player,42,"energy")
	burst(player,30,"spark")
	burst(player,20,"energy")
	play_sound(110.0, 0.15)
	if hp <= 0:
		if progression.survive():
			return
		explode(player,40.0)
		finish_run("defeat")

func use_bomb():
	if state != "playing" or bombs <= 0:
		return
	bombs -= 1
	enemy_shots.clear()
	invincible = maxf(invincible, 1.2)
	bomb_flash = 0.6
	impact_shake = maxf(impact_shake,18.0)
	add_effect(player,"shockwave",1.0,arena_size.x*0.75)
	add_effect(player,"bomb",0.9,arena_size.x*0.9)
	play_sound(55.0, 0.3)
	for i in range(enemies.size() - 1, -1, -1):
		if i >= enemies.size(): continue
		campaign.damage_enemy(enemies[i],65)
		if enemies[i].hp <= 0:
			kill_enemy(i)

func update_drops(delta: float):
	for i in range(drops.size() - 1, -1, -1):
		var d = drops[i]
		d.age += delta
		d.pos.y += delta * (45.0 if d.kind == "energy" else 85.0)
		if d.pos.distance_to(player) < 85:
			d.pos = d.pos.move_toward(player, delta * 260.0)
		if d.pos.distance_to(player) < 24:
			if d.kind == "energy":
				progression.collect_energy(int(d.get("value",3)))
			elif d.kind == "coin":
				score += 25
			elif d.kind == "power":
				power = mini(3, power + 1)
				score += 50
				notice = "WEAPON UPGRADED"
				notice_time = 1.5
			elif d.kind == "repair":
				hp = minf(progression.max_health(),hp+1)
			drops.remove_at(i)
		elif d.pos.y > combat_rect.end.y - 12:
			drops.remove_at(i)

func finish_run(result: String):
	if state != "playing":
		return
	state = result
	dragging = false
	pointer_id = -1
	best = maxi(best, score)
	var save = ConfigFile.new()
	save.set_value("record", "best", best)
	save.save("user://sky-patrol.cfg")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage(%s, window.location.origin)" % JSON.stringify({"source":"air-strike","type":"RUN_FINISHED","score":mini(score,1000000),"outcome":result,"runId":run_id,"wave":campaign.infinite_wave,"token":launch_token}))

func send_checkpoint():
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage(%s, window.location.origin)" % JSON.stringify({"source":"air-strike","type":"ENDLESS_CHECKPOINT","wave":campaign.infinite_wave,"token":launch_token}))

func return_to_hangar():
	state = "paused" if OS.has_feature("web") else "menu"
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage({source: 'air-strike', type: 'HANGAR'}, window.location.origin)")
	redraw_layers()

func play_sound(frequency: float, duration: float):
	var data = PackedByteArray()
	var sample_count = int(duration * 11025)
	data.resize(sample_count)
	for i in range(sample_count):
		var value = sin(TAU * frequency * float(i) / 11025.0) * (1.0 - float(i) / sample_count) * 90.0
		data[i] = int(value) & 255
	var stream = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_8_BITS
	stream.mix_rate = 11025
	stream.data = data
	sfx.stream = stream
	sfx.play()

func text_at(message: String, pos: Vector2, size: int = 18, color: Color = Color("e4f3f5")):
	paint.draw_string(font, pos, message, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func centered(message: String, y: float, size: int = 20, color: Color = Color("e4f3f5")):
	var width = font.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	text_at(message, Vector2((arena_size.x - width) / 2.0, y), size, color)

func poly(points: Array, color: Color):
	paint.draw_colored_polygon(PackedVector2Array(points), color)

func burst(pos: Vector2, count: int, kind: String):
	for i in range(count):
		if particles.size() >= 500:
			break
		var direction = Vector2.from_angle(visual_rng.randf()*TAU)
		var life = visual_rng.randf_range(0.22,0.5) if kind == "spark" else visual_rng.randf_range(0.55,1.15)
		var speed = visual_rng.randf_range(55,255)
		if kind == "smoke":
			life = visual_rng.randf_range(0.95,1.55)
			speed *= 0.3
		particles.append({"pos":pos,"vel":direction*speed,"life":life,"duration":life,"kind":kind,"size":visual_rng.randf_range(2.0,6.0)})

func add_effect(pos: Vector2, kind: String, duration: float, size: float, delay: float = 0.0):
	if effects.size() >= 128:
		effects.pop_front()
	effects.append({"pos":pos,"kind":kind,"life":duration+delay,"duration":duration,"size":size})

func explode(pos: Vector2, radius: float, large: bool = false):
	impact_shake = maxf(impact_shake,16.0 if large else 6.5)
	impact_light = maxf(impact_light,0.18 if large else 0.06)
	add_effect(pos,"explosion",1.25,radius*3.6)
	add_effect(pos,"shockwave",0.8,radius*(7.0 if large else 4.8))
	burst(pos,110 if large else 60,"fire")
	burst(pos,55 if large else 28,"debris")
	burst(pos,32 if large else 16,"smoke")
	for i in range(12 if large else 4):
		var offset = Vector2.from_angle(visual_rng.randf()*TAU)*radius*visual_rng.randf_range(0.35,1.45)
		add_effect(pos+offset,"explosion",0.65,radius*1.4,0.05+i*0.075)

func glow(pos: Vector2, radius: float, color: Color, strength: float = 1.0, step: float = 1.0):
	# Discrete square clusters rather than a smooth radial bloom.
	radius = minf(radius,64)
	pixel_disc(pos,radius,Color(color,strength*0.04),step)
	pixel_disc(pos,radius*0.55,Color(color,strength*0.08),step)
	pixel_disc(pos,radius*0.22,Color(color,strength*0.18),step)

func pixel_disc(pos: Vector2, radius: float, color: Color, step: float = 1.0):
	var center = pos.snapped(Vector2.ONE*step)
	var r = maxi(1,roundi(radius/step))
	for y in range(-r,r+1):
		var half_width = floorf(sqrt(maxf(0,r*r-y*y)))
		paint.draw_rect(Rect2(center+Vector2(-half_width,y)*step,Vector2(half_width*2+1,1)*step),color)

func pixel_ring(pos: Vector2, radius: float, color: Color, start: float = 0.0, span: float = TAU, step: float = 1.0):
	var count = maxi(12,roundi(radius*span/step))
	for i in range(count+1):
		var p = (pos+Vector2.from_angle(start+span*i/count)*radius).snapped(Vector2.ONE*step)
		paint.draw_rect(Rect2(p,Vector2.ONE*step),color)

func aircraft_dimensions(kind: String) -> Vector2:
	if kind == "ship":
		return Vector2(52,100)
	var width = 76.0 if kind == "player" else (64.0 if kind == "fighter" else (112.0 if kind == "bomber" else 256.0))
	var key = "bomber" if kind == "boss" else kind
	if sprites.has(key):
		var texture: Texture2D = sprites[key]
		return Vector2(width,width*texture.get_height()/float(texture.get_width()))
	return Vector2(width,64.0*(1.7 if kind == "bomber" else (3.9 if kind == "boss" else 1.0)))

func health_indicator_rect(pos: Vector2, kind: String) -> Rect2:
	var width = 120.0 if kind == "boss" else (72.0 if kind == "bomber" else 54.0)
	var nose_offset = aircraft_dimensions(kind).y/2.0
	var y = pos.y-nose_offset-30.0 if kind == "player" else pos.y+nose_offset+8.0
	# Reserve room for the count as well as the bar when approaching a screen edge.
	return Rect2(Vector2(clampf(pos.x-width/2.0,4.0,arena_size.x-width-4.0),clampf(y,4.0,arena_size.y-26.0)).round(),Vector2(width,22))

func draw_health_indicator(pos: Vector2, kind: String, current: float, maximum: float):
	var rect = health_indicator_rect(pos,kind)
	var bar = Rect2(rect.position,Vector2(rect.size.x,8))
	var color = Color("78e0bc") if kind == "player" else Color("ff8965")
	var ratio = clampf(current/maxf(1,maximum),0.0,1.0)
	paint.draw_rect(bar.grow(1),Color("0b202a"))
	paint.draw_rect(bar,Color("a8c4c9"),false,1)
	paint.draw_rect(bar.grow(-1),Color("263943"))
	if current > 0:
		paint.draw_rect(Rect2(bar.position+Vector2.ONE,Vector2(roundf((bar.size.x-2)*ratio),6)),color)
	var label = "%.1f/%.1f" % [maxf(0,current),maximum] if kind == "player" else "%d/%d" % [ceili(maxf(0,current)),ceili(maximum)]
	var text_pos = rect.position+Vector2((rect.size.x-font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,11).x)/2.0,20)
	paint.draw_string_outline(font,text_pos,label,HORIZONTAL_ALIGNMENT_LEFT,-1,11,3,Color("0b202a"))
	text_at(label,text_pos,11,Color("f1f4df"))

func draw_aircraft_sprite(pos: Vector2, kind: String, flash: bool):
	var is_player = kind == "player"
	var key = "bomber" if kind == "boss" else kind
	var texture: Texture2D = sprites[key]
	var dimensions = aircraft_dimensions(kind)
	var height = dimensions.y
	pos = pos.snapped(Vector2.ONE*1.38)
	var rotation = snappedf(bank,0.04) if is_player else PI
	paint.draw_set_transform(pos+Vector2(7,12),rotation)
	paint.draw_texture_rect(texture,Rect2(-dimensions/2,dimensions),false,Color(0.02,0.025,0.03,0.52))
	paint.draw_set_transform(pos,rotation)
	if is_player:
		for x in [-15.0,15.0]:
			glow(Vector2(x,height*0.39),14,Color("efab53"),0.65)
			var length = 15+sin(elapsed*53+x)*4
			poly([Vector2(x-3,height*0.34),Vector2(x,height*0.34+length),Vector2(x+3,height*0.34)],Color("eea04e"))
			poly([Vector2(x-1.5,height*0.34),Vector2(x,height*0.34+length*0.65),Vector2(x+1.5,height*0.34)],Color("fff2c8"))
	var tint = Color(1.8,0.65,0.45) if is_player and flash else (Color(1.9,1.65,1.25) if flash else Color.WHITE)
	if is_player and invincible > 0 and not flash:
		tint.a = 0.5 if int(invincible*12)%2 == 0 else 1.0
	paint.draw_texture_rect(texture,Rect2(-dimensions/2,dimensions),false,tint)
	if is_player:
		for x in [-14.0,14.0]:
			paint.draw_arc(Vector2(x,-height*0.26),10,0,TAU,18,Color(0.88,0.79,0.55,0.30),1.5,false)
			var a = elapsed*78.0
			paint.draw_line(Vector2(x,-height*0.26)+Vector2.from_angle(a)*10,Vector2(x,-height*0.26)-Vector2.from_angle(a)*10,Color(1,0.94,0.75,0.45),2,false)
		if muzzle_flash > 0:
			for x in [-9.0,9.0]:
				glow(Vector2(x,-31),27,Color("ffdc8a"),muzzle_flash/0.065*1.6)
				poly([Vector2(x-6,-30),Vector2(x-3,-42),Vector2(x,-62),Vector2(x+3,-42),Vector2(x+6,-30)],Color("fff4c6"))
				paint.draw_line(Vector2(x-14,-34),Vector2(x+14,-34),Color("ffcb64"),2.76,false)
	paint.draw_set_transform(Vector2.ZERO)

func draw_shield():
	var radius = 44.0
	glow(player,radius+14,Color("46bacb"),0.22)
	pixel_disc(player,radius,Color(0.27,0.78,0.86,0.04))
	for row in range(-3,4):
		for col in range(-3,4):
			var pos = Vector2(col*12.0+(6 if row%2 else 0),row*10.0)
			if pos.length() > 34:
				continue
			var points = PackedVector2Array()
			for i in range(7):
				points.append(player+pos+Vector2.from_angle(i*TAU/6)*6)
			paint.draw_rect(Rect2((player+pos).snapped(Vector2.ONE),Vector2(2,2)),Color(0.46,0.89,0.96,0.25))
	pixel_ring(player,radius,Color(0.4,0.85,0.96,0.7))
	paint.draw_arc(player,radius+4,elapsed*1.8,elapsed*1.8+PI*1.35,40,Color(0.4,0.95,1,0.75),3.0,false)
	for i in range(3):
		var angle = elapsed*0.8+i*TAU/3
		pixel_ring(player,radius+2,Color("dbffff"),angle,0.55)
	if hit_flash > 0:
		pixel_ring(player,radius+6,Color(0.98,0.86,0.55,hit_flash/0.45))

func metal_plate(rect: Rect2, warm: bool = false):
	var edge = Color("ac8150") if warm else Color("74664f")
	paint.draw_style_box(make_box(Color("090f15"),Color("101820")),Rect2(rect.position+Vector2(0,4),rect.size))
	paint.draw_style_box(make_box(Color("263b42"),edge),rect)
	var shades = [Color("354a4c"),Color("2b4044"),Color("24383e"),Color("19282f")]
	for i in range(4):
		paint.draw_rect(Rect2(rect.position+Vector2(2,2+i*(rect.size.y-4)/4),Vector2(rect.size.x-4,(rect.size.y-4)/4)),shades[i])
	paint.draw_line(rect.position+Vector2(3,3),rect.position+Vector2(rect.size.x-3,3),Color("cfb178"),1)
	paint.draw_line(rect.position+Vector2(3,rect.size.y-3),rect.end-Vector2(3,3),Color("10171c"),2)
	for x in [rect.position.x+9,rect.end.x-9]:
		for y in [rect.position.y+9,rect.end.y-9]:
			paint.draw_rect(Rect2(x-3,y-2,6,6),Color("101a20"))
			paint.draw_rect(Rect2(x-2,y-2,4,4),Color("b29b72"))
			paint.draw_line(Vector2(x-1,y-0.6),Vector2(x+1,y+0.6),Color("4d4a3c"),0.7)

func paw(pos: Vector2, scale_value: float, color: Color):
	paint.draw_circle(pos,scale_value*3,color)
	for offset in [Vector2(-3,-4),Vector2(0,-5.3),Vector2(3,-4)]:
		paint.draw_circle(pos+offset*scale_value,1.5*scale_value,color)

func draw_plane(pos: Vector2, kind: String, flash: bool = false):
	if not sprites.is_empty():
		draw_aircraft_sprite(pos,kind,flash)
		return
	var is_player = kind == "player"
	var scale_value = 1.0 if kind == "fighter" or is_player else (1.7 if kind == "bomber" else 3.9)
	paint.draw_set_transform(pos + Vector2(5, 9), 0 if is_player else PI, Vector2.ONE * scale_value)
	poly([Vector2(0,-30),Vector2(6,-7),Vector2(31,7),Vector2(29,17),Vector2(7,11),Vector2(5,24),Vector2(14,28),Vector2(14,33),Vector2(-14,33),Vector2(-14,28),Vector2(-5,24),Vector2(-7,11),Vector2(-29,17),Vector2(-31,7),Vector2(-6,-7)], Color(0.0,0.06,0.1,0.32))
	paint.draw_set_transform(pos, 0 if is_player else PI, Vector2.ONE * scale_value)
	var base = Color("d5d9c8") if is_player else (Color("bd684a") if kind == "fighter" else Color("859580"))
	if flash:
		base = Color.WHITE
	poly([Vector2(-31,7),Vector2(-8,-6),Vector2(8,-6),Vector2(31,7),Vector2(29,17),Vector2(7,11),Vector2(-7,11),Vector2(-29,17)], base.darkened(0.17))
	poly([Vector2(0,-33),Vector2(6,-20),Vector2(7,10),Vector2(4,29),Vector2(-4,29),Vector2(-7,10),Vector2(-6,-20)],base)
	poly([Vector2(-4,22),Vector2(-15,28),Vector2(-14,33),Vector2(14,33),Vector2(15,28),Vector2(4,22)],base)
	paint.draw_rect(Rect2(-3,-16,6,15),Color("254653"))
	paint.draw_line(Vector2(-2,-15),Vector2(-2,-4),Color("7fd5df"),1.8)
	for x in [-20.0,20.0]:
		paint.draw_circle(Vector2(x,10),4,Color("963f3a") if not is_player else Color("285c77"))
		paint.draw_circle(Vector2(x,10),2,Color("e6e0c8"))
	paint.draw_line(Vector2(-12,-24),Vector2(12,-24),Color("c1bba6"),2)
	if is_player:
		poly([Vector2(-3,30),Vector2(0,41 + sin(elapsed * 70) * 4),Vector2(3,30)],Color("ffad47"))
	paint.draw_set_transform(Vector2.ZERO)

func draw_ship(pos: Vector2, flash: bool):
	if sprites.has("ship"):
		var ship: Texture2D = sprites.ship
		var dimensions = Vector2(52,100)
		glow(pos+Vector2(0,38),35,Color("6ed1dc"),0.25)
		paint.draw_texture_rect(ship,Rect2(pos-dimensions/2+Vector2(6,10),dimensions),false,Color(0,0.03,0.05,0.45))
		paint.draw_texture_rect(ship,Rect2(pos-dimensions/2,dimensions),false,Color(1.5,1.35,1.0) if flash else Color.WHITE)
		return
	paint.draw_set_transform(pos)
	poly([Vector2(0,-45),Vector2(20,-20),Vector2(20,35),Vector2(0,48),Vector2(-20,35),Vector2(-20,-20)], Color.WHITE if flash else Color("657c84"))
	paint.draw_rect(Rect2(-13,-19,26,50),Color("a7b0a6"))
	paint.draw_rect(Rect2(-7,-4,14,20),Color("3e535c"))
	for y in [-19.0,26.0]:
		paint.draw_circle(Vector2(0,y),8,Color("71837d"))
		paint.draw_line(Vector2(0,y),Vector2(0,y+15),Color("c7d0c2"),4)
	paint.draw_set_transform(Vector2.ZERO)

func draw_ocean():
	if ocean_texture != null:
		var height = arena_size.x * ocean_texture.get_height()/float(ocean_texture.get_width())
		var offset = fmod(scroll*0.23,height*2.0)
		for i in range(-2,int(arena_size.y/height)+2):
			var y = i*height+offset
			# Alternating reflections share identical borders, avoiding a hard scrolling seam.
			if i % 2 != 0:
				paint.draw_set_transform(Vector2(0,y+height),0,Vector2(1,-1))
			else:
				paint.draw_set_transform(Vector2(0,y))
			paint.draw_texture_rect(ocean_texture,Rect2(0,0,arena_size.x,height),false,Color(0.76,0.86,0.88))
		paint.draw_set_transform(Vector2.ZERO)
		for i in range(12):
			var pos = Vector2(fmod(i*139.0,arena_size.x),fmod(i*83.0+scroll*0.42,arena_size.y))
			glow(pos,48,Color("69cbbd"),0.06)
		return
	paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color("164b62"))
	for i in range(int(arena_size.x * arena_size.y / 10000.0)):
		var x = fmod(float(i * 137), arena_size.x)
		var y = fmod(float(i * 87) + scroll * 1.3, arena_size.y + 40.0) - 20.0
		paint.draw_line(Vector2(x,y),Vector2(x+18+ i%4*8,y),Color(0.25,0.67,0.74,0.14),2)
	for i in range(5):
		var x = -22.0 if i % 2 == 0 else arena_size.x + 25.0
		var y = fmod(float(i * 327) + scroll,1600.0) - 220.0
		paint.draw_set_transform(Vector2(x,y),float(i)*0.6)
		var coast = [Vector2(-72,-100),Vector2(22,-93),Vector2(67,-56),Vector2(80,25),Vector2(39,91),Vector2(-21,110),Vector2(-90,47)]
		poly(coast,Color("3c8792"))
		paint.draw_set_transform(Vector2(x,y),float(i)*0.6,Vector2.ONE*0.85)
		poly(coast,Color("baad70"))
		paint.draw_set_transform(Vector2(x,y),float(i)*0.6,Vector2.ONE*0.7)
		poly(coast,Color("48734e"))
		paint.draw_circle(Vector2(-10,15),24,Color("355d42"))
		paint.draw_circle(Vector2(14,-35),20,Color("5f8654"))
		paint.draw_set_transform(Vector2.ZERO)

func button(rect: Rect2, label: String):
	metal_plate(rect,true)
	var inset = rect.grow(-4)
	paint.draw_style_box(make_box(Color("c9974d"),Color("f3d79c"),3),inset)
	paint.draw_rect(Rect2(inset.position+Vector2(2,2),Vector2(inset.size.x-4,6)),Color("e5be75"))
	paint.draw_line(inset.position+Vector2(2,inset.size.y-3),inset.end-Vector2(2,3),Color("8d5d36"),2)
	var width = font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,21).x
	text_at(label,Vector2(rect.get_center().x-width/2,rect.get_center().y+8),21,Color("35251a"))

func make_box(bg: Color, edge: Color, radius: int = 8) -> StyleBoxFlat:
	var box = StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = edge
	box.set_border_width_all(1)
	box.set_corner_radius_all(0)
	return box

func render_layer(node: CanvasItem, layer: String):
	if font == null:
		return
	paint = node
	if layer == "ocean":
		draw_ocean()
	elif layer == "battle":
		draw_battle()
	else:
		draw_hud()

func draw_combat_effect(effect: Dictionary):
	if effect.life > effect.duration:
		return
	var ratio: float = effect.life/effect.duration
	var age = 1.0-ratio
	var kind: String = effect.get("kind","explosion")
	if kind == "shockwave":
		var points = PackedVector2Array()
		for i in range(65):
			points.append((effect.pos+Vector2.from_angle(i*TAU/64)*effect.size*sqrt(age)).snapped(Vector2.ONE*2.76))
		paint.draw_polyline(points,Color(1,0.64,0.25,ratio*0.55),maxf(2,ratio*12),false)
		for i in range(12):
			var direction = Vector2.from_angle(i*TAU/12)
			paint.draw_line(effect.pos+direction*effect.size*age*0.55,effect.pos+direction*effect.size*age,Color(1,0.88,0.55,ratio*0.75),maxf(2,ratio*5),false)
		return
	if kind == "impact":
		glow(effect.pos,28,Color("ffca6a"),ratio*1.5,2.76)
		pixel_disc(effect.pos,8.0*ratio,Color(1,0.98,0.8,ratio),1.38)
		pixel_ring(effect.pos,effect.size*age,Color(1,0.82,0.4,ratio*0.75),0,TAU,2.76)
		for i in range(12):
			var direction = Vector2.from_angle(i*TAU/12+0.3)
			paint.draw_line((effect.pos+direction*5).snapped(Vector2.ONE*1.38),(effect.pos+direction*(10+age*effect.size)).snapped(Vector2.ONE*1.38),Color(1,0.78,0.35,ratio),4.14,false)
		return
	if kind == "damage" or kind == "shield_hit":
		var tint = Color(0.35,0.85,1,ratio*0.9) if kind == "shield_hit" else Color(1,0.35,0.22,ratio*0.9)
		pixel_ring(effect.pos,effect.size*(0.35+age*0.65),tint,0,TAU,2.76)
		pixel_ring(effect.pos,effect.size*(0.2+age*0.55),Color(1,0.8,0.4,ratio*0.7),0,TAU,2.76)
		for i in range(8):
			var direction = Vector2.from_angle(i*TAU/8+age)
			paint.draw_line(effect.pos+direction*effect.size*age*0.3,effect.pos+direction*effect.size*(0.5+age*0.5),tint,4.14,false)
		return
	if kind == "bomb":
		pixel_ring(effect.pos,effect.size*age,Color(0.7,0.95,1,ratio*0.65),0,TAU,2.76)
		return
	# Bright ignition, expanding orange fireballs, then a fading shock ring.
	glow(effect.pos,minf(64,effect.size),Color("ff9e43"),ratio,2.76)
	pixel_ring(effect.pos,effect.size*age,Color(1,0.76,0.35,ratio*0.65),0,TAU,2.76)
	pixel_ring(effect.pos,effect.size*age*0.75,Color(1,0.94,0.68,ratio*0.7),0,TAU,2.76)
	if age < 0.7:
		var flame_radius = effect.size*(0.17+age*0.34)
		for i in range(5):
			var p: Vector2 = effect.pos+Vector2.from_angle(i*TAU/5)*effect.size*age*0.3
			pixel_disc(p,flame_radius,Color(0.96,0.28+ratio*0.2,0.08,ratio),2.76)
			pixel_disc(p,flame_radius*0.6,Color(1,0.77,0.3,ratio),2.76)
		pixel_disc(effect.pos,flame_radius*0.7,Color(1,0.98,0.8,ratio),2.76)

func draw_battle():
	campaign.draw_hazards()
	for e in enemies:
		if e.kind == "ship":
			draw_ship(e.pos,e.flash > 0)
		else:
			draw_plane(e.pos,e.kind,e.flash > 0)
		campaign.draw_enemy(e)
	for b in shots:
		if b.get("laser",false):
			if b.get("charge",0.0) > 0:
				continue
			var beam_end: Vector2 = b.get("beam_end",b.pos+b.vel.normalized()*arena_size.length())
			var intensity = clampf(b.life/0.16,0.0,1.0)
			paint.draw_line(b.pos,beam_end,Color(0.5,0.3,1,intensity*0.08),maxf(0.5,38*intensity),false)
			paint.draw_line(b.pos,beam_end,Color(0.55,0.4,1,intensity*0.17),maxf(0.5,24*intensity),false)
			paint.draw_line(b.pos,beam_end,Color(0.6,0.55,1,intensity*0.4),maxf(0.5,15*intensity),false)
			paint.draw_line(b.pos,beam_end,Color(0.65,0.85,1,intensity*0.95),maxf(0.5,8*intensity),false)
			paint.draw_line(b.pos,beam_end,Color(0.97,1,1,intensity),maxf(0.5,3.5*intensity),false)
			glow(b.pos,26,Color("a5dfff"),intensity*2.0,1.38)
			continue
		if b.get("missile",false):
			var tail: Vector2 = b.pos-b.vel.normalized()*24
			var color = Color("ffc45f")
			paint.draw_line(tail.snapped(Vector2.ONE*1.38),b.pos.snapped(Vector2.ONE*1.38),color,5.52,false)
			paint.draw_line(tail.snapped(Vector2.ONE*1.38),b.pos.snapped(Vector2.ONE*1.38),Color("fff8dc"),1.38,false)
			continue
		glow(b.pos+Vector2(0,5),12,Color("59d9e3"),0.5,1.38)
		var pos: Vector2 = b.pos.snapped(Vector2.ONE*1.38)
		paint.draw_rect(Rect2(pos+Vector2(-2,0),Vector2(4,20)),Color(0.25,0.81,0.9,0.3))
		paint.draw_rect(Rect2(pos+Vector2(-2,0),Vector2(4,12)),Color("7ee8ea"))
		paint.draw_rect(Rect2(pos+Vector2(0,0),Vector2(2,8)),Color("fff6ca"))
	for b in enemy_shots:
		var tail: Vector2 = -b.vel.normalized()*16
		glow(b.pos,13,Color("ff6938"),0.65,1.38)
		paint.draw_line(b.pos.snapped(Vector2.ONE*1.38),(b.pos+tail).snapped(Vector2.ONE*1.38),Color(0.94,0.27,0.1,0.25),4,false)
		pixel_disc(b.pos,b.radius+1,Color("b4472a"),1.38)
		pixel_disc(b.pos,b.radius*0.75,Color("ffc275"),1.38)
		paint.draw_rect(Rect2(b.pos.snapped(Vector2.ONE*1.38)-Vector2(2,2),Vector2(2,2)),Color("fff3c1"))
		if b.get("homing_time",0.0) > 0:
			pixel_ring(b.pos,9,Color("efbeff"),0,TAU,1.38)
	for d in drops:
		if d.kind == "energy":
			glow(d.pos,20,Color("8be7ff"),0.9,1.38)
			pixel_disc(d.pos,8,Color("2450a0"),1.38)
			pixel_disc(d.pos,5,Color("73d8ff"),1.38)
			pixel_disc(d.pos+Vector2(-2,-2),2,Color("e3ffff"),1.38)
			continue
		var color = Color("f3c662") if d.kind == "coin" else (Color("70daca") if d.kind == "power" else Color("e0f4e5"))
		glow(d.pos,20,color,0.22+sin(elapsed*4)*0.06)
		pixel_disc(d.pos+Vector2(2,2),12,Color("1a2527"))
		pixel_disc(d.pos,11,color.darkened(0.5))
		pixel_disc(d.pos,8,color)
		pixel_ring(d.pos,9,color.lightened(0.3),-PI,PI)
		text_at("$" if d.kind == "coin" else ("P" if d.kind == "power" else "+"),d.pos+Vector2(-5,5),14,Color("143345"))
	for effect in effects:
		draw_combat_effect(effect)
	for particle in particles:
		var life = particle.life/particle.duration
		if particle.kind == "smoke" or (particle.kind == "fire" and life < 0.55):
			pixel_disc(particle.pos,particle.size*(2-life)*2,Color(0.10,0.12,0.13,life*0.45),1.38)
		elif particle.kind == "debris":
			var p: Vector2 = particle.pos.snapped(Vector2.ONE*1.38)
			paint.draw_line(p,p-particle.vel.normalized()*10,Color(0.55,0.63,0.65,life),4.14,false)
			paint.draw_rect(Rect2(p,Vector2(2.76,2.76)),Color(1,0.75,0.35,life))
		else:
			var color = Color("84e8ee") if particle.kind == "energy" else Color("ffc766")
			paint.draw_rect(Rect2(particle.pos.snapped(Vector2.ONE*1.38),Vector2.ONE*maxf(1.38,roundf(particle.size/1.38)*1.38)),Color(color,life))
			if particle.kind == "spark":
				paint.draw_line(particle.pos.snapped(Vector2.ONE*1.38),(particle.pos-particle.vel.normalized()*13*life).snapped(Vector2.ONE*1.38),Color(1,0.92,0.64,life),2.76,false)
			if particle.kind != "spark":
				glow(particle.pos,particle.size*4,color,life*0.4,1.38)
	if state != "defeat":
		for drone_pos in progression.drone_positions():
			paint.draw_rect(Rect2(drone_pos-Vector2(16,4),Vector2(32,8)),Color("d4b967"))
			poly([drone_pos+Vector2(0,-16),drone_pos+Vector2(9,9),drone_pos+Vector2(-9,9)],Color("59cdd7"))
			pixel_disc(drone_pos,3,Color("f5efd1"),1.38)
		draw_plane(player,"player",hit_flash>0.1)
		var charge_level = 0.0
		var pulse_level = 0.0
		for b in shots:
			if b.get("laser",false) and b.get("bounce_count",0) == 0:
				if b.get("charge",0.0) > 0:
					charge_level = maxf(charge_level,1.0-b.charge/0.1)
				else:
					pulse_level = maxf(pulse_level,clampf(b.life/0.16,0,1))
		if charge_level > 0 or pulse_level > 0:
			var nose = laser_origin()
			var brightness = maxf(charge_level,pulse_level)
			glow(nose,32,Color("96dfff"),brightness*2.5,1.38)
			paint.draw_circle(nose,3+brightness*7,Color(0.42,0.72,1,brightness*0.7))
			paint.draw_circle(nose,2+brightness*3.5,Color(0.92,1,1,brightness))
			if charge_level > 0:
				for i in range(6):
					var direction = Vector2.from_angle(i*TAU/6+elapsed*7)
					paint.draw_line(nose+direction*(10+(1-charge_level)*24),nose+direction*9,Color(0.6,0.85,1,charge_level),2,false)
		if invincible > 0 or progression.shield_layers > 0:
			draw_shield()
	if bomb_flash > 0:
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(0.98,0.83,0.56,bomb_flash*0.14))
	if impact_light > 0:
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(1,0.85,0.6,impact_light*0.55))
	# Hostile projectiles stay readable above the explosion layers.
	for b in enemy_shots:
		paint.draw_circle(b.pos,b.radius+2,Color("301622"))
		paint.draw_circle(b.pos,b.radius,Color("ff703d"))
		paint.draw_circle(b.pos,maxf(1,b.radius*0.45),Color("fff0ac"))

func skill_card_rect(index: int) -> Rect2:
	return skill_cards.card_rect(arena_size,progression.choices.size(),index)

func draw_hud():
	if state != "menu":
		var energy_rect = Rect2(arena_size.x/2-100,arena_size.y-18,200,8)
		paint.draw_rect(energy_rect.grow(2),Color("102633"))
		paint.draw_rect(Rect2(energy_rect.position,Vector2(200*minf(1,float(progression.energy)/progression.energy_required()),8)),Color("73d8ff"))
		var status = "ENERGY %d/%d  LV%d  ROUTES %d/%s" % [progression.energy,progression.energy_required(),progression.skill_level,progression.routes().size(),"6" if infinite_mode else "4"]
		var status_pos = Vector2(arena_size.x/2-font.get_string_size(status,HORIZONTAL_ALIGNMENT_LEFT,-1,10).x/2,arena_size.y-25)
		paint.draw_string_outline(font,status_pos,status,HORIZONTAL_ALIGNMENT_LEFT,-1,10,3,Color("102633"))
		text_at(status,status_pos,10,Color("c7f3fa"))
		text_at("ENDLESS / WAVE %d / THREAT %d" % [wave,campaign.threat()] if infinite_mode else "STAGE %03d / WAVE %d-%d" % [stage_level,wave,campaign.wave_limit()],Vector2(20,20),12,Color("ffe0a1"))
	for e in enemies:
		if e.kind == "boss" and e.get("warning",false):
			var label: String = ["TRIPLE FAN","SAFE LANE","HOMING x2","SAFE LANE"][e.attack]
			var label_pos = Vector2((arena_size.x-font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,16).x)/2,30)
			paint.draw_string_outline(font,label_pos,label,HORIZONTAL_ALIGNMENT_LEFT,-1,16,4,Color("0b202a"))
			text_at(label,label_pos,16,Color("ffe0a1"))
			if e.attack == 1 or e.attack == 3:
				var lane = Rect2(e.gap_x-80,e.pos.y+100,160,arena_size.y-e.pos.y-120)
				paint.draw_rect(lane,Color(0.3,1,0.75,0.08))
				paint.draw_line(lane.position,lane.position+Vector2(0,lane.size.y),Color(0.4,1,0.8,0.5),2)
				paint.draw_line(Vector2(lane.end.x,lane.position.y),lane.end,Color(0.4,1,0.8,0.5),2)
	if hit_flash > 0:
		var alpha = hit_flash/0.45*0.65
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(1,0.22,0.1,alpha*0.09))
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(1,0.3,0.17,alpha),false,9)
	if state != "menu":
		for e in enemies:
			if combat_rect.has_point(e.pos) and e.hp > 0:
				draw_health_indicator(e.pos,e.kind,float(e.hp),float(e.max_hp))
		if hp > 0:
			draw_health_indicator(player,"player",hp,progression.max_health())
	if state == "skill_choice":
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(0.02,0.08,0.12,0.85))
		centered("CHOOSE A SKILL",skill_card_rect(0).position.y-24,24,Color("ffe0a1"))
		for i in range(progression.choices.size()):
			skill_cards.draw_card(self,progression.choices[i],i)
		centered("CLICK / TAP TO SELECT",skill_card_rect(progression.choices.size()-1).end.y+25,12)
		return
	if state in ["menu","paused","defeat","victory"]:
		paint.draw_rect(Rect2(Vector2.ZERO,arena_size),Color(0.02,0.08,0.12,0.72))
		var panel = Rect2(Vector2(arena_size.x/2.0-220,arena_size.y/2.0-182),Vector2(440,364))
		metal_plate(panel,true)
		paint.draw_style_box(make_box(Color("182b31"),Color("725e40"),2),panel.grow(-17))
		var y = panel.position.y
		centered("CAT ARCADE  /  AIR COMBAT",y+35,12,Color("d6b779"))
		paw(Vector2(panel.end.x-39,y+56),2,Color("d6b779"))
		centered("SKY PATROL" if state == "menu" else ("PAUSED" if state == "paused" else ("MISSION CLEAR" if state == "victory" else "MISSION FAILED")),y+83,32)
		if state == "menu":
			centered("01  /  CORAL COAST",y+121,17,Color("85c7cb"))
			centered("Drag to fly  /  WASD or arrow keys",y+169,16)
			centered("Auto fire  /  B or Space: bomb",y+198,16)
			centered("Dodge bullets. Upgrade. Defeat the boss.",y+225,15,Color("95afb8"))
		else:
			centered("SCORE  %07d" % score,y+146,24,Color("e6ce91"))
			centered("P or Esc to pause / resume" if state == "paused" else "BEST  %07d" % best,y+194,16)
		button(start_rect,"START MISSION" if state == "menu" else ("RESUME" if state == "paused" else ("RETURN TO HANGAR" if lobby_launch else "FLY AGAIN")))
		if lobby_launch and state == "paused":
			button(hangar_rect,"RETURN TO HANGAR")
		else:
			centered("BEST  %07d" % best if state == "menu" else "CORAL COAST  /  MISSION 01",y+340,13,Color("8ba5ad"))
