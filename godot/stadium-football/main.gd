extends Node3D
const MatchRules = preload("res://match.gd")
const TEAM_NAMES := ["MALLOW", "SILVERBELT"]
const TEAM_SHEETS := [preload("res://art/mallow-spritesheet.webp"), preload("res://art/silverbelt-spritesheet.webp")]
const BLUE := Color("2687b8")
const GOLD := Color("e8af45")
const CREAM := Color("fff1cb")
var game = MatchRules.new()
var cat_nodes: Array[Node3D] = []
var cat_sprites: Array[Sprite3D] = []
var cat_atlases: Array[AtlasTexture] = []
var cat_visuals: Array[Node3D] = []
var ball_node: Node3D
var selection_arrow: Sprite3D
var camera: Camera3D
var ui: Control
var menu: PanelContainer
var pause_panel: PanelContainer
var result_panel: PanelContainer
var score_label: Label
var clock_label: Label
var announcement: Label
var possession_label: Label
var stamina_bar: ProgressBar
var shot_bar: ProgressBar
var minimap: Control
var stadium_backdrop: Sprite3D
var started := false
var settled := false
var touch_move := Vector2.ZERO
var touch_shoot := false
var touch_sprint := false
var input_aim := Vector2.ZERO
var match_id := ""
var phase_before_pause := "playing"
var web_callback
var audio: AudioStreamPlayer
var anim_time := 0.0
var selection_label: Label
var ball_shadow: MeshInstance3D
var charging_cat := -1

func _ready() -> void:
	build_world()
	build_cats()
	build_ui()
	audio = AudioStreamPlayer.new()
	add_child(audio)
	if OS.has_feature("web"):
		web_callback = JavaScriptBridge.create_callback(on_host_message)
		JavaScriptBridge.get_interface("window").pawLeagueCommand = web_callback
		JavaScriptBridge.eval("window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&window.pawLeagueCommand)window.pawLeagueCommand(JSON.stringify(e.data));});")
		bridge({"type":"FOOTBALL_READY"})
	update_visuals(0)

func material(color: Color, unshaded := false) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.85
	if unshaded: mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return mat

func box(parent: Node3D, size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = material(color)
	node.position = pos
	parent.add_child(node)
	return node

func sphere(parent: Node3D, radius: float, height: float, pos: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = height
	mesh.radial_segments = 12
	mesh.rings = 6
	node.mesh = mesh
	node.material_override = material(color)
	node.position = pos
	parent.add_child(node)
	return node

func stripe(a: Vector3, b: Vector3, width := 0.09, color := CREAM) -> void:
	var node := box(self, Vector3(width, 0.025, a.distance_to(b)), (a + b) * 0.5, color)
	node.look_at(b, Vector3.UP)

func circle(center: Vector3, radius: float, color := CREAM, count := 64) -> void:
	for i in range(count):
		var a := TAU * i / count
		var b := TAU * (i + 1) / count
		stripe(center + Vector3(cos(a),0,sin(a)) * radius, center + Vector3(cos(b),0,sin(b)) * radius, 0.09, color)

# The simulation retains its 3D ball height. An orthographic 3D stage aligns
# original pixel sprites to the stadium artwork, without lighting/recolouring them.
func pitch_position(point: Vector2, height := 0.0) -> Vector3:
	var t := (point.y + 13.0) / 26.0
	var depth := t / (1.0 + 0.18 * (1.0 - t))
	var left := lerpf(334.0,188.0,depth)
	var right := lerpf(1340.0,1485.0,depth)
	var px := lerpf(left,right,(point.x+22.0)/44.0)
	var py := lerpf(285.0,727.0,depth)
	return Vector3((px-836.0)*58.0/1672.0,height,(py-470.5)*58.0/1672.0*sqrt(2.0))

func pixel_sprite(texture: Texture2D, pixel_size: float) -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.texture = texture
	sprite.pixel_size = pixel_size
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.shaded = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	return sprite

func build_world() -> void:
	var env := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("243b2a")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_energy = 0.8
	env.environment = settings
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55,-25,0)
	sun.light_energy = 0.4
	add_child(sun)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_WIDTH
	camera.size = 58.0
	camera.position = Vector3(0,35,35)
	camera.far = 160
	add_child(camera)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	stadium_backdrop = pixel_sprite(preload("res://art/stadium-pixel.png"),58.0/1672.0)
	stadium_backdrop.position = camera.position - camera.global_basis.z * 80.0
	add_child(stadium_backdrop)
	ball_node = Node3D.new()
	add_child(ball_node)
	ball_shadow = sphere(self,0.28,0.015,Vector3.ZERO,Color("537333"))
	sphere(ball_node,0.30,0.60,Vector3.ZERO,CREAM)
	for p in [Vector3(0,0.28,0),Vector3(0,0,0.28),Vector3(0,0,-0.28),Vector3(0.28,0,0),Vector3(-0.28,0,0)]:
		var patch := box(ball_node,Vector3(0.16,0.16,0.06),p,Color("252d2b"))
		if p.y > 0: patch.rotation.x = PI/2
		elif p.x != 0: patch.rotation.y = PI/2
	# Pixel arrow points down to the currently controlled cat; no ground ring.
	var arrow := Image.create(20,24,false,Image.FORMAT_RGBA8)
	arrow.fill(Color.TRANSPARENT)
	for y in range(2,22):
		for x in range(1,19):
			var inside := (y<12 and x>=6 and x<=13) or (y>=12 and absi(x-10)<=21-y)
			if inside: arrow.set_pixel(x,y,Color("382915"))
	for y in range(4,20):
		for x in range(3,17):
			var inside := (y<12 and x>=8 and x<=11) or (y>=12 and absi(x-10)<=19-y)
			if inside: arrow.set_pixel(x,y,CREAM if y<7 else GOLD)
	selection_arrow = pixel_sprite(ImageTexture.create_from_image(arrow),0.055)
	add_child(selection_arrow)

func build_cats() -> void:
	for old in cat_nodes: old.queue_free()
	cat_nodes.clear()
	cat_visuals.clear()
	cat_sprites.clear()
	cat_atlases.clear()
	for i in range(6):
		var root := Node3D.new()
		add_child(root)
		cat_nodes.append(root)
		var visual := Node3D.new()
		root.add_child(visual)
		cat_visuals.append(visual)
		var atlas := AtlasTexture.new()
		atlas.atlas = TEAM_SHEETS[0 if i<3 else 1]
		atlas.region = Rect2(0,208 if i<3 else 416,192,208)
		atlas.filter_clip = true
		cat_atlases.append(atlas)
		var sprite := pixel_sprite(atlas,0.016)
		sprite.offset = Vector2(0,76)
		visual.add_child(sprite)
		cat_sprites.append(sprite)
		var tag := Label3D.new()
		tag.text = str(i%3+1) + (" GK" if i%3==2 else "")
		tag.font = preload("res://art/Quadrit.ttf")
		tag.font_size = 32
		tag.pixel_size = 0.009
		tag.position = Vector3(0,0.15,0.05)
		tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		tag.modulate = BLUE.lightened(0.3) if i<3 else GOLD
		root.add_child(tag)
func style_box(bg: Color, border := Color("b8a477")) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(2)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	return style

func label(text: String, size := 20) -> Label:
	var node := Label.new()
	node.text = text
	node.add_theme_font_override("font",preload("res://art/Quadrit.ttf"))
	node.add_theme_font_size_override("font_size",size)
	node.add_theme_color_override("font_color",CREAM)
	return node

func button(text: String, action: Callable, min_size := Vector2(160,48)) -> Button:
	var node := Button.new()
	node.text = text
	node.custom_minimum_size = min_size
	node.add_theme_font_override("font",preload("res://art/Quadrit.ttf"))
	node.add_theme_font_size_override("font_size",19)
	node.add_theme_stylebox_override("normal",style_box(Color("243e37")))
	node.add_theme_stylebox_override("hover",style_box(Color("3b5b47"),GOLD))
	node.add_theme_stylebox_override("pressed",style_box(Color("786137"),GOLD))
	node.add_theme_color_override("font_color",CREAM)
	node.focus_mode = Control.FOCUS_NONE
	node.pressed.connect(action)
	return node

func centered_panel(width: float) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.offset_left = -width/2
	panel.offset_right = width/2
	panel.offset_top = -230
	panel.offset_bottom = 230
	panel.add_theme_stylebox_override("panel",style_box(Color(0.08,0.15,0.13,0.97)))
	ui.add_child(panel)
	return panel

func build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	ui = Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(ui)
	var score_card := Panel.new()
	score_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	score_card.position = Vector2(-200,10)
	score_card.size = Vector2(400,85)
	score_card.add_theme_stylebox_override("panel",style_box(Color(0.08,0.15,0.13,0.9)))
	ui.add_child(score_card)
	var back := button("<  STADIUM",func(): bridge({"type":"FOOTBALL_CLOSE"}),Vector2(145,44))
	back.position = Vector2(20,18)
	ui.add_child(back)
	var pause := button("II  PAUSE",toggle_pause,Vector2(130,44))
	pause.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	pause.position = Vector2(-150,18)
	ui.add_child(pause)
	score_label = label("HOME   0  :  0   AWAY",28)
	score_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	score_label.position = Vector2(-180,18)
	score_label.size = Vector2(360,38)
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(score_label)
	clock_label = label("03:00",20)
	clock_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	clock_label.position = Vector2(-110,58)
	clock_label.size = Vector2(220,28)
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(clock_label)
	announcement = label("",44)
	announcement.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	announcement.position = Vector2(-320,-70)
	announcement.size = Vector2(640,110)
	announcement.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	announcement.add_theme_color_override("font_shadow_color",Color("192924"))
	announcement.add_theme_constant_override("shadow_offset_x",3)
	announcement.add_theme_constant_override("shadow_offset_y",3)
	ui.add_child(announcement)
	var meter_card := Panel.new()
	meter_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	meter_card.position = Vector2(-205,-95)
	meter_card.size = Vector2(410,88)
	meter_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter_card.add_theme_stylebox_override("panel",style_box(Color(0.08,0.15,0.13,0.94)))
	ui.add_child(meter_card)
	possession_label = label("",17)
	possession_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	possession_label.position = Vector2(-200,-83)
	possession_label.size = Vector2(400,30)
	possession_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(possession_label)
	stamina_bar = ProgressBar.new()
	stamina_bar.show_percentage = false
	stamina_bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	stamina_bar.position = Vector2(-140,-49)
	stamina_bar.size = Vector2(280,12)
	stamina_bar.add_theme_stylebox_override("fill",style_box(BLUE,BLUE))
	ui.add_child(stamina_bar)
	shot_bar = ProgressBar.new()
	shot_bar.show_percentage = false
	shot_bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	shot_bar.position = Vector2(-140,-30)
	shot_bar.size = Vector2(280,10)
	shot_bar.add_theme_stylebox_override("fill",style_box(GOLD,GOLD))
	ui.add_child(shot_bar)
	menu = centered_panel(620)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",12)
	menu.add_child(column)
	var title := label("PAW LEAGUE",38)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	var subtitle := label("3v3  /  STADIUM CLUB  /  THREE MINUTES",16)
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(subtitle)
	selection_label = label("LEFT: MALLOW  /  RIGHT: SILVERBELT",17)
	selection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(selection_label)
	var teams := HBoxContainer.new()
	teams.alignment = BoxContainer.ALIGNMENT_CENTER
	teams.add_theme_constant_override("separation",64)
	column.add_child(teams)
	for i in range(2):
		var team := VBoxContainer.new()
		teams.add_child(team)
		var portrait := TextureRect.new()
		var atlas := AtlasTexture.new()
		atlas.atlas = TEAM_SHEETS[i]
		atlas.region = Rect2(0,208 if i==0 else 416,192,208)
		portrait.texture = atlas
		portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		portrait.custom_minimum_size = Vector2(115,125)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		team.add_child(portrait)
		var team_name := label(TEAM_NAMES[i],18)
		team_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		team_name.modulate = BLUE.lightened(0.4) if i==0 else GOLD
		team.add_child(team_name)
	column.add_child(label("WASD / arrows  Move     Shift  Sprint\nJ  Pass / switch     Hold K  Aim + shoot / tackle\nEsc  Pause     Touch controls available below",18))
	column.add_child(label("Attack the RIGHT goal. No offside. Walls rebound.\nA tied game gets 30 seconds of golden-goal extra time.",16))
	column.add_child(button("KICK OFF",start_match,Vector2(560,52)))
	pause_panel = centered_panel(510)
	pause_panel.hide()
	var pause_column := VBoxContainer.new()
	pause_column.add_theme_constant_override("separation",24)
	pause_panel.add_child(pause_column)
	pause_column.add_child(label("HALF-TIME BREATHER",30))
	pause_column.add_child(label("J: pass to a teammate, or switch when defending.\nK: hold to charge a shot; release to strike.\nAim with movement. More power means less accuracy.\nWithout the ball, K tackles in front of your cat.\nSprint drains stamina; walking restores it.\nGoalkeepers save and distribute automatically.",18))
	pause_column.add_child(button("BACK TO THE PITCH",toggle_pause))
	result_panel = centered_panel(540)
	result_panel.hide()
	# Touch controls also make the controls discoverable on desktop.
	var pad := GridContainer.new()
	pad.columns = 3
	pad.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	pad.position = Vector2(20,-165)
	ui.add_child(pad)
	for direction in [Vector2.ZERO,Vector2.UP,Vector2.ZERO,Vector2.LEFT,Vector2.ZERO,Vector2.RIGHT,Vector2.ZERO,Vector2.DOWN,Vector2.ZERO]:
		if direction == Vector2.ZERO:
			var spacer := Control.new()
			spacer.custom_minimum_size = Vector2(42,42)
			pad.add_child(spacer)
		else:
			var move_button := button("W" if direction==Vector2.UP else ("S" if direction==Vector2.DOWN else ("A" if direction==Vector2.LEFT else "D")),func():pass,Vector2(42,42))
			move_button.button_down.connect(func():touch_move += direction)
			move_button.button_up.connect(func():touch_move -= direction)
			pad.add_child(move_button)
	var actions := HBoxContainer.new()
	actions.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	actions.position = Vector2(-290,-90)
	ui.add_child(actions)
	actions.add_child(button("J\nPASS",pass_or_switch,Vector2(86,60)))
	var shoot_button := button("K\nSHOOT",func():pass,Vector2(86,60))
	shoot_button.button_down.connect(func(): touch_shoot = true; begin_shot_or_tackle())
	shoot_button.button_up.connect(func(): touch_shoot = false; release_shot())
	actions.add_child(shoot_button)
	var sprint_button := button("SPRINT",func():pass,Vector2(86,60))
	sprint_button.button_down.connect(func():touch_sprint = true)
	sprint_button.button_up.connect(func():touch_sprint = false)
	actions.add_child(sprint_button)

func update_selection() -> void:
	selection_label.text = "LEFT: MALLOW  /  RIGHT: SILVERBELT"

func start_match() -> void:
	game = MatchRules.new(Time.get_ticks_msec())
	started = true
	settled = false
	charging_cat = -1
	match_id = str(Time.get_unix_time_from_system()) + "-" + str(Time.get_ticks_usec())
	menu.hide()
	result_panel.hide()
	pause_panel.hide()
	bridge({"type":"FOOTBALL_STARTED","matchId":match_id})
	play_tone(680,0.15)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and not event.echo:
		if event.pressed:
			match event.physical_keycode:
				KEY_ESCAPE: toggle_pause()
				KEY_J: pass_or_switch()
				KEY_K:
					begin_shot_or_tackle()
		elif event.physical_keycode == KEY_K: release_shot()

func pass_or_switch() -> void:
	if not started or game.state != "playing": return
	if game.owner == game.controlled:
		game.pass_ball(game.controlled)
		play_tone(420,0.05)
	else: game.switch_player()

func begin_shot_or_tackle() -> void:
	if not started or game.state != "playing": return
	if game.owner == game.controlled:
		charging_cat = game.controlled
		game.shot_charge = 0
	else:
		charging_cat = -1
		game.tackle(game.controlled)

func release_shot() -> void:
	if not started or game.state != "playing": return
	if charging_cat == game.controlled and game.shoot(game.controlled, game.shot_charge, input_aim): play_tone(250,0.1)
	charging_cat = -1
	game.shot_charge = 0

func toggle_pause() -> void:
	if not started or game.state == "finished": return
	if game.state == "paused":
		game.state = phase_before_pause
		pause_panel.hide()
	else:
		phase_before_pause = game.state
		game.state = "paused"
		game.shot_charge = 0
		charging_cat = -1
		touch_move = Vector2.ZERO
		touch_shoot = false
		touch_sprint = false
		pause_panel.show()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and started and game.state != "paused" and game.state != "finished": toggle_pause()

func _process(delta: float) -> void:
	anim_time += delta
	if started:
		input_aim = touch_move + Vector2(
			float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT)),
			float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)))
		if game.state == "playing" and game.owner == charging_cat and game.controlled == charging_cat and (touch_shoot or Input.is_physical_key_pressed(KEY_K)):
			game.shot_charge = minf(game.shot_charge + delta/1.1,1)
		var before: String = game.state
		game.step(minf(delta,0.04),input_aim,touch_sprint or Input.is_physical_key_pressed(KEY_SHIFT))
		if game.owner != charging_cat:
			charging_cat = -1
			game.shot_charge = 0
		if game.state == "goal" and before != "goal": play_tone(850,0.3)
		if game.state == "finished" and not settled: show_result()
	update_visuals(delta)

func update_visuals(delta: float) -> void:
	for i in range(6):
		var cat: Dictionary = game.cats[i]
		cat_nodes[i].position = pitch_position(cat.pos)
		var moving: bool = started and game.state == "playing" and cat.velocity.length() > 0.2
		var row := 1 if cat.heading.x >= 0 else 2
		var frame := int(anim_time * (8.0 if cat.velocity.length()<6.0 else 11.0) + i*2) % 8 if moving else 0
		# These are the original eight-frame left/right cycles, with real paw motion.
		cat_atlases[i].region = Rect2(frame*192,row*208,192,208)
		cat_visuals[i].position.y = 0.10*sin(cat.kick*PI/0.4) if cat.kick>0 else 0.0
	ball_node.position = pitch_position(Vector2(game.ball.x,game.ball.z),game.ball.y*0.75)
	ball_shadow.position = pitch_position(Vector2(game.ball.x,game.ball.z),0.01)
	ball_node.rotate_z(-game.ball_velocity.x*delta)
	ball_node.rotate_x(game.ball_velocity.z*delta)
	selection_arrow.position = cat_nodes[game.controlled].position + Vector3(0,3.8+sin(anim_time*3)*0.08,0)
	selection_arrow.visible = started
	score_label.text = "HOME   %d  :  %d   AWAY" % [game.score[0],game.score[1]]
	var remaining := ceili((210 if game.overtime else 180) - game.elapsed)
	clock_label.text = ("GOLDEN GOAL  " if game.overtime else "") + "%02d:%02d" % [remaining/60,remaining%60]
	stamina_bar.value = game.cats[game.controlled].stamina
	shot_bar.value = game.shot_charge*100
	possession_label.text = TEAM_NAMES[0] + "  /  " + ("YOUR BALL  >" if game.owner==game.controlled else "ATTACK THE RIGHT GOAL  >")
	announcement.text = str(ceili(game.phase_time)) if started and game.state == "countdown" else ("HOME GOAL!" if game.goal_team == 0 else "AWAY GOAL!") if game.state == "goal" else ""
	if not started: possession_label.text = ""

func show_result() -> void:
	settled = true
	bridge({"type":"FOOTBALL_COMPLETE","matchId":match_id,"elapsedSeconds":game.elapsed,"homeGoals":game.score[0],"awayGoals":game.score[1]})
	for child in result_panel.get_children(): child.queue_free()
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",22)
	result_panel.add_child(column)
	column.add_child(label("FULL TIME",18))
	column.add_child(label("VICTORY" if game.score[0]>game.score[1] else ("DRAW" if game.score[0]==game.score[1] else "NEXT MATCH IS YOURS"),30))
	column.add_child(label("HOME  %d  :  %d  AWAY" % [game.score[0],game.score[1]],32))
	column.add_child(label("%d passes    %d shots    %d tackles" % [game.passes,game.shots,game.tackles],18))
	var coins := 50 + (30 if game.score[0]>game.score[1] else 10 if game.score[0]==game.score[1] else 0) + mini(game.score[0],10)*5
	column.add_child(label("+%d COINS   /   +%d XP" % [coins,25+(15 if game.score[0]>game.score[1] else 0)],22))
	column.add_child(button("PLAY AGAIN",start_match))
	column.add_child(button("RETURN TO STADIUM",func():bridge({"type":"FOOTBALL_CLOSE"})))
	result_panel.show()
	play_tone(600,0.25)

func bridge(message: Dictionary) -> void:
	if not OS.has_feature("web"): return
	message.source = "pet-function:stadium-football"
	JavaScriptBridge.eval("parent.postMessage("+JSON.stringify(message)+",location.origin)")

func on_host_message(args: Array) -> void:
	if args.is_empty(): return
	var message = JSON.parse_string(str(args[0]))
	if not message is Dictionary: return
	if message.get("type") == "FOOTBALL_PAUSE" and started and game.state != "paused": toggle_pause()

func play_tone(frequency: float, duration: float) -> void:
	var sound := AudioStreamWAV.new()
	sound.format = AudioStreamWAV.FORMAT_16_BITS
	sound.mix_rate = 22050
	var bytes := PackedByteArray()
	bytes.resize(int(duration*22050)*2)
	for i in range(bytes.size()/2):
		var sample := int(sin(i*TAU*frequency/22050)*5000*(1-float(i)/(bytes.size()/2)))
		bytes.encode_s16(i*2,sample)
	sound.data = bytes
	audio.stream = sound
	audio.play()
