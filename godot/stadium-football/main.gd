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
var cat_animation_phase := [0.0,0.0,0.0,0.0,0.0,0.0]
var ball_node: Node3D
var selection_arrow: Sprite3D
var camera: Camera3D
var ui: Control
var pause_panel: PanelContainer
var result_panel: Control
var result_backdrop: ColorRect
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
var ball_shadow: MeshInstance3D
var charging_cat := -1
var shot_guide: Control
var ball_marker: TextureRect
var ball_tag: Label
var ball_textures: Array[Texture2D] = []
var ball_ring_color := Color("ffdf54")
var possession_feedback_label: Label
var feedback_time := 0.0
var seen_possession_serial := 0
var body_bounds_cache := {}
var body_sheet_images := {}
var action_hint: Label
var shoot_button: Button
var pass_button: Button
var energy_hud: Control
var prompt_hud: Control
var prompt_title: Label
var prompt_key: Label
var back_button: Button
var pause_button: Button
var entry_initialized := false
var tutorial_step := -1
var tutorial_success_time := 0.0
var tutorial_success_step := -1
var tutorial_progress := 0.0
var tutorial_charged := false
var tutorial_overlay: Control
var tutorial_card: PanelContainer
var tutorial_text: Label

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
		if not JavaScriptBridge.eval("new URLSearchParams(location.search).has('embedded')"):
			var seen = JavaScriptBridge.eval("(()=>{try{return localStorage.getItem('paw_league_guest_tutorial_v1')==='done'}catch(e){return false}})()")
			initialize_entry(seen==true)
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
func pitch_vertical_scale() -> float:
	var viewport_size := get_viewport().get_visible_rect().size
	return (1280.0 / 720.0) / maxf(viewport_size.x / maxf(viewport_size.y, 1.0), 0.01)

func pitch_position(point: Vector2, height := 0.0) -> Vector3:
	var t := (point.y + 13.0) / 26.0
	var depth := t / (1.0 + 0.18 * (1.0 - t))
	var left := lerpf(334.0,188.0,depth)
	var right := lerpf(1340.0,1485.0,depth)
	var px := lerpf(left,right,(point.x+22.0)/44.0)
	var py := lerpf(285.0,727.0,depth)
	return Vector3((px-836.0)*58.0/1672.0,height,(py-470.5)*58.0/1672.0*sqrt(2.0)*pitch_vertical_scale())

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
	stadium_backdrop = pixel_sprite(preload("res://art/stadium-wide-goals.png"),58.0/1672.0)
	stadium_backdrop.position = camera.position - camera.global_basis.z * 80.0
	add_child(stadium_backdrop)
	ball_node = Node3D.new()
	add_child(ball_node)
	# The screen-space ball stays above overlapping cats, at its true projected position.
	ball_node.visible = false
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
	score_card.add_theme_stylebox_override("panel",StyleBoxEmpty.new())
	score_card.draw.connect(func():pixel_frame(score_card,Rect2(Vector2.ZERO,score_card.size)))
	ui.add_child(score_card)
	back_button = icon_button("back",func(): bridge({"type":"FOOTBALL_CLOSE"}))
	back_button.position = Vector2(20,18)
	back_button.tooltip_text = "Return to stadium"
	ui.add_child(back_button)
	pause_button = icon_button("pause",toggle_pause)
	pause_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	pause_button.position = Vector2(-76,18)
	pause_button.tooltip_text = "Pause / resume (Esc)"
	ui.add_child(pause_button)
	var help := icon_button("help",start_tutorial)
	help.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	help.position = Vector2(-76,84)
	help.tooltip_text = "Learn to play again"
	ui.add_child(help)
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
	meter_card.hide()
	possession_label = label("",17)
	possession_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	possession_label.position = Vector2(-200,-83)
	possession_label.size = Vector2(400,30)
	possession_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(possession_label)
	possession_label.hide()
	stamina_bar = ProgressBar.new()
	stamina_bar.show_percentage = false
	stamina_bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	stamina_bar.position = Vector2(-140,-49)
	stamina_bar.size = Vector2(280,12)
	stamina_bar.add_theme_stylebox_override("fill",style_box(BLUE,BLUE))
	ui.add_child(stamina_bar)
	stamina_bar.hide()
	shot_bar = ProgressBar.new()
	shot_bar.show_percentage = false
	shot_bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	shot_bar.position = Vector2(-140,-30)
	shot_bar.size = Vector2(280,10)
	shot_bar.add_theme_stylebox_override("fill",style_box(GOLD,GOLD))
	ui.add_child(shot_bar)
	shot_bar.hide()
	pause_panel = centered_panel(510)
	pause_panel.hide()
	var pause_column := VBoxContainer.new()
	pause_column.add_theme_constant_override("separation",24)
	pause_panel.add_child(pause_column)
	pause_column.add_child(label("HALF-TIME BREATHER",30))
	pause_column.add_child(button("BACK TO THE PITCH",toggle_pause))
	result_backdrop = ColorRect.new()
	result_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	result_backdrop.color = Color(0.02,0.07,0.05,0.72)
	result_backdrop.z_index=100
	result_backdrop.hide()
	ui.add_child(result_backdrop)
	result_panel = load("res://result_panel.gd").new()
	result_panel.game=self
	result_panel.z_index=101
	ui.add_child(result_panel)
	result_panel.hide()
	# Touch controls also make the controls discoverable on desktop.
	var pad := GridContainer.new()
	pad.columns = 3
	pad.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	pad.position = Vector2(20,-165)
	ui.add_child(pad)
	pad.hide()
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
	actions.position = Vector2(-370,-90)
	ui.add_child(actions)
	actions.hide()
	pass_button = button("C\nPASS",try_pass,Vector2(86,60))
	actions.add_child(pass_button)
	shoot_button = button("SPACE\nSHOOT",func():pass,Vector2(86,60))
	shoot_button.button_down.connect(func(): touch_shoot = true; begin_shot_or_tackle())
	shoot_button.button_up.connect(func(): touch_shoot = false; release_shot())
	actions.add_child(shoot_button)
	var sprint_button := button("SPRINT",func():pass,Vector2(86,60))
	sprint_button.button_down.connect(func():touch_sprint = true)
	sprint_button.button_up.connect(func():touch_sprint = false)
	actions.add_child(sprint_button)
	build_match_hud()
	build_ball_marker()
	action_hint = label("",16)
	action_hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	action_hint.position = Vector2(-300,-125)
	action_hint.size = Vector2(600,30)
	action_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	action_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	action_hint.add_theme_color_override("font_outline_color",Color("192924"))
	action_hint.add_theme_constant_override("outline_size",6)
	ui.add_child(action_hint)
	possession_feedback_label = label("",26)
	possession_feedback_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	possession_feedback_label.position = Vector2(-260,100)
	possession_feedback_label.size = Vector2(520,40)
	possession_feedback_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	possession_feedback_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	possession_feedback_label.add_theme_color_override("font_color",Color("ffdf54"))
	possession_feedback_label.add_theme_color_override("font_outline_color",Color("192924"))
	possession_feedback_label.add_theme_constant_override("outline_size",6)
	ui.add_child(possession_feedback_label)
	build_tutorial()

func icon_button(kind: String, action: Callable) -> Button:
	var node := button("",action,Vector2(56,56))
	node.size = Vector2(56,56)
	for state_name in ["normal","hover","pressed","focus"]:
		node.add_theme_stylebox_override(state_name,StyleBoxEmpty.new())
	node.draw.connect(func():
		pixel_frame(node,Rect2(Vector2.ZERO,node.size))
		if node.is_hovered(): node.draw_rect(Rect2(Vector2(7,7),node.size-Vector2(14,14)),Color(1,0.85,0.5,0.12))
		var offset := Vector2(0,2) if node.button_pressed else Vector2.ZERO
		if kind=="back":
			for rect in [Rect2(18,25,23,6),Rect2(15,22,6,12),Rect2(19,18,6,6),Rect2(19,32,6,6)]:
				node.draw_rect(Rect2(rect.position+offset,rect.size),CREAM)
		elif kind=="help":
			node.draw_rect(Rect2(Vector2(15,17)+offset,Vector2(12,22)),CREAM)
			node.draw_rect(Rect2(Vector2(29,17)+offset,Vector2(12,22)),CREAM)
			for y in [22,27,32]:
				node.draw_rect(Rect2(Vector2(18,y)+offset,Vector2(6,2)),Color("52735a"))
				node.draw_rect(Rect2(Vector2(32,y)+offset,Vector2(6,2)),Color("52735a"))
		else:
			node.draw_rect(Rect2(Vector2(19,18)+offset,Vector2(6,20)),CREAM)
			node.draw_rect(Rect2(Vector2(31,18)+offset,Vector2(6,20)),CREAM)
	)
	node.mouse_entered.connect(node.queue_redraw)
	node.mouse_exited.connect(node.queue_redraw)
	return node

func draw_result_pitch(canvas: Control) -> void:
	var width := canvas.size.x
	var height := canvas.size.y
	canvas.draw_rect(Rect2(0,0,width,height),Color("16392d"))
	for i in range(10):
		if i%2==0: canvas.draw_rect(Rect2(i*width/10,0,width/10,height),Color("28573f"))
	canvas.draw_rect(Rect2(12,8,width-24,height-16),Color("a3bf8b"),false,2)
	canvas.draw_line(Vector2(width/2,8),Vector2(width/2,height-8),Color("a3bf8b"),2)
	canvas.draw_arc(Vector2(width/2,height/2),26,0,TAU,24,Color("a3bf8b"),2)
	for x in [12.0,width-46]:
		canvas.draw_rect(Rect2(x,height/2-22,34,44),Color("a3bf8b"),false,2)
	for x in [2.0,width-12]:
		canvas.draw_rect(Rect2(x,height/2-15,10,30),CREAM,false,2)
		for row in range(5): canvas.draw_line(Vector2(x,height/2-15+row*6),Vector2(x+10,height/2-15+row*6),Color("79927c"),1)
		canvas.draw_line(Vector2(x+5,height/2-15),Vector2(x+5,height/2+15),Color("79927c"),1)
	canvas.draw_texture_rect(ball_textures[0],Rect2(width/2-24,height/2-24,48,48),false)

func build_tutorial() -> void:
	tutorial_overlay = Control.new()
	tutorial_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tutorial_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tutorial_overlay.draw.connect(draw_tutorial_focus)
	ui.add_child(tutorial_overlay)
	tutorial_card = PanelContainer.new()
	tutorial_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	tutorial_card.position = Vector2(-280,108)
	tutorial_card.size = Vector2(560,116)
	var padding := StyleBoxEmpty.new()
	padding.set_content_margin_all(16)
	tutorial_card.add_theme_stylebox_override("panel",padding)
	tutorial_card.draw.connect(func():pixel_frame(tutorial_card,Rect2(Vector2.ZERO,tutorial_card.size)))
	ui.add_child(tutorial_card)
	var column := VBoxContainer.new()
	tutorial_card.add_child(column)
	tutorial_text = label("",18)
	tutorial_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(tutorial_text)
	column.add_child(button("SKIP TRAINING / PLAY MATCH",start_match,Vector2(0,36)))
	tutorial_overlay.hide()
	tutorial_card.hide()

func start_tutorial() -> void:
	start_match()
	settled = true
	game.training = true
	tutorial_step = 0
	prepare_tutorial_step()

func prepare_tutorial_step() -> void:
	tutorial_success_time = 0
	tutorial_success_step = -1
	tutorial_progress = 0
	tutorial_charged = false
	charging_cat = -1
	game.reset_positions(0)
	game.state = "playing"
	game.cats[0].pos = Vector2(-5,3)
	game.cats[1].pos = Vector2(3,3)
	game.cats[3].pos = Vector2(12,-8)
	game.cats[4].pos = Vector2(15,8)
	if tutorial_step==3:
		game.cats[0].pos = Vector2(9,0)
		game.cats[0].heading = Vector2.RIGHT
		game.cats[5].pos = Vector2(19.8,8)
	if tutorial_step==4:
		game.owner=3
		game.cats[3].pos=Vector2(1,3)
		game.select_initial_defender()
	game.update_ball(0)
	tutorial_text.text = ["1 / 6   MOVE YOUR CAT\nUse WASD or arrow keys. Follow the gold arrow.","2 / 6   SPRINT\nHold SHIFT while moving. Watch your energy drain.","3 / 6   PASS TO A TEAMMATE\nYou have the ball. Press C to pass to the highlighted cat.","4 / 6   CHARGE AND SHOOT\nHold SPACE briefly, then release. Watch the ball fly.","5 / 6   WIN THE BALL\nMove close to the opponent. Wait for the SPACE cue.","6 / 6   SWITCH YOUR CAT\nPress X. The gold arrow moves to your other teammate."][tutorial_step]

func update_tutorial(delta: float) -> void:
	if tutorial_step<0: return
	if tutorial_success_step>=0:
		tutorial_overlay.visible=game.state!="paused"
		tutorial_card.visible=game.state!="paused"
		tutorial_overlay.queue_redraw()
		if game.state=="paused": return
		tutorial_success_time+=delta
		if tutorial_success_time>=2.2: advance_tutorial()
		return
	var playing: bool = game.state=="playing" or game.state=="goal"
	tutorial_overlay.visible=playing
	tutorial_card.visible=playing
	tutorial_overlay.queue_redraw()
	if not playing: return
	var done := false
	match tutorial_step:
		0:
			if input_aim.length()>0.1: tutorial_progress+=delta
			done=tutorial_progress>=0.8
		1:
			if input_aim.length()>0.1 and Input.is_physical_key_pressed(KEY_SHIFT): tutorial_progress+=delta
			done=tutorial_progress>=0.7
		2: done=game.passes>0 and game.owner==1
		3:
			done=tutorial_charged and game.shots>0
			if game.shots>0:
				tutorial_progress+=delta
				if not done and tutorial_progress>4.0:
					game.shots=0
					prepare_tutorial_step()
					tutorial_text.text="4 / 6   TRY AGAIN\nAim toward the right goal. Charge SPACE, then release."
		5: done=game.controlled==1
		4:
			if game.tackle_status(game.controlled)=="ready": tutorial_text.text="5 / 6   STEAL NOW!\nYou are close enough. Tap SPACE once to win the ball."
			done=game.tackles>0 and game.owner==game.controlled
	if done:
		if tutorial_step in [3,4,5]:
			tutorial_success_step=tutorial_step
			tutorial_success_time=0
			tutorial_text.text="4 / 6   WATCH YOUR SHOT\nReleasing SPACE kicks the ball along your aiming line." if tutorial_step==3 else "5 / 6   YOU NOW HAVE THE BALL\nThe yellow ring shows your possession. Move to dribble."
			if tutorial_step==5: tutorial_text.text="6 / 6   CONTROL SWITCHED\nThe gold arrow moved. Move to control this teammate."
			charging_cat=-1
		else: advance_tutorial()
	elif tutorial_step==3 and game.shots>0 and not tutorial_charged:
		game.shots=0
		prepare_tutorial_step()

func advance_tutorial() -> void:
	tutorial_step+=1
	if tutorial_step==6:
		start_match()
		return
	game.passes=0
	game.shots=0
	game.tackles=0
	game.score=[0,0]
	prepare_tutorial_step()

func draw_tutorial_focus() -> void:
	if tutorial_step<0: return
	var target: int = game.controlled
	if tutorial_step==2: target=1
	if tutorial_step==4 and tutorial_success_step<0: target=3
	var point := camera.unproject_position(pitch_position(game.cats[target].pos))-Vector2(0,28)
	var hole := Rect2(point-Vector2(80,65),Vector2(160,130))
	if tutorial_success_step==3:
		var ball_point := camera.unproject_position(ball_node.position)
		hole=hole.expand(ball_point-Vector2(35,35)).expand(ball_point+Vector2(35,35))
	if tutorial_step==1: hole=Rect2(15,ui.size.y/2-115,62,230)
	var shade := Color(0.02,0.08,0.06,0.48)
	tutorial_overlay.draw_rect(Rect2(0,0,ui.size.x,maxf(0,hole.position.y)),shade)
	tutorial_overlay.draw_rect(Rect2(0,hole.end.y,ui.size.x,maxf(0,ui.size.y-hole.end.y)),shade)
	tutorial_overlay.draw_rect(Rect2(0,hole.position.y,maxf(0,hole.position.x),hole.size.y),shade)
	tutorial_overlay.draw_rect(Rect2(hole.end.x,hole.position.y,maxf(0,ui.size.x-hole.end.x),hole.size.y),shade)
	tutorial_overlay.draw_rect(hole,Color("ffe39a"),false,3)

func build_match_hud() -> void:
	energy_hud = Control.new()
	energy_hud.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT)
	energy_hud.position = Vector2(22,-108)
	energy_hud.size = Vector2(44,216)
	energy_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	energy_hud.draw.connect(draw_energy_hud)
	ui.add_child(energy_hud)
	prompt_hud = Control.new()
	prompt_hud.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_hud.position = Vector2(-176,-92)
	prompt_hud.size = Vector2(352,70)
	prompt_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	prompt_hud.draw.connect(draw_prompt_hud)
	ui.add_child(prompt_hud)
	prompt_key = label("SPACE",20)
	prompt_key.position = Vector2(20,23)
	prompt_key.size = Vector2(86,30)
	prompt_key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_key.add_theme_color_override("font_color",Color("223d32"))
	prompt_hud.add_child(prompt_key)
	prompt_title = label("HOLD TO SHOOT",20)
	prompt_title.position = Vector2(122,25)
	prompt_title.size = Vector2(220,30)
	prompt_title.add_theme_color_override("font_color",CREAM)
	prompt_hud.add_child(prompt_title)

func pixel_frame(canvas: Control, rect: Rect2) -> void:
	canvas.draw_rect(Rect2(rect.position+Vector2(4,6),rect.size),Color("10251fcc"))
	canvas.draw_rect(rect,Color("665333"))
	canvas.draw_rect(rect.grow(-2),Color("e2bf73"))
	canvas.draw_rect(rect.grow(-4),Color("132b24"))
	canvas.draw_rect(rect.grow(-7),Color("24483a"))
	canvas.draw_line(rect.position+Vector2(8,8),rect.position+Vector2(rect.size.x-8,8),Color("52735a"),2)
	for corner in [rect.position+Vector2(3,3),rect.position+Vector2(rect.size.x-6,3),rect.position+Vector2(3,rect.size.y-6),rect.end-Vector2(6,6)]:
		canvas.draw_rect(Rect2(corner,Vector2(3,3)),Color("fff1cb"))

func draw_energy_hud() -> void:
	pixel_frame(energy_hud,Rect2(0,0,44,216))
	# Small stepped lightning emblem; no text or percentage.
	var bolt := PackedVector2Array([Vector2(23,14),Vector2(15,26),Vector2(21,26),Vector2(18,36),Vector2(30,22),Vector2(24,22)])
	energy_hud.draw_colored_polygon(bolt,Color("ffe39a"))
	var fraction: float = game.cats[game.controlled].stamina/100.0
	var fill := Color("efb75b") if fraction<0.25 else Color("63c9b0")
	for i in range(12):
		var cell := Rect2(13,190-i*12,18,9)
		energy_hud.draw_rect(cell,Color("102b25"))
		var amount := clampf(fraction*12-i,0,1)
		if amount>0:
			energy_hud.draw_rect(Rect2(cell.position,Vector2(18*amount,9)),fill.darkened(0.22))
			energy_hud.draw_rect(Rect2(cell.position,Vector2(18*amount,5)),fill)
			energy_hud.draw_rect(Rect2(cell.position,Vector2(18*amount,2)),fill.lightened(0.35))

func draw_prompt_hud() -> void:
	var pulse := (sin(anim_time*4.0)+1.0)*0.5
	prompt_hud.draw_rect(Rect2(-3,-3,358,76),Color(1,0.79,0.35,0.08+0.18*pulse))
	pixel_frame(prompt_hud,Rect2(0,0,352,70))
	prompt_hud.draw_rect(Rect2(17,20,92,36),Color("9c7544"))
	prompt_hud.draw_rect(Rect2(17,16,92,36),Color("e4bd76"))
	prompt_hud.draw_rect(Rect2(20,18,86,29),Color("fff0bf"))
	prompt_hud.draw_rect(Rect2(20,18,86,3),Color("fffbed"))
	var accent := Color("ffdb7c") if game.owner==game.controlled else Color("8eebbc")
	for x in [7,340]: prompt_hud.draw_rect(Rect2(x,29,5,12),accent*Color(1,1,1,0.5+0.5*pulse))
	if charging_cat>=0:
		prompt_hud.draw_rect(Rect2(123,54,211,4),Color("102b25"))
		prompt_hud.draw_rect(Rect2(123,54,211*game.shot_charge,4),accent)

func build_ball_marker() -> void:
	shot_guide = Control.new()
	shot_guide.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shot_guide.draw.connect(draw_shot_guide)
	ui.add_child(shot_guide)
	for ring_color in [Color("ffdf54"),Color("ff4d4d"),Color("e9e8d5")]:
		ball_textures.append(create_ball_texture(ring_color))
	ball_marker = TextureRect.new()
	ball_marker.texture = ball_textures[0]
	ball_marker.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ball_marker.size = Vector2(32,32)
	ball_marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(ball_marker)
	ball_tag = label("BALL",12)
	ball_tag.size = Vector2(60,20)
	ball_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ball_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ball_tag.add_theme_color_override("font_outline_color",Color("192924"))
	ball_tag.add_theme_constant_override("outline_size",5)
	ui.add_child(ball_tag)

# Preview the exact player-directed shot heading.
func draw_shot_guide() -> void:
	if not shot_guide.visible: return
	var direction: Vector2 = game.shot_direction(game.controlled,input_aim)
	var origin := Vector2(game.ball.x,game.ball.z)
	var length := lerpf(5.0,11.0,game.shot_charge)
	var distance := 0.8
	while distance < length:
		var a := origin + direction * distance
		var b := origin + direction * minf(distance+0.55,length)
		if absf(b.x)>22 or absf(b.y)>13: break
		var screen_a := camera.unproject_position(pitch_position(a,game.ball.y*0.75))
		var screen_b := camera.unproject_position(pitch_position(b,game.ball.y*0.75))
		shot_guide.draw_line(screen_a,screen_b,Color("192924"),7,true)
		shot_guide.draw_line(screen_a,screen_b,Color("ffdf54"),3,true)
		distance += 0.95

func create_ball_texture(ring_color: Color) -> Texture2D:
	var image := Image.create(32,32,false,Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	var center_patch := PackedVector2Array([Vector2(0,-4),Vector2(4,-1),Vector2(2,4),Vector2(-2,4),Vector2(-4,-1)])
	var edge_patches := [Vector2(0,-10),Vector2(9,-4),Vector2(6,8),Vector2(-6,8),Vector2(-9,-4)]
	for y in range(32):
		for x in range(32):
			var offset := Vector2(x-15.5,y-15.5)
			var radius := offset.length()
			if radius > 15: continue
			var color := ring_color
			if radius < 12.5: color = Color("182c35")
			if radius < 10.5:
				color = Color.WHITE
				if Geometry2D.is_point_in_polygon(offset,center_patch): color = Color("182c35")
				for patch_center in edge_patches:
					if offset.distance_to(patch_center)<3.5: color = Color("182c35")
			image.set_pixel(x,y,color)
	return ImageTexture.create_from_image(image)

func update_action_hint() -> void:
	var status: String = game.tackle_status(game.controlled)
	var own_ball: bool = game.owner == game.controlled
	shoot_button.text = "SPACE\nSHOOT" if own_ball else ("SPACE\nWAIT" if status=="keeper" else ("SPACE\nCALL PASS" if status == "teammate" else "SPACE\nTACKLE"))
	shoot_button.disabled = status=="keeper"
	pass_button.text = "C\nPASS"
	pass_button.disabled = not own_ball
	shoot_button.modulate = Color("9aff9a") if status == "ready" else Color.WHITE
	action_hint.modulate = Color("9aff9a") if status == "ready" else CREAM
	ball_tag.text = "SPACE: STEAL" if status == "ready" else "BALL"
	ball_tag.modulate = Color("9aff9a") if status == "ready" else CREAM
	action_hint.visible = false
	prompt_hud.visible = started and game.state == "playing" and status in ["possession","ready"]
	prompt_title.text = "RELEASE TO SHOOT" if charging_cat>=0 else ("HOLD TO SHOOT" if own_ball else "TAP TO STEAL")
	prompt_hud.queue_redraw()
	energy_hud.visible = started and game.state!="finished"
	energy_hud.queue_redraw()
	match status:
		"possession": action_hint.text = "YOUR BALL  /  HOLD SPACE, RELEASE TO SHOOT"
		"ready": action_hint.text = "STEAL NOW!  /  TAP SPACE OR TACKLE"
		"approach": action_hint.text = "GET CLOSE TO THE CARRIER  /  THEN TAP SPACE"
		"cooldown": action_hint.text = "WAIT %.1fs  /  TACKLE RECOVERING" % game.cats[game.controlled].cooldown
		"keeper": action_hint.text = "KEEPER BALL  /  SPREAD OUT  %.1fs" % game.keeper_hold_time
		"teammate": action_hint.text = "TEAMMATE HAS BALL  /  TAP SPACE TO CALL A PASS"
		"loose": action_hint.text = "LOOSE BALL!  /  MOVE TO THE YELLOW BALL"
		_: action_hint.text = ""

func initialize_entry(seen: bool) -> void:
	if entry_initialized: return
	entry_initialized=true
	if seen: start_match()
	else: start_tutorial()

func start_match() -> void:
	if tutorial_step>=0:
		bridge({"type":"FOOTBALL_TUTORIAL_DONE"})
		if OS.has_feature("web"):
			JavaScriptBridge.eval("(()=>{try{if(!new URLSearchParams(location.search).has('embedded'))localStorage.setItem('paw_league_guest_tutorial_v1','done')}catch(e){}})()")
	tutorial_step = -1
	tutorial_success_step = -1
	tutorial_success_time = 0
	tutorial_overlay.hide()
	tutorial_card.hide()
	game = MatchRules.new(Time.get_ticks_msec())
	game.pass_body_contact = Callable(self,"pass_body_interval")
	seen_possession_serial = 0
	feedback_time = 0
	started = true
	settled = false
	charging_cat = -1
	match_id = str(Time.get_unix_time_from_system()) + "-" + str(Time.get_ticks_usec())
	result_panel.hide()
	result_backdrop.hide()
	pause_panel.hide()
	bridge({"type":"FOOTBALL_STARTED","matchId":match_id})
	play_tone(680,0.15)

func pass_body_interval(i: int, from: Vector3, to: Vector3, limit: float) -> Vector2:
	# Match the visible sprite body, including its offset above the pitch anchor.
	var atlas: AtlasTexture = cat_atlases[i]
	var key := Vector3i(0 if i<3 else 1,int(atlas.region.position.x),int(atlas.region.position.y))
	if not body_bounds_cache.has(key):
		if not body_sheet_images.has(key.x): body_sheet_images[key.x] = atlas.atlas.get_image()
		var sheet: Image = body_sheet_images[key.x]
		var frame_image := sheet.get_region(Rect2i(atlas.region))
		body_bounds_cache[key] = Rect2(frame_image.get_used_rect())
	var used: Rect2 = body_bounds_cache[key]
	var scale := get_viewport().get_visible_rect().size.x / camera.size * cat_sprites[i].pixel_size
	var body := Rect2((used.position-Vector2(96,104)-cat_sprites[i].offset)*scale,used.size*scale).grow(10.5)
	var before: Vector2 = game.previous_cat_positions[i] if game.previous_cat_positions.size()==6 else game.cats[i].pos
	var start := camera.unproject_position(pitch_position(Vector2(from.x,from.z),from.y*0.75))-camera.unproject_position(pitch_position(before))
	var finish := camera.unproject_position(pitch_position(Vector2(to.x,to.z),to.y*0.75))-camera.unproject_position(pitch_position(game.cats[i].pos))
	var travel := finish-start
	var entry := 0.0
	var leave := limit
	for axis in range(2):
		if absf(travel[axis])<0.000001:
			if start[axis]<body.position[axis] or start[axis]>body.end[axis]: return Vector2(2,-1)
		else:
			var a: float = (body.position[axis]-start[axis])/travel[axis]
			var b: float = (body.end[axis]-start[axis])/travel[axis]
			entry = maxf(entry,minf(a,b))
			leave = minf(leave,maxf(a,b))
	return Vector2(entry,leave)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and not event.echo:
		if event.pressed:
			match event.physical_keycode:
				KEY_ESCAPE: toggle_pause()
				KEY_C: try_pass()
				KEY_X: try_switch_control()
				KEY_SPACE:
					begin_shot_or_tackle()
		elif event.physical_keycode == KEY_SPACE: release_shot()

func try_switch_control() -> void:
	if tutorial_success_step>=0: return
	if tutorial_step>=0 and tutorial_step!=5: return
	if not started: return
	if game.switch_control():
		charging_cat=-1
		game.shot_charge=0
		play_tone(520,0.06)

func try_pass() -> void:
	if tutorial_success_step>=0: return
	if tutorial_step>=0 and tutorial_step!=2: return
	if not started or game.state != "playing": return
	if game.owner == game.controlled:
		game.pass_ball(game.controlled)
		play_tone(420,0.05)

func begin_shot_or_tackle() -> void:
	if tutorial_success_step>=0: return
	if tutorial_step>=0 and tutorial_step not in [3,4]: return
	if not started or game.state != "playing": return
	if game.owner == game.controlled:
		charging_cat = game.controlled
		game.shot_charge = 0
	else:
		charging_cat = -1
		game.tackle(game.controlled)

func release_shot() -> void:
	if not started or game.state != "playing": return
	if tutorial_step==3 and charging_cat==game.controlled and game.shot_charge>0.0: tutorial_charged=true
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
	# Fit only the stadium artwork and pitch coordinates to the viewport.
	# Cats remain uniformly rendered by the orthographic camera.
	stadium_backdrop.scale.y = pitch_vertical_scale()
	anim_time += delta
	if started:
		input_aim = touch_move + Vector2(
			float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT)),
			float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)))
		if game.state == "playing" and game.owner == charging_cat and game.controlled == charging_cat and (touch_shoot or Input.is_physical_key_pressed(KEY_SPACE)):
			game.shot_charge = minf(game.shot_charge + delta/1.1,1)
		if tutorial_step>=0 and game.shot_charge>0.0: tutorial_charged=true
		var before: String = game.state
		if tutorial_success_step<0 or (tutorial_step==3 and game.state=="playing") or tutorial_step in [4,5]:
			game.step(minf(delta,0.04),input_aim,touch_sprint or Input.is_physical_key_pressed(KEY_SHIFT))
		if game.owner != charging_cat:
			charging_cat = -1
			game.shot_charge = 0
		if game.state == "goal" and before != "goal": play_tone(850,0.3)
		if game.state == "finished" and not settled: show_result()
	update_tutorial(minf(delta,0.04))
	update_visuals(delta)

func update_visuals(delta: float) -> void:
	if game.state == "playing": feedback_time = maxf(0,feedback_time-delta)
	if game.possession_serial != seen_possession_serial:
		seen_possession_serial = game.possession_serial
		feedback_time = 1.2
		possession_feedback_label.text = game.possession_feedback
		play_tone(1050,0.12)
	possession_feedback_label.visible = started and game.state == "playing" and feedback_time>0
	for i in range(6):
		var cat: Dictionary = game.cats[i]
		cat_nodes[i].position = pitch_position(cat.pos)
		var moving: bool = started and game.state == "playing" and cat.velocity.length() > 0.2
		var row := 1 if cat.heading.x >= 0 else 2
		if moving: cat_animation_phase[i]+=delta*clampf(cat.velocity.length()*1.4,3.0,12.0)
		var frame := int(cat_animation_phase[i]) % 8 if moving else 0
		# These are the original eight-frame left/right cycles, with real paw motion.
		cat_atlases[i].region = Rect2(frame*192,row*208,192,208)
		cat_visuals[i].position.y = 0.10*sin(cat.kick*PI/0.4) if cat.kick>0 else 0.0
	ball_node.position = pitch_position(Vector2(game.ball.x,game.ball.z),game.ball.y*0.75)
	ball_shadow.position = pitch_position(Vector2(game.ball.x,game.ball.z),0.01)
	ball_node.rotate_z(-game.ball_velocity.x*delta)
	ball_node.rotate_x(game.ball_velocity.z*delta)
	var ball_screen := camera.unproject_position(ball_node.position)
	var possession_team: int = game.cats[game.owner].team if game.owner>=0 else -1
	var ring_index := possession_team if possession_team>=0 else 2
	ball_marker.texture = ball_textures[ring_index]
	ball_ring_color = [Color("ffdf54"),Color("ff4d4d"),Color("e9e8d5")][ring_index]
	ball_marker.size = Vector2.ONE * (38 if feedback_time>0.9 and possession_team==0 else 32)
	ball_marker.position = ball_screen - ball_marker.size * 0.5
	ball_tag.position = ball_screen - Vector2(30,36)
	ball_marker.visible = started and game.state!="finished"
	ball_tag.visible = started and game.state!="finished"
	selection_arrow.position = cat_nodes[game.controlled].position + Vector3(0,3.8+sin(anim_time*3)*0.08,0)
	selection_arrow.visible = started and game.state!="finished"
	score_label.text = "HOME   %d  :  %d   AWAY" % [game.score[0],game.score[1]]
	var remaining := ceili((210 if game.overtime else 180) - game.elapsed)
	clock_label.text = ("GOLDEN GOAL  " if game.overtime else "") + "%02d:%02d" % [remaining/60,remaining%60]
	stamina_bar.value = game.cats[game.controlled].stamina
	shot_bar.value = game.shot_charge*100
	shot_guide.visible = started and game.state=="playing" and charging_cat>=0 and game.owner==charging_cat and game.controlled==charging_cat
	shot_guide.queue_redraw()
	possession_label.text = TEAM_NAMES[0] + "  /  " + ("YOUR BALL  >" if game.owner==game.controlled else "ATTACK THE RIGHT GOAL  >")
	announcement.text = str(ceili(game.phase_time)) if started and game.state == "countdown" else ("HOME GOAL!" if game.goal_team == 0 else "AWAY GOAL!") if game.state == "goal" else ""
	if not started: possession_label.text = ""
	update_action_hint()

func result_portrait(team: int) -> VBoxContainer:
	var column := VBoxContainer.new()
	column.alignment=BoxContainer.ALIGNMENT_CENTER
	var portrait := TextureRect.new()
	var atlas := AtlasTexture.new()
	atlas.atlas=TEAM_SHEETS[team]
	atlas.region=Rect2(0,208 if team==0 else 416,192,208)
	portrait.texture=atlas
	portrait.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	portrait.custom_minimum_size=Vector2(104,90)
	portrait.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	column.add_child(portrait)
	var name_label := label("MALLOW" if team==0 else "SILVERBELT",15)
	name_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(name_label)
	return column

func result_stat(value: String, caption: String) -> PanelContainer:
	var card := PanelContainer.new()
	card.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	card.add_theme_stylebox_override("panel",style_box(Color("16392d"),Color("577960")))
	var column := VBoxContainer.new()
	card.add_child(column)
	var number := label(value,24)
	number.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	number.add_theme_color_override("font_color",Color("ffe39a"))
	column.add_child(number)
	var title := label(caption,13)
	title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	return card

func show_result() -> void:
	settled = true
	bridge({"type":"FOOTBALL_COMPLETE","matchId":match_id,"elapsedSeconds":game.elapsed,"homeGoals":game.score[0],"awayGoals":game.score[1]})
	result_backdrop.show()
	result_panel.reveal()
	ball_marker.hide()
	ball_tag.hide()
	play_tone(600,0.25)

func bridge(message: Dictionary) -> void:
	if not OS.has_feature("web"): return
	message.source = "pet-function:stadium-football"
	JavaScriptBridge.eval("parent.postMessage("+JSON.stringify(message)+",location.origin)")

func on_host_message(args: Array) -> void:
	if args.is_empty(): return
	var message = JSON.parse_string(str(args[0]))
	if not message is Dictionary: return
	if message.get("type") == "FOOTBALL_INIT": initialize_entry(message.get("tutorialSeen",false)==true)
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
