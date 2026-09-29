extends Node2D

const ROUND_TIME := 35.0
const VIEW := Vector2(1280, 720)
const MINE_BACKGROUND: Texture2D = preload("res://assets/backgrounds/mine-cavern-v6.png")
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
var target_age := 0.0
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
var font: Font
var reward_sent := false

func _ready() -> void:
	rng.randomize()
	font = ThemeDB.fallback_font
	queue_redraw()

func _process(delta: float) -> void:
	if playing:
		time_left = maxf(0.0, time_left - delta)
		if time_left <= 0.0 or hearts <= 0:
			playing = false
			send_completion()
		target_age += delta
		if target_hole < 0:
			spawn_delay -= delta
			if spawn_delay <= 0.0:
				spawn_target()
		elif target_age > (0.72 if time_left > 8.0 else 0.42):
			target_hole = -1
			combo = 0
			spawn_delay = rng.randf_range(0.16, 0.42)
	shake = maxf(0.0, shake - delta * 5.0)
	flash = maxf(0.0, flash - delta * 4.5)
	feedback_age += delta
	for particle in particles:
		particle.p += particle.v * delta
		particle.v.y += 420.0 * delta
		particle.life -= delta
	particles = particles.filter(func(item): return item.life > 0.0)
	queue_redraw()

func spawn_target() -> void:
	target_hole = rng.randi_range(0, 8)
	target_age = 0.0
	var roll := rng.randf()
	target_kind = "gold" if roll < 0.14 else ("kitten" if roll < 0.27 else ("bomb" if roll < 0.39 else "mole"))
	if time_left <= 8.0:
		target_kind = "boss"

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		post_to_host("close")
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if Rect2(22, 22, 156, 54).has_point(event.position):
			post_to_host("close")
			return
		if not playing:
			reset_game()
			return
		for i in range(HOLES.size()):
			var hole: Dictionary = HOLES[i]
			var radius := Vector2(112.0, 48.0) * float(hole.s)
			var local_position: Vector2 = (event.position - Vector2(hole.p)) / radius
			if local_position.length_squared() <= 1.0:
				hit_hole(i)
				return

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
	if target_kind == "kitten" or target_kind == "bomb":
		hearts -= 1
		score = maxi(0, score - (20 if target_kind == "bomb" else 10))
		combo = 0
		feedback = "BOOM -20" if target_kind == "bomb" else "OUCH -10"
	else:
		combo += 1
		var multiplier := 4 if combo >= 20 else (3 if combo >= 10 else (2 if combo >= 5 else 1))
		var points := (40 if target_kind == "gold" else (25 if target_kind == "boss" else 10)) * multiplier
		score += points
		feedback = "+%d" % points
	target_hole = -1
	spawn_delay = rng.randf_range(0.12, 0.35)

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
	spawn_delay = 0.35
	reward_sent = false
	post_to_host("game-started")

func send_completion() -> void:
	if reward_sent:
		return
	reward_sent = true
	var coins := clampi(score / 12, 3, 30)
	var xp := clampi(score / 8, 5, 40)
	post_to_host("game-complete", {"score": score, "coins": coins, "xp": xp})

func post_to_host(event_type: String, details: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	var payload := {"source": "pet-function:mole-game", "type": event_type}
	for key in details:
		payload[key] = details[key]
	var script := "window.parent.postMessage(%s, window.location.origin);" % JSON.stringify(payload)
	JavaScriptBridge.eval(script)

func _draw() -> void:
	var offset := Vector2(rng.randf_range(-9, 9), rng.randf_range(-6, 6)) * shake
	draw_set_transform(offset)
	# Full pixel-art environment: deep mine tunnel, side walls, timber supports and
	# a readable dirt playfield. Interactive objects remain separate draw layers.
	draw_texture_rect(MINE_BACKGROUND, Rect2(Vector2.ZERO, VIEW), false)
	# A restrained foreground vignette ties the holes into the darker cave edges.
	draw_rect(Rect2(0, 0, 1280, 18), Color(0.03, 0.02, 0.015, 0.72))
	draw_rect(Rect2(0, 0, 20, 720), Color(0.03, 0.02, 0.015, 0.56))
	draw_rect(Rect2(1260, 0, 20, 720), Color(0.03, 0.02, 0.015, 0.56))
	# Nine perspective holes.
	for i in range(HOLES.size()):
		draw_hole(i)
	for particle in particles:
		draw_rect(Rect2(particle.p, Vector2(particle.size, particle.size)), Color("d78a43"))
	draw_hud()
	if flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, VIEW), Color(1.0,0.65,0.22,flash * 0.22))
	draw_set_transform(Vector2.ZERO)

func draw_hole(index: int) -> void:
	var hole: Dictionary = HOLES[index]
	var p := Vector2(hole.p)
	var s := float(hole.s)
	draw_set_transform(p, float(hole.r), Vector2.ONE)
	# Layered soil and broken rim make each opening feel cut into the mine floor.
	draw_pixel_ellipse(Vector2(0, 8*s), Vector2(124, 55) * s, Color(0.08, 0.04, 0.025, 0.58))
	draw_pixel_ellipse(Vector2.ZERO, Vector2(118, 52) * s, Color("382015"))
	draw_pixel_ellipse(Vector2(0,-5*s), Vector2(101, 39) * s, Color("030202"))
	draw_arc(Vector2(0, 1*s), 108*s, 0.08, 3.06, 18, Color("b16f38"), 8*s)
	draw_arc(Vector2(0, -3*s), 99*s, 3.22, 6.12, 18, Color("5a311d"), 5*s)
	for chip in [Vector2(-91, 28), Vector2(-58, 43), Vector2(66, 39), Vector2(93, 21)]:
		draw_rect(Rect2(chip * s, Vector2(9, 6) * s), Color("8c502a"))
	if target_hole == index:
		var rise := clampf(target_age / 0.16, 0.0, 1.0)
		var bob := sin(target_age * 16.0) * 3.0
		draw_target(Vector2(0, 26*s - 88*s*rise + bob), s, target_kind)
	draw_set_transform(Vector2.ZERO)

func draw_pixel_ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(24):
		var angle := TAU * float(i) / 24.0
		points.append(center + Vector2(cos(angle)*radius.x, sin(angle)*radius.y))
	draw_polygon(points, PackedColorArray([color]))

func draw_target(p: Vector2, s: float, kind: String) -> void:
	if kind == "bomb":
		draw_circle(p, 38*s, Color("17151a")); draw_line(p+Vector2(18,-30)*s,p+Vector2(36,-52)*s,Color("f0b339"),6*s); return
	var fur := Color("9a6848")
	if kind == "gold": fur = Color("e4aa32")
	if kind == "boss": fur = Color("8d3f32")
	if kind == "kitten": fur = Color("d1c8bd")
	draw_circle(p, 45*s, Color("25150f"))
	draw_circle(p, 40*s, fur)
	draw_circle(p+Vector2(-14,-5)*s,7*s,Color("17110e")); draw_circle(p+Vector2(14,-5)*s,7*s,Color("17110e"))
	draw_circle(p+Vector2(-12,-8)*s,2.2*s,Color.WHITE); draw_circle(p+Vector2(16,-8)*s,2.2*s,Color.WHITE)
	draw_circle(p+Vector2(0,12)*s,6*s,Color("3a211b"))
	if kind == "boss":
		draw_polygon(PackedVector2Array([p+Vector2(-34,-36)*s,p+Vector2(-24,-67)*s,p+Vector2(-7,-47)*s,p+Vector2(7,-70)*s,p+Vector2(23,-47)*s,p+Vector2(35,-66)*s,p+Vector2(34,-34)*s]),PackedColorArray([Color("f2bd3f")]))

func draw_hud() -> void:
	draw_rect(Rect2(22,22,156,54),Color("15110e"),true)
	draw_rect(Rect2(22,22,156,54),Color("9b744c"),false,2)
	draw_string(font,Vector2(42,56),"<  OUTSIDE",HORIZONTAL_ALIGNMENT_LEFT,-1,18,Color("f4dfbf"))
	draw_rect(Rect2(350,18,580,64),Color("15110e"),true)
	draw_rect(Rect2(350,18,580,64),Color("9b744c"),false,2)
	draw_string(font,Vector2(374,45),"THE NINE BURROWS",HORIZONTAL_ALIGNMENT_LEFT,260,22,Color("f4dfbf"))
	draw_string(font,Vector2(374,68),"SCORE %d    COMBO %d    HEARTS %d    TIME %02d" % [score,combo,hearts,ceili(time_left)],HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("d8b788"))
	if feedback_age < 0.7 and feedback != "":
		var alpha := 1.0 - feedback_age / 0.7
		draw_string(font,feedback_pos,feedback,HORIZONTAL_ALIGNMENT_CENTER,180,28,Color(1.0,0.79,0.32,alpha))
	if not playing:
		draw_rect(Rect2(Vector2.ZERO,VIEW),Color(0.02,0.01,0.01,0.72))
		draw_string(font,Vector2(0,310),"HUNT COMPLETE",HORIZONTAL_ALIGNMENT_CENTER,1280,54,Color("f0c57e"))
		draw_string(font,Vector2(0,370),"FINAL SCORE  %d" % score,HORIZONTAL_ALIGNMENT_CENTER,1280,28,Color.WHITE)
		draw_string(font,Vector2(0,420),"CLICK TO DESCEND AGAIN",HORIZONTAL_ALIGNMENT_CENTER,1280,18,Color("d39b59"))
