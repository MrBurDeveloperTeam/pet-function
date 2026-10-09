extends Node2D

const ROUND_TIME := 45.0
const VIEW := Vector2(1280, 720)
const MINE_BACKGROUND: Texture2D = preload("res://assets/backgrounds/mine-cavern-v6.png")
const HOLE_SPRITE: Texture2D = preload("res://assets/sprites/burrow-hole-v1.png")
const MOLE_SPRITE: Texture2D = preload("res://assets/sprites/mole-v1.png")
const BOMB_SPRITE: Texture2D = preload("res://assets/sprites/bomb-v1.png")
const KITTEN_SPRITE: Texture2D = preload("res://assets/sprites/kitten-v1.png")
const BOSS_SPRITE: Texture2D = preload("res://assets/sprites/mole-boss-v1.png")
const MOLE_HIT_SPRITE: Texture2D = preload("res://assets/sprites/mole-hit-v1.png")
const KITTEN_HIT_SPRITE: Texture2D = preload("res://assets/sprites/kitten-hit-v1.png")
const BOSS_HIT_SPRITE: Texture2D = preload("res://assets/sprites/mole-boss-hit-v1.png")
const BOMB_EXPLOSION_SPRITE: Texture2D = preload("res://assets/sprites/bomb-explosion-v1.png")
const KITTEN_PLAQUE_SPRITE: Texture2D = preload("res://assets/sprites/kitten-plaque-v1.png")
const KITTEN_CAVITY_SPRITE: Texture2D = preload("res://assets/sprites/kitten-cavity-v1.png")
const MOLE_ARMORED_SPRITE: Texture2D = preload("res://assets/sprites/mole-armored-v1.png")
const BOSS_SHIELD_SPRITE: Texture2D = preload("res://assets/sprites/mole-boss-shield-v1.png")
const BOSS_ENRAGED_SPRITE: Texture2D = preload("res://assets/sprites/mole-boss-enraged-v1.png")
const RESULT_PANEL_SPRITE: Texture2D = preload("res://assets/sprites/result-panel-v1.png")
const HOLES := [
	{"p": Vector2(424, 342), "s": 0.62, "r": -0.06},
	{"p": Vector2(640, 316), "s": 0.58, "r": 0.04},
	{"p": Vector2(855, 344), "s": 0.64, "r": -0.03},
	{"p": Vector2(337, 457), "s": 0.82, "r": 0.05},
	{"p": Vector2(638, 429), "s": 0.88, "r": -0.02},
	{"p": Vector2(943, 461), "s": 0.80, "r": 0.05},
	{"p": Vector2(276, 603), "s": 1.06, "r": -0.04},
	{"p": Vector2(630, 580), "s": 1.12, "r": 0.03},
	{"p": Vector2(1002, 610), "s": 1.02, "r": -0.06},
]

var target_hole := -1
var target_kind := "mole"
var target_variant := "normal"
var target_age := 0.0
var target_hits_left := 1
var reaction_hole := -1
var reaction_kind := "mole"
var reaction_variant := "normal"
var reaction_age := 0.0
var spawn_delay := 0.7
var time_left := ROUND_TIME
var score := 0
var combo := 0
var hearts := 3
var playing := true
var shake := 0.0
var flash := 0.0
var particles: Array[Dictionary] = []
var feedback := ""
var feedback_pos := Vector2.ZERO
var feedback_age := 0.0
var rng := RandomNumberGenerator.new()
var target_hit_images: Dictionary = {}
var font: Font
var reward_sent := false
var energy := 0.0
var skill_time := 0.0
var skills_used := 0
var teeth_treated := 0
var armor_broken := 0
var boss_hp := 6
var boss_defeated := false
var blackout_time := 0.0
var next_blackout_at := 0.0
var mud_time := 0.0
var mud_throw_time := 0.0
var next_mud_throw := 0.0
var tutorial_paused := true
var tutorial_step := -1
var tutorial_reaction_resume_hole := -1
var tutorial_progress_pending := -1
var host_message_callback: JavaScriptObject

func _ready() -> void:
	rng.randomize()
	font = ThemeDB.fallback_font
	register_host_messages()
	schedule_blackout()
	update_scene_layout()
	queue_redraw()
	post_to_host("game-ready")

func _process(delta: float) -> void:
	update_scene_layout()
	if reaction_hole >= 0:
		reaction_age += delta
		if reaction_age >= 0.48:
			reaction_hole = -1
			if tutorial_reaction_resume_hole >= 0:
				target_hole = tutorial_reaction_resume_hole
				tutorial_reaction_resume_hole = -1
				target_age = 0.22
				call_deferred("post_tutorial_target_bounds")
			elif tutorial_progress_pending >= 0:
				var completed_step := tutorial_progress_pending
				tutorial_progress_pending = -1
				post_to_host("tutorial-progress", {"step": completed_step})
	if tutorial_paused:
		queue_redraw()
		return
	if playing:
		# The final boss owns its own battle phase. The round clock cannot end the
		# game while the king is still alive and visible between burrow jumps.
		var boss_battle_active := time_left <= 10.0 and boss_hp > 0
		if skill_time <= 0.0 and not boss_battle_active:
			time_left = maxf(10.0 if boss_hp > 0 else 0.0, time_left - delta)
		if time_left <= 0.0 or hearts <= 0:
			playing = false
			send_completion()
		if skill_time > 0.0:
			skill_time = maxf(0.0, skill_time - delta)
			# Time freeze stops escape/lifetime, but a newly spawned target must still
			# finish its short emergence animation instead of remaining half-sized.
			if target_hole >= 0 and target_age < 0.16:
				target_age = minf(0.16, target_age + delta)
		else:
			target_age += delta
		if target_hole < 0:
			spawn_delay -= delta
			if spawn_delay <= 0.0:
				spawn_target()
		elif target_age > get_target_lifetime():
			target_hole = -1
			combo = 0
			spawn_delay = rng.randf_range(0.16, 0.42)
		update_blackout(delta)
		update_boss_mud(delta)
	shake = maxf(0.0, shake - delta * 5.0)
	flash = maxf(0.0, flash - delta * 4.5)
	feedback_age += delta
	for particle in particles:
		particle.p += particle.v * delta
		particle.v.y += 420.0 * delta
		particle.life -= delta
	particles = particles.filter(func(item): return item.life > 0.0)
	mud_time = maxf(0.0, mud_time - delta)
	if mud_throw_time > 0.0:
		mud_throw_time = maxf(0.0, mud_throw_time - delta)
		if mud_throw_time <= 0.0:
			mud_time = 2.0
	queue_redraw()

func spawn_target() -> void:
	target_hole = rng.randi_range(0, 8)
	target_age = 0.0
	target_hits_left = 1
	var roll := rng.randf()
	target_kind = "kitten" if roll < 0.22 else ("bomb" if roll < 0.38 else "mole")
	target_variant = "normal"
	if target_kind == "kitten":
		var tooth_roll := rng.randf()
		target_variant = "healthy" if tooth_roll < 0.36 else ("plaque" if tooth_roll < 0.72 else "cavity")
		target_hits_left = 2 if target_variant == "cavity" else 1
	elif target_kind == "mole" and rng.randf() < 0.30:
		target_variant = "armored"
		target_hits_left = 2
	if time_left <= 10.0 and boss_hp > 0:
		target_kind = "boss"
		target_variant = "phase1" if boss_hp > 4 else ("shield" if boss_hp > 2 else "enraged")
		target_hits_left = 2 if target_variant == "shield" else 1
		if target_variant == "enraged" and next_mud_throw <= 0.0:
			next_mud_throw = rng.randf_range(0.7, 1.4)

func schedule_blackout() -> void:
	# The first ten seconds are always fully lit. Later outages arrive unpredictably.
	next_blackout_at = time_left - rng.randf_range(10.5, 15.0)

func update_blackout(delta: float) -> void:
	if blackout_time > 0.0:
		blackout_time = maxf(0.0, blackout_time - delta)
		if blackout_time <= 0.0:
			next_blackout_at = time_left - rng.randf_range(5.5, 9.5)
	elif time_left <= next_blackout_at and time_left > 7.0:
		blackout_time = rng.randf_range(3.0, 4.8)

func update_boss_mud(delta: float) -> void:
	if target_kind != "boss" or target_variant != "enraged" or target_hole < 0 or skill_time > 0.0:
		return
	next_mud_throw -= delta
	if next_mud_throw <= 0.0:
		mud_throw_time = 0.46
		shake = 1.25
		next_mud_throw = rng.randf_range(1.8, 3.0)

func get_target_lifetime() -> float:
	if target_kind == "boss":
		return 1.30 if target_variant == "shield" else (0.82 if target_variant == "enraged" else 1.05)
	return 0.72 if time_left > 8.0 else 0.42

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if scene_exit_rect().has_point(to_local(event.position)):
			post_to_host("close")
			return
	if tutorial_paused:
		if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
			post_to_host("close")
		elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			var tutorial_position := to_local(event.position)
			if target_contains_point(tutorial_position):
				hit_tutorial_target(target_hole)
				return
			for i in range(HOLES.size()):
				var tutorial_hole: Dictionary = HOLES[i]
				var tutorial_radius := Vector2(125.0, 64.0) * float(tutorial_hole.s)
				var tutorial_local: Vector2 = (tutorial_position - Vector2(tutorial_hole.p)) / tutorial_radius
				if tutorial_local.length_squared() <= 1.0:
					hit_tutorial_target(i)
					return
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		activate_skill()
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		post_to_host("close")
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var scene_position := to_local(event.position)
		if not playing:
			reset_game()
			return
		if target_contains_point(scene_position):
			hit_hole(target_hole)
			return
		for i in range(HOLES.size()):
			var hole: Dictionary = HOLES[i]
			var hitbox_boost := (1.40 if target_kind == "boss" else 1.25) if i == target_hole else 1.0
			var radius := Vector2(112.0, 48.0) * float(hole.s) * hitbox_boost
			var local_position: Vector2 = (scene_position - Vector2(hole.p)) / radius
			if local_position.length_squared() <= 1.0:
				hit_hole(i)
				return

func target_sprite_rect(p: Vector2, hole_scale: float, kind: String, variant: String, rise: float) -> Rect2:
	var texture := get_target_texture(kind,variant)
	var width := get_target_base_width(kind)*hole_scale*lerpf(0.46,1.0,rise)
	var height := width*float(texture.get_height())/float(texture.get_width())
	return Rect2(Vector2(-width*0.5,p.y+48.0*hole_scale-height),Vector2(width,height))

func target_contains_point(scene_point: Vector2) -> bool:
	if target_hole < 0: return false
	var hole: Dictionary = HOLES[target_hole]
	var hole_scale := float(hole.s)
	var rise := clampf(target_age/0.16,0.0,1.0)
	var bob := sin(target_age*16.0)*3.0
	var rect := target_sprite_rect(Vector2(0,16*hole_scale+bob),hole_scale,target_kind,target_variant,rise)
	var local_point := (scene_point-Vector2(hole.p)).rotated(-float(hole.r))
	if not rect.has_point(local_point): return false
	var texture := get_target_texture(target_kind,target_variant)
	if not target_hit_images.has(texture): target_hit_images[texture]=texture.get_image()
	var image: Image = target_hit_images[texture]
	var uv := (local_point-rect.position)/rect.size
	var pixel := Vector2i(int(uv.x*image.get_width()),int(uv.y*image.get_height()))
	return image.get_pixel(pixel.x,pixel.y).a>0.1

func hit_hole(index: int) -> void:
	feedback_pos = Vector2(HOLES[index].p) - Vector2(0, 65)
	feedback_age = 0.0
	shake = 1.0
	flash = 0.75
	burst(Vector2(HOLES[index].p))
	if index != target_hole:
		combo = 0
		feedback = "MISS"
		return
	if target_hits_left > 1:
		target_hits_left -= 1
		target_age = 0.12
		energy = minf(100.0, energy + 10.0)
		if target_variant == "armored":
			armor_broken += 1
			feedback = "ARMOR BREAK"
			target_variant = "normal"
		elif target_variant == "shield":
			feedback = "ROYAL SHIELD BREAK"
			target_variant = "phase1"
		else:
			feedback = "CAVITY CLEANING"
		return
	var correct_hit := false
	if target_kind == "bomb":
		hearts -= 1
		score = maxi(0, score - 20)
		combo = 0
		feedback = "BOOM -20"
	elif target_kind == "kitten" and target_variant == "healthy":
		hearts -= 1
		score = maxi(0, score - 10)
		combo = 0
		feedback = "HEALTHY TOOTH! -10"
	elif target_kind == "kitten":
		correct_hit = true
		teeth_treated += 1
		combo += 1
		var treatment_points := 30 if target_variant == "cavity" else 18
		score += treatment_points * get_score_multiplier()
		feedback = "CAVITY SAVED +%d" % (treatment_points * get_score_multiplier()) if target_variant == "cavity" else "PLAQUE CLEANED +%d" % (treatment_points * get_score_multiplier())
	elif target_kind == "boss":
		correct_hit = true
		boss_hp = maxi(0, boss_hp - 1)
		combo += 1
		var boss_points := 25 * get_score_multiplier()
		score += boss_points
		boss_defeated = boss_hp == 0
		feedback = "KING DEFEATED +%d" % boss_points if boss_defeated else "BOSS HIT +%d" % boss_points
		if boss_defeated:
			playing = false
			send_completion()
	else:
		correct_hit = true
		combo += 1
		var points := 10 * get_score_multiplier()
		score += points
		feedback = "+%d" % points
	if correct_hit:
		energy = minf(100.0, energy + (24.0 if target_kind == "boss" else 16.0))
	reaction_hole = index
	reaction_kind = target_kind
	reaction_variant = target_variant
	reaction_age = 0.0
	target_hole = -1
	spawn_delay = rng.randf_range(0.42, 0.58)

func get_score_multiplier() -> int:
	var combo_multiplier := 4 if combo >= 20 else (3 if combo >= 10 else (2 if combo >= 5 else 1))
	return combo_multiplier * (2 if skill_time > 0.0 else 1)

func activate_skill() -> void:
	if not playing or energy < 100.0:
		return
	energy = 0.0
	skill_time = 3.0
	if target_hole >= 0:
		target_age = maxf(target_age, 0.16)
	skills_used += 1
	feedback = "TIME FREEZE + DOUBLE SCORE"
	feedback_pos = Vector2(550, 130)
	feedback_age = 0.0
	flash = 0.55
	shake = 1.35
	for i in range(42):
		var angle := TAU * float(i) / 42.0 + rng.randf_range(-0.08, 0.08)
		var speed := rng.randf_range(180.0, 470.0)
		particles.append({"p": VIEW * 0.5, "v": Vector2(cos(angle), sin(angle)) * speed, "life": rng.randf_range(0.75, 1.35), "size": rng.randf_range(4.0, 12.0), "skill": true})

func burst(origin: Vector2) -> void:
	for i in range(18):
		var angle := rng.randf_range(-2.9, -0.25)
		var speed := rng.randf_range(110.0, 330.0)
		particles.append({"p": origin, "v": Vector2(cos(angle), sin(angle)) * speed, "life": rng.randf_range(0.35, 0.72), "size": rng.randf_range(3.0, 9.0)})

func reset_game() -> void:
	time_left = ROUND_TIME
	score = 0
	combo = 0
	hearts = 3
	playing = true
	target_hole = -1
	reaction_hole = -1
	spawn_delay = 0.35
	reward_sent = false
	energy = 0.0
	skill_time = 0.0
	skills_used = 0
	teeth_treated = 0
	armor_broken = 0
	boss_hp = 6
	boss_defeated = false
	blackout_time = 0.0
	mud_time = 0.0
	mud_throw_time = 0.0
	next_mud_throw = 0.0
	schedule_blackout()
	post_to_host("game-started")

func send_completion() -> void:
	if reward_sent:
		return
	reward_sent = true
	# Rewards are all-or-nothing: defeating the king converts every ten score
	# points into one outside coin and grants a fixed twenty XP.
	var coins := floori(score / 10.0) if boss_defeated else 0
	var xp := 20 if boss_defeated else 0
	post_to_host("game-complete", {"score": score, "coins": coins, "xp": xp, "teethTreated": teeth_treated, "armorBroken": armor_broken, "bossDefeated": boss_defeated, "skillsUsed": skills_used})

func post_to_host(event_type: String, details: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	var payload := {"source": "pet-function:mole-game", "type": event_type}
	for key in details:
		payload[key] = details[key]
	var script := "window.parent.postMessage(%s, window.location.origin);" % JSON.stringify(payload)
	JavaScriptBridge.eval(script)

func register_host_messages() -> void:
	if not OS.has_feature("web"):
		return
	host_message_callback = JavaScriptBridge.create_callback(_on_host_message)
	var browser_window = JavaScriptBridge.get_interface("window")
	browser_window.addEventListener("message", host_message_callback)

func _exit_tree() -> void:
	if not OS.has_feature("web") or host_message_callback == null:
		return
	var browser_window = JavaScriptBridge.get_interface("window")
	browser_window.removeEventListener("message", host_message_callback)

func _on_host_message(arguments: Array) -> void:
	if arguments.is_empty():
		return
	var event = arguments[0]
	var browser_window = JavaScriptBridge.get_interface("window")
	if event.origin != browser_window.location.origin:
		return
	var data = event.data
	if data == null or data.source != "pet-function:mole-game":
		return
	if data.type == "tutorial-active":
		tutorial_paused = true
		queue_redraw()
	elif data.type == "tutorial-step":
		tutorial_paused = true
		setup_tutorial_step(int(data.step))
	elif data.type == "tutorial-complete":
		tutorial_paused = false
		tutorial_step = -1
		reset_game()

func setup_tutorial_step(step: int) -> void:
	tutorial_step = clampi(step, 0, 5)
	shake = 0.0
	flash = 0.0
	particles.clear()
	reaction_hole = -1
	tutorial_reaction_resume_hole = -1
	tutorial_progress_pending = -1
	target_hole = 4
	target_age = 0.22
	target_hits_left = 1
	target_kind = "mole"
	target_variant = "normal"
	match tutorial_step:
		1:
			target_variant = "armored"
			target_hits_left = 2
		2:
			target_kind = "bomb"
		3:
			target_kind = "kitten"
			target_variant = "plaque"
		4:
			target_kind = "kitten"
			target_variant = "cavity"
			target_hits_left = 2
		5:
			target_kind = "boss"
			target_variant = "shield"
			target_hits_left = 2
	queue_redraw()
	call_deferred("post_tutorial_target_bounds")

func get_target_texture(kind: String, variant: String) -> Texture2D:
	if kind == "bomb":
		return BOMB_SPRITE
	if kind == "kitten":
		return KITTEN_PLAQUE_SPRITE if variant == "plaque" else (KITTEN_CAVITY_SPRITE if variant == "cavity" else KITTEN_SPRITE)
	if kind == "boss":
		return BOSS_SHIELD_SPRITE if variant == "shield" else (BOSS_ENRAGED_SPRITE if variant == "enraged" else BOSS_SPRITE)
	if variant == "armored":
		return MOLE_ARMORED_SPRITE
	return MOLE_SPRITE

func get_target_base_width(kind: String) -> float:
	if kind == "bomb":
		return 224.0
	if kind == "kitten":
		return 230.0
	if kind == "boss":
		return 286.0
	return 238.0

func post_tutorial_target_bounds() -> void:
	if target_hole < 0:
		return
	var hole: Dictionary = HOLES[target_hole]
	var hole_scale := float(hole.s)
	var texture := get_target_texture(target_kind, target_variant)
	var sprite_width := get_target_base_width(target_kind) * hole_scale
	var sprite_height := sprite_width * float(texture.get_height()) / float(texture.get_width())
	var bob := sin(target_age * 16.0) * 3.0
	var bottom := (16.0 * hole_scale + bob) + 48.0 * hole_scale
	var local_rect := Rect2(Vector2(-sprite_width * 0.5, bottom - sprite_height), Vector2(sprite_width, sprite_height))
	var corners := PackedVector2Array([local_rect.position, Vector2(local_rect.end.x, local_rect.position.y), local_rect.end, Vector2(local_rect.position.x, local_rect.end.y)])
	var min_point := Vector2(INF, INF)
	var max_point := Vector2(-INF, -INF)
	for corner in corners:
		var viewport_point: Vector2 = position + Vector2(hole.p) + corner.rotated(float(hole.r))
		min_point = Vector2(minf(min_point.x, viewport_point.x), minf(min_point.y, viewport_point.y))
		max_point = Vector2(maxf(max_point.x, viewport_point.x), maxf(max_point.y, viewport_point.y))
	# Keep the glowing border outside the artwork instead of painting over its
	# head, paws, fuse or crown. The measured rect changes with every sprite's
	# real aspect ratio and the current hole scale.
	var padding := 12.0
	min_point -= Vector2(padding, padding)
	max_point += Vector2(padding, padding)
	var viewport_size := get_viewport_rect().size
	post_to_host("tutorial-target-bounds", {
		"left": min_point.x,
		"top": min_point.y,
		"width": max_point.x - min_point.x,
		"height": max_point.y - min_point.y,
		"viewportWidth": viewport_size.x,
		"viewportHeight": viewport_size.y,
	})

func hit_tutorial_target(index: int) -> void:
	if index != target_hole or tutorial_step == 2:
		return
	var hit_kind := target_kind
	var hit_variant := target_variant
	target_hits_left -= 1
	if target_hits_left > 0:
		if target_variant == "armored":
			target_variant = "normal"
		elif target_variant == "cavity":
			target_variant = "plaque"
		elif target_variant == "shield":
			target_variant = "phase1"
		reaction_hole = index
		reaction_kind = hit_kind
		reaction_variant = hit_variant
		reaction_age = 0.0
		target_hole = -1
		tutorial_reaction_resume_hole = index
		queue_redraw()
		return
	reaction_hole = index
	reaction_kind = hit_kind
	reaction_variant = hit_variant
	reaction_age = 0.0
	target_hole = -1
	tutorial_progress_pending = tutorial_step

func _draw() -> void:
	var offset := Vector2(rng.randf_range(-9, 9), rng.randf_range(-6, 6)) * shake
	var viewport_size := get_viewport_rect().size
	var background_rect := Rect2(-position, viewport_size)
	draw_set_transform(offset)
	# Full pixel-art environment: deep mine tunnel, side walls, timber supports and
	# a readable dirt playfield. Interactive objects remain separate draw layers.
	draw_texture_rect(MINE_BACKGROUND, background_rect, false)
	# Nine perspective holes.
	for i in range(HOLES.size()):
		draw_hole(i)
	for particle in particles:
		var particle_color := Color("63f6ff") if particle.get("skill", false) else Color("d78a43")
		draw_rect(Rect2(particle.p, Vector2(particle.size, particle.size)), particle_color)
	if is_blackout_active():
		draw_blackout(background_rect)
	if mud_throw_time > 0.0:
		draw_mud_projectile()
	if mud_time > 0.0:
		draw_mud_splatter(background_rect)
	if skill_time > 0.0:
		draw_skill_effect(background_rect)
	draw_hud()
	if flash > 0.0:
		draw_rect(background_rect, Color(1.0,0.65,0.22,flash * 0.22))
	draw_set_transform(Vector2.ZERO)

func update_scene_layout() -> void:
	var viewport_size := get_viewport_rect().size
	scale = Vector2.ONE
	position = (viewport_size - VIEW) * 0.5

func draw_hole(index: int) -> void:
	var hole: Dictionary = HOLES[index]
	var p := Vector2(hole.p)
	var s := float(hole.s)
	draw_set_transform(p, float(hole.r), Vector2.ONE)
	# The shared illustrated burrow gives every target the same polished pet-art style.
	var hole_size := Vector2(244, 150) * s
	draw_texture_rect(HOLE_SPRITE, Rect2(Vector2(-hole_size.x * 0.5, -hole_size.y * 0.5), hole_size), false)
	if target_hole == index:
		var rise := clampf(target_age / 0.16, 0.0, 1.0)
		var bob := sin(target_age * 16.0) * 3.0
		draw_target_sprite(Vector2(0, 16*s + bob), s, target_kind, target_variant, rise)
	elif reaction_hole == index:
		draw_hit_reaction(Vector2(0, 16*s), s, reaction_kind, reaction_age)
	draw_set_transform(Vector2.ZERO)

func draw_pixel_ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(24):
		var angle := TAU * float(i) / 24.0
		points.append(center + Vector2(cos(angle)*radius.x, sin(angle)*radius.y))
	draw_polygon(points, PackedColorArray([color]))

func draw_target_sprite(p: Vector2, s: float, kind: String, variant: String, rise: float) -> void:
	var texture := get_target_texture(kind, variant)
	var rect := target_sprite_rect(p,s,kind,variant,rise)
	draw_texture_rect(texture,rect,false,Color.WHITE)

func is_blackout_active() -> bool:
	return blackout_time > 0.0

func draw_blackout(background_rect: Rect2) -> void:
	draw_rect(background_rect, Color(0.0, 0.0, 0.015, 0.91))
	if target_hole < 0:
		return
	var hole: Dictionary = HOLES[target_hole]
	var p := Vector2(hole.p)
	var s := float(hole.s)
	if target_kind == "bomb":
		var spark := p + Vector2(42, -78) * s
		for angle in [0.0, PI * 0.25, PI * 0.5, PI * 0.75]:
			var ray := Vector2(cos(angle), sin(angle)) * (14.0 + sin(Time.get_ticks_msec() * 0.02) * 3.0) * s
			draw_line(spark - ray, spark + ray, Color("ff9d24"), 3.0 * s)
		draw_circle(spark, 7.0 * s, Color("fff0a1"))
		draw_circle(spark, 24.0 * s, Color(1.0, 0.25, 0.02, 0.20))
	elif target_kind == "boss":
		draw_authentic_eye_glow(p,s,target_kind,target_variant)
	elif target_kind == "kitten":
		draw_authentic_eye_glow(p,s,target_kind,target_variant)
	else:
		draw_authentic_eye_glow(p,s,target_kind,target_variant)

func draw_authentic_eye_glow(p: Vector2, s: float, kind: String, variant: String) -> void:
	# Reuse the actual eye pixels from the currently displayed sprite. This keeps
	# every expression, pupil and eyelid identical to the character artwork.
	var texture := MOLE_ARMORED_SPRITE if variant == "armored" else MOLE_SPRITE
	var width := 238.0
	var eye_source := Rect2(154,78,146,76) if variant != "armored" else Rect2(155,96,150,80)
	if kind == "kitten":
		texture = KITTEN_PLAQUE_SPRITE if variant == "plaque" else (KITTEN_CAVITY_SPRITE if variant == "cavity" else KITTEN_SPRITE)
		width = 230.0
		eye_source = Rect2(132,207,82,61) if variant == "plaque" else (Rect2(128,216,86,65) if variant == "cavity" else Rect2(132,204,84,60))
	elif kind == "boss":
		texture = BOSS_SHIELD_SPRITE if variant == "shield" else (BOSS_ENRAGED_SPRITE if variant == "enraged" else BOSS_SPRITE)
		width = 286.0
		eye_source = Rect2(150,164,230,105) if variant != "enraged" else Rect2(155,170,265,115)
	var rise := clampf(target_age / 0.16,0.0,1.0)
	var emerge_scale := lerpf(0.46,1.0,rise)
	var sprite_width := width*s*emerge_scale
	var sprite_height := sprite_width*float(texture.get_height())/float(texture.get_width())
	var bob := sin(target_age*16.0)*3.0
	var bottom := p.y+64.0*s+bob
	var sprite_rect := Rect2(Vector2(p.x-sprite_width*0.5,bottom-sprite_height),Vector2(sprite_width,sprite_height))
	var texture_size := Vector2(texture.get_width(),texture.get_height())
	var eye_rect := Rect2(sprite_rect.position+eye_source.position/texture_size*sprite_rect.size,eye_source.size/texture_size*sprite_rect.size)
	# A soft halo supports the original pixels; the eye image itself stays crisp.
	draw_pixel_ellipse(eye_rect.get_center(),eye_rect.size*Vector2(0.58,0.48),Color(0.15,0.85,1.0,0.12))
	draw_texture_rect_region(texture,eye_rect,eye_source,Color(1.45,1.45,1.45,1.0))

func draw_skill_effect(background_rect: Rect2) -> void:
	var progress := 1.0 - skill_time / 3.0
	var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.018)
	draw_rect(background_rect, Color(0.02, 0.36, 0.48, 0.16 + pulse * 0.08))
	for ring in range(4):
		var radius := 90.0 + fmod(progress * 520.0 + ring * 145.0, 560.0)
		draw_arc(VIEW * 0.5, radius, 0.0, TAU, 64, Color(0.35, 0.95, 1.0, 0.7 - radius / 900.0), 5.0)
	for x in range(80, 1240, 80):
		var drop_y := fmod(float(x * 7) + progress * 900.0, 720.0)
		draw_line(Vector2(x, drop_y - 34), Vector2(x, drop_y), Color(0.6, 1.0, 1.0, 0.72), 3.0)
	draw_rect(Rect2(0, 128, 1280, 72), Color(0.0, 0.08, 0.12, 0.78), true)
	draw_string(font, Vector2(0, 177), "TIME FRACTURE", HORIZONTAL_ALIGNMENT_CENTER, 1280, 38, Color("baffff"))

func draw_mud_projectile() -> void:
	var progress := 1.0 - mud_throw_time / 0.46
	var start := Vector2(HOLES[target_hole].p) + Vector2(0, -70)
	var destination := Vector2(640, 360)
	var p := start.lerp(destination, progress)
	var radius := lerpf(18.0, 86.0, progress)
	draw_circle(p, radius, Color("5a2c17"))
	draw_circle(p + Vector2(-radius*0.22,-radius*0.18), radius*0.32, Color("8a4b25"))

func draw_mud_splatter(background_rect: Rect2) -> void:
	var alpha := clampf(mud_time / 2.0, 0.0, 1.0)
	# Several organic clumps obscure roughly half of the playfield and fade completely in two seconds.
	var clumps := [Vector3(250,210,220), Vector3(560,390,250), Vector3(920,230,230), Vector3(1080,570,210), Vector3(310,610,190)]
	for clump in clumps:
		draw_circle(Vector2(clump.x, clump.y), clump.z, Color(0.17,0.07,0.025,0.88*alpha))
		draw_circle(Vector2(clump.x-35, clump.y-28), clump.z*0.56, Color(0.34,0.16,0.07,0.72*alpha))

func draw_hit_reaction(p: Vector2, s: float, kind: String, age: float) -> void:
	var texture := MOLE_HIT_SPRITE
	var width := 238.0
	var tint := Color.WHITE
	if kind == "bomb":
		texture = BOMB_EXPLOSION_SPRITE
		width = 320.0
	elif kind == "kitten":
		texture = KITTEN_HIT_SPRITE
		width = 230.0
	elif kind == "boss":
		texture = BOSS_HIT_SPRITE
		width = 300.0
	var progress := clampf(age / 0.48, 0.0, 1.0)
	var impact_scale := 0.72 + sin(progress * PI) * (0.58 if kind == "bomb" else 0.24)
	var sprite_width := width * s * impact_scale
	var sprite_height := sprite_width * float(texture.get_height()) / float(texture.get_width())
	var lift := sin(progress * PI) * (18.0 if kind == "bomb" else 10.0) * s
	var bottom := p.y + 48.0 * s - lift
	var alpha := clampf((1.0 - progress) * 1.7, 0.0, 1.0)
	tint.a = alpha
	var rect := Rect2(Vector2(-sprite_width * 0.5, bottom - sprite_height), Vector2(sprite_width, sprite_height))
	draw_texture_rect(texture, rect, false, tint)

func scene_exit_rect() -> Rect2:
	# Anchor to the viewport corner even when the centered playfield has side margins.
	return Rect2(Vector2(24, 24) - position, Vector2(64, 64))

func draw_hud() -> void:
	var exit_rect := scene_exit_rect()
	var p := exit_rect.position
	draw_rect(exit_rect,Color("17100c"),true)
	draw_rect(exit_rect,Color("a86b32"),false,4)
	draw_rect(Rect2(p + Vector2(5,5),Vector2(54,54)),Color("4b2b19"),false,2)
	draw_circle(p + Vector2(9,9),3.0,Color("e4a552"))
	draw_circle(p + Vector2(55,55),3.0,Color("e4a552"))
	draw_rect(Rect2(p + Vector2(16,26),Vector2(31,12)),Color("f0c679"),true)
	draw_rect(Rect2(p + Vector2(10,20),Vector2(12,24)),Color("f0c679"),true)
	draw_rect(Rect2(p + Vector2(4,26),Vector2(12,12)),Color("f0c679"),true)
	draw_rect(Rect2(350,18,580,64),Color("15110e"),true)
	draw_rect(Rect2(350,18,580,64),Color("9b744c"),false,2)
	draw_string(font,Vector2(374,45),"THE NINE BURROWS",HORIZONTAL_ALIGNMENT_LEFT,260,22,Color("f4dfbf"))
	draw_status_icons()
	# Skill energy: a vertical peripheral meter centered at the right edge.
	var catalyst_ready := energy >= 100.0
	var ready_pulse := 0.5+0.5*sin(Time.get_ticks_msec()*0.014)
	var catalyst_border := Color("fff06a") if catalyst_ready else Color("9b744c")
	if catalyst_ready:
		# Layered pulsing borders make the charged ability readable in peripheral vision.
		draw_rect(Rect2(1192,245,70,230),Color(0.18,0.95,1.0,0.10+ready_pulse*0.18),false,6)
		draw_rect(Rect2(1195,248,64,224),Color(1.0,0.86,0.24,0.45+ready_pulse*0.5),false,4)
	draw_rect(Rect2(1198,251,58,218),Color("15110e"),true)
	draw_rect(Rect2(1198,251,58,218),catalyst_border,false,3 if catalyst_ready else 2)
	draw_string(font,Vector2(1207,271),"C",HORIZONTAL_ALIGNMENT_CENTER,40,14,Color("f4dfbf"))
	draw_string(font,Vector2(1207,289),"A",HORIZONTAL_ALIGNMENT_CENTER,40,14,Color("f4dfbf"))
	draw_string(font,Vector2(1207,307),"T",HORIZONTAL_ALIGNMENT_CENTER,40,14,Color("f4dfbf"))
	draw_rect(Rect2(1213,321,28,132),Color("32251f"),true)
	var energy_height := 128.0 * energy / 100.0
	draw_rect(Rect2(1217,449-energy_height,20,energy_height),Color("35d9e6") if energy < 100.0 else Color("ffd34f"),true)
	for marker in range(1,4):
		draw_line(Vector2(1214,321+marker*33),Vector2(1240,321+marker*33),Color("15110e"),2.0)
	if catalyst_ready:
		# The input hint floats outside the left side of the vertical energy frame.
		var hint_y := 337.0+ready_pulse*2.0
		draw_rect(Rect2(1014,hint_y,164,42),Color("24150e"),true)
		draw_rect(Rect2(1014,hint_y,164,42),Color(0.35,0.95,1.0,0.72+ready_pulse*0.28),false,3)
		draw_string(font,Vector2(1026,hint_y+27),"PRESS",HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("fff3b0"))
		draw_rect(Rect2(1082,hint_y+9,78,24),Color("f2d276"),true)
		draw_rect(Rect2(1082,hint_y+9,78,24),Color("fff3b0"),false,2)
		draw_string(font,Vector2(1082,hint_y+27),"SPACE",HORIZONTAL_ALIGNMENT_CENTER,78,12,Color("2b1a12"))
	if target_kind == "boss" and boss_hp > 0:
		draw_rect(Rect2(470,90,340,28),Color("15110e"),true)
		draw_rect(Rect2(475,103,330,9),Color("3a1a18"),true)
		draw_rect(Rect2(475,103,330 * boss_hp / 6.0,9),Color("e14937"),true)
		draw_string(font,Vector2(490,101),"MOLE KING  PHASE %d" % (1 if boss_hp > 4 else (2 if boss_hp > 2 else 3)),HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("f4dfbf"))
	if is_blackout_active():
		draw_string(font,Vector2(0,145),"BLACKOUT — FOLLOW THE GLOW",HORIZONTAL_ALIGNMENT_CENTER,1280,18,Color("65f4ff"))
	if skill_time > 0.0:
		draw_string(font,Vector2(0,172),"TIME FREEZE  x2 SCORE",HORIZONTAL_ALIGNMENT_CENTER,1280,18,Color("ffd34f"))
	if feedback_age < 0.7 and feedback != "":
		var alpha := 1.0 - feedback_age / 0.7
		draw_string(font,feedback_pos,feedback,HORIZONTAL_ALIGNMENT_CENTER,180,28,Color(1.0,0.79,0.32,alpha))
	if not playing:
		draw_result_panel()

func draw_status_icons() -> void:
	# Score: a gold ore icon followed by a visual progress rail.
	draw_pixel_star(Vector2(390,63), 11.0, Color("ffd34f"))
	for i in range(8):
		var filled := score >= (i + 1) * 35
		draw_rect(Rect2(410 + i*17,55,13,10), Color("ffbd38") if filled else Color("463429"), true)
	# Combo: the flame grows brighter and gains sparks as the streak climbs.
	draw_pixel_flame(Vector2(570,62), 11.0, Color("ff6138") if combo > 0 else Color("4b342c"))
	for i in range(5):
		draw_circle(Vector2(590 + i*15,60), 4.0, Color("ff8d2b") if combo >= (i + 1) * 4 else Color("463429"))
	# Hearts are instantly readable without a label or number.
	for i in range(3):
		draw_pixel_heart(Vector2(703 + i*28,60), 8.0, Color("ff5570") if i < hearts else Color("3b292b"))
	# Clock face drains clockwise. During the boss fight it glows and remains frozen.
	var clock_center := Vector2(830,60)
	draw_circle(clock_center,13.0,Color("dfc08d"),false,3.0)
	draw_line(clock_center,clock_center+Vector2(0,-8),Color("dfc08d"),2.0)
	var time_ratio := clampf(time_left / ROUND_TIME,0.0,1.0)
	draw_arc(clock_center,17.0,-PI*0.5,-PI*0.5+TAU*time_ratio,24,Color("57e5ef") if time_left <= 10.0 and boss_hp > 0 else Color("f2aa45"),4.0)

func draw_pixel_heart(center: Vector2, size: float, color: Color) -> void:
	var points := PackedVector2Array([
		center+Vector2(-size, -size*0.35), center+Vector2(-size*0.65,-size),
		center+Vector2(0,-size*0.52), center+Vector2(size*0.65,-size),
		center+Vector2(size,-size*0.35), center+Vector2(0,size)
	])
	draw_colored_polygon(points,color)

func draw_pixel_star(center: Vector2, radius: float, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(10):
		var r := radius if i % 2 == 0 else radius * 0.43
		var angle := -PI*0.5 + i*PI/5.0
		points.append(center+Vector2(cos(angle),sin(angle))*r)
	draw_colored_polygon(points,color)

func draw_pixel_flame(center: Vector2, size: float, color: Color) -> void:
	var points := PackedVector2Array([
		center+Vector2(0,-size),center+Vector2(size*0.75,-size*0.1),
		center+Vector2(size*0.48,size),center+Vector2(-size*0.55,size*0.82),
		center+Vector2(-size*0.75,0),center+Vector2(-size*0.2,size*0.18)
	])
	draw_colored_polygon(points,color)

func draw_result_panel() -> void:
	# A full illustrated treasure frame gives the result screen the same visual
	# density and materials as the mine instead of looking like a flat dialog.
	var frame_rect := Rect2(190,60,900,600)
	draw_texture_rect(RESULT_PANEL_SPRITE,frame_rect,false)
	var won := boss_defeated
	var title := "CAVERN CONQUERED" if won else "EXPEDITION FAILED"
	var title_color := Color("ffe6a0") if won else Color("ff9b83")
	draw_string(font,Vector2(0,220),title,HORIZONTAL_ALIGNMENT_CENTER,1280,42,title_color)
	draw_string(font,Vector2(0,258),"THE MOLE KING HAS FALLEN" if won else "THE MOLE KING STILL RULES",HORIZONTAL_ALIGNMENT_CENTER,1280,17,Color("a8ecf3"))
	# Three framed sockets: final score, converted outside coins, and XP.
	draw_pixel_star(Vector2(510,426),28.0,Color("ffd34f"))
	draw_string(font,Vector2(470,482),str(score),HORIZONTAL_ALIGNMENT_CENTER,80,27,Color("fff0c7"))
	draw_coin_icon(Vector2(640,426),28.0,Color("ffb931") if won else Color("65503c"))
	draw_string(font,Vector2(600,482),str(floori(score / 10.0) if won else 0),HORIZONTAL_ALIGNMENT_CENTER,80,27,Color("fff0c7"))
	draw_pixel_flame(Vector2(770,426),27.0,Color("53eeff") if won else Color("4b4b50"))
	draw_string(font,Vector2(730,482),"20" if won else "0",HORIZONTAL_ALIGNMENT_CENTER,80,27,Color("fff0c7"))
	draw_string(font,Vector2(0,558),"CLAIM & PLAY AGAIN" if won else "RETURN TO THE BURROWS",HORIZONTAL_ALIGNMENT_CENTER,1280,22,Color("fff0c7"))

func draw_coin_icon(center: Vector2, radius: float, color: Color) -> void:
	draw_circle(center,radius,color)
	draw_circle(center,radius-6.0,Color("6f3517"),false,4.0)
	draw_rect(Rect2(center-Vector2(5,10),Vector2(10,20)),Color("fff0a5"),true)
