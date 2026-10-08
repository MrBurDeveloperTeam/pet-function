extends Node3D

const CAT_NAMES = ["Mallow", "Silverbelt", "Fastrat", "Gulu", "Munchkin", "Mochi"]
const CAT_IDS = ["mallow", "silverbelt", "fastrat", "gulu", "munchkin", "mochi"]
const FUR = [Color("59616b"), Color("d6c7a1"), Color("d49752"), Color("aaa296"), Color("bca16d"), Color("545058")]
const PAINT = [Color("34c6c7"), Color("f5b449"), Color("ed7856"), Color("7e87e4"), Color("8bcf78"), Color("e6a1c3")]
const SEGMENTS = 384
const LAPS = 3
const Track = preload("res://track.gd")
var track = Track.new()
var models = preload("res://models.gd").new(self)
var player_route = 0
var route_samples: Array = []
var route_grid: Dictionary = {}
var terrain_pads: Array[Dictionary] = []
var air_time = 0.0
var air_duration = 1.25
var jump_lock = 0.0
var effects: Array[Dictionary] = []
var exhaust: Array[MeshInstance3D] = []
var cat_textures: Array[Texture2D] = []
var atlas: Texture2D
var racers: Array[Dictionary] = []
var boxes: Array[Dictionary] = []
var player_cat = 0
var player_pos = Vector3.ZERO
var yaw = 0.0
var speed = 0.0
var progress = 0.0
var last_q = 0.0
var race_time = 0.0
var countdown = 3.5
var started = false
var finished = false
var paused = false
var boost = 0.0
var shield = 0.0
var stun = 0.0
var drift_charge = 0.0
var drifting = false
var item = ""
var pickups = 0
var touch = {"gas": false, "brake": false, "left": false, "right": false, "drift": false}
var camera: Camera3D
var hud: Label
var message: Label
var item_button: Button
var menu: PanelContainer
var result: Label
var race_button: Button
var cat_picker: OptionButton
var spark: MeshInstance3D
var flash_until = 0.0
var preview_angle = 0.5
var performance_clock = 0.0
var performance_frames = 0
var sample_positions: Array[Vector3] = []
var sample_length = 0.0
var pixel_material: ShaderMaterial
var spark_pool: Array[MeshInstance3D]=[]
var sound: Node
var touring=false
var tour_q=0.0
var collision_body: CharacterBody3D
var graphics_button: Button
var graphics_mode=0
var low_graphics=false
var slow_windows=0
var wrong_way=false
var wrong_way_time=0.0

func update_direction(dt: float, q: float) -> void:
	var facing=Vector3(-sin(yaw),0,-cos(yaw))
	var movement=facing*signf(speed)
	var route_forward=track.direction(q,player_route)
	route_forward.y=0
	var against=absf(speed)>.8 and movement.dot(route_forward.normalized())<-.25
	wrong_way_time=clampf(wrong_way_time+(dt if against else -dt*3),0,1)
	wrong_way=wrong_way_time>=.35

func set_graphics(low: bool) -> void:
	low_graphics=low
	get_viewport().scaling_3d_scale=.5 if low else .6
	get_viewport().mesh_lod_threshold=4.0 if low else 1.0
	for light in find_children("*","DirectionalLight3D",true,false):light.shadow_enabled=not low
	for racer in racers:
		var shadow=racer.node.get_node_or_null("ContactShadow")
		if shadow:shadow.visible=low
	print("CAT KART GRAPHICS: ","Performance" if low else "High")

func cycle_graphics() -> void:
	graphics_mode=(graphics_mode+1)%3
	graphics_button.text=["Detail: Auto","Detail: High","Detail: Fast"][graphics_mode]
	slow_windows=0
	set_graphics(graphics_mode==2)

func add_contact_shadow(kart: Node3D) -> void:
	var shadow=MeshInstance3D.new()
	shadow.name="ContactShadow"
	var plane=PlaneMesh.new()
	plane.size=Vector2(2.8,3.8)
	shadow.mesh=plane
	shadow.position.y=-.24
	shadow.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var paint=ShaderMaterial.new()
	paint.shader=load("res://contact_shadow.gdshader")
	shadow.material_override=paint
	shadow.visible=low_graphics
	kart.add_child(shadow)

func solid_box(parent: Node3D, pos: Vector3, size: Vector3, angle: float = 0.0) -> StaticBody3D:
	var body=StaticBody3D.new()
	body.name="CourseSolid"
	body.position=pos
	body.rotation.y=angle
	var collider=CollisionShape3D.new()
	var shape=BoxShape3D.new()
	shape.size=size
	collider.shape=shape
	body.add_child(collider)
	parent.add_child(body)
	return body

func make_collision_body() -> void:
	collision_body=CharacterBody3D.new()
	collision_body.name="SweptKartCollision"
	collision_body.collision_layer=2
	collision_body.collision_mask=1
	var collider=CollisionShape3D.new()
	var shape=SphereShape3D.new()
	shape.radius=1.25
	collider.shape=shape
	collision_body.add_child(collider)
	add_child(collision_body)

func course_sign_lod(node: Node) -> void:
	if node is Label3D:node.visibility_range_end=65
	for child in node.get_children():course_sign_lod(child)

func move_kart_safely(motion: Vector3) -> void:
	collision_body.position=player_pos+Vector3.UP*1.25
	var remainder=motion
	for iteration in 3:
		var hit=collision_body.move_and_collide(remainder,false,0.01)
		if hit==null:break
		remainder=hit.get_remainder().slide(hit.get_normal())
		speed*=0.72
		if remainder.length_squared()<0.000001:break
	player_pos=collision_body.position-Vector3.UP*1.25

func material(color: Color) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = color.darkened(0.12)
	m.roughness = 0.85
	return m

func mesh(parent: Node3D, shape: Mesh, color: Color, pos: Vector3, scale_value := Vector3.ONE) -> MeshInstance3D:
	var n = MeshInstance3D.new()
	n.mesh = shape
	n.material_override = material(color)
	n.position = pos
	n.scale = scale_value
	parent.add_child(n)
	return n

func cube(parent: Node3D, pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var b = BoxMesh.new()
	b.size = size
	return mesh(parent, b, color, pos)

func ball(parent: Node3D, pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var s = SphereMesh.new()
	s.radial_segments = 12
	s.rings = 6
	return mesh(parent, s, color, pos, size)

func center(q: float) -> Vector3:
	return track.point(q, player_route)

func tangent(q: float) -> Vector3:
	return track.direction(q, player_route)

func side(q: float) -> Vector3:
	return tangent(q).cross(Vector3.UP).normalized()

func heading(q: float) -> float:
	var t = tangent(q)
	return atan2(-t.x, -t.z)

func nearest_q(pos: Vector3) -> float:
	var best = INF
	var answer = 0.0
	var cell=Vector2i(floori(pos.x/20),floori(pos.z/20))
	for x in range(-1,2):
		for z in range(-1,2):
			for entry in route_grid.get(cell+Vector2i(x,z),[]):
				var p:Vector3=route_samples[entry.x][entry.y]
				var d=Vector2(pos.x-p.x,pos.z-p.z).length_squared()
				if d<best:
					best=d
					answer=float(entry.y)/SEGMENTS
					player_route=entry.x
	# Recovery/teleports outside the nearby road cells still need a global lookup.
	if best>400:
		for route in 2:
			for i in SEGMENTS:
				var p:Vector3=route_samples[route][i]
				var d=Vector2(pos.x-p.x,pos.z-p.z).length_squared()
				if d<best:
					best=d
					answer=float(i)/SEGMENTS
					player_route=route
	# Refine locally to prevent checkpoint jitter on slow corners.
	for i in range(-5, 6):
		var q = fposmod(answer + float(i) / (SEGMENTS * 5.0), 1.0)
		var c = center(q)
		var d = Vector2(pos.x - c.x, pos.z - c.z).length_squared()
		if d < best:
			best = d
			answer = q
	return answer

func _ready() -> void:
	track.balance()
	for route in 2:
		var points: Array[Vector3] = []
		for i in SEGMENTS:
			var p:Vector3=track.point(float(i)/SEGMENTS,route)
			points.append(p)
			var cell=Vector2i(floori(p.x/20),floori(p.z/20))
			if not route_grid.has(cell):route_grid[cell]=[]
			route_grid[cell].append(Vector2i(route,i))
		route_samples.append(points)
	if OS.has_feature("web"):
		var selected = str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('cat') || 'mallow'"))
		player_cat = maxi(0, CAT_IDS.find(selected))
	build_world()
	make_collision_body()
	build_ui()
	sound=preload("res://sound.gd").new()
	sound.game=self
	add_child(sound)
	reset_race(false)

func build_world() -> void:
	for i in SEGMENTS:
		var p=center(float(i)/SEGMENTS)
		sample_positions.append(p)
		sample_length+=p.distance_to(center(float(i+1)/SEGMENTS))
	if ResourceLoader.exists('res://built/circuit.scn') and not '--bake' in OS.get_cmdline_user_args():
		var circuit=load('res://built/circuit.scn').instantiate()
		add_child(circuit)
		course_sign_lod(circuit)
		terrain_pads.assign(pad_specs())
	else:
		var env = WorldEnvironment.new()
		env.environment = Environment.new()
		env.environment.background_mode = Environment.BG_SKY
		var sky = Sky.new()
		var sky_mat = ProceduralSkyMaterial.new()
		sky_mat.sky_top_color = Color("278db5")
		sky_mat.sky_horizon_color = Color("c8e9de")
		sky_mat.ground_horizon_color = Color("c8e9de")
		sky.sky_material = sky_mat
		env.environment.sky = sky
		env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		env.environment.ambient_light_color = Color("fff1d6")
		env.environment.ambient_light_energy = 0.6
		env.environment.fog_enabled=true
		env.environment.fog_light_color=Color("c8e0d8")
		env.environment.fog_density=.003
		add_child(env)
		var sun = DirectionalLight3D.new()
		sun.rotation_degrees = Vector3(-48, -28, 0)
		sun.light_energy = 0.55
		sun.shadow_enabled = true
		sun.directional_shadow_max_distance = 28
		sun.directional_shadow_mode=DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
		add_child(sun)
		var art = preload("res://town_art.gd").new(self, null)
		art.block(self, Vector3(0, -3, 0), Vector3(850, 2, 700), 4)
		for i in SEGMENTS:
			var q = float(i) / SEGMENTS
			var c = center(q)
			# Course samples are prepared before static geometry.
			var length = c.distance_to(center(q + 1.0 / SEGMENTS))
			# Length is cached separately.
			if i % 6 == 0:
				var stripe = cube(self, c + Vector3(0, 0.2, 0), Vector3(0.14, 0.04, 0.9), Color("e7dec6"))
				stripe.rotation.y = heading(q)
		art.road(0)
		art.road(1)
		art.street()
		build_course_features()
		# Gate and checkerboard start line.
		var gate = Node3D.new()
		add_child(gate)
		gate.position = center(0)
		gate.rotation.y = heading(0)
		for x in [-12.8, 12.8]:
			cube(gate, Vector3(x, 4, 0), Vector3(0.6, 8, 0.6), Color("fff0c4"))
		cube(gate, Vector3(0, 7.7, 0), Vector3(26, 1.7, 0.5), Color("274b52"))
		var title = Label3D.new()
		title.text = "CAT KART"
		title.font_size = 80
		title.pixel_size = 0.017
		title.position = Vector3(0, 7.7, 0.3)
		gate.add_child(title)
		for x in 24:
			for z in 2:
				cube(gate, Vector3(x - 11.5, 0.23, z - 0.5), Vector3(1, 0.03, 1), Color.WHITE if (x + z) % 2 == 0 else Color("27374c"))
		var rng = RandomNumberGenerator.new()
		rng.seed = 42
		for i in 0:
			var q = float(i) / 65
			var p = center(q) + side(q) * (12 + rng.randf_range(0, 9))
			p.y = -1
			cube(self, p + Vector3(0, 2, 0), Vector3(0.8, 4, 0.8), Color("8d6b4c"))
			ball(self, p + Vector3(0, 5, 0), Vector3(4, 4.4, 4), Color("4d9776"))
		batch_world()
	for q in [0.17, 0.48, 0.78]:
		for lane in [-3.0, 3.0]:
			var b=Node3D.new()
			add_child(b)
			b.position=center(q)+side(q)*lane+Vector3(0,1.7,0)
			for x in [-.62,.62]:
				for z in [-.62,.62]:
					metal_part(b,Vector3(x,0,z),Vector3(.12,1.35,.12),Color("bbad87"))
			for y in [-.65,.65]:
				metal_part(b,Vector3(0,y,0),Vector3(1.35,.1,1.35),Color("476b73"))
			var core=ball(b,Vector3.ZERO,Vector3(.8,.8,.8),Color("73dfd4"))
			core.material_override.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
			var label = Label3D.new()
			label.text = "+"
			label.font=load("res://art/Quadrit.ttf")
			label.font_size = 40
			label.pixel_size = 0.014
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			b.add_child(label)
			label.position.z = .65
			boxes.append({"node": b, "q": q, "lane": lane, "cooldown": 0.0})
	for i in 6:
		var n = make_kart(i)
		racers.append({"node": n, "q": 0.0, "progress": 0.0, "speed": 0.0, "stun": 0.0, "base": 31.0 + i * 0.32, "lane": (i % 3 - 1) * 3.0})
	camera = Camera3D.new()
	camera.fov = 68
	camera.current = true
	add_child(camera)

func make_kart(cat: int) -> Node3D:
	if ResourceLoader.exists('res://built/'+CAT_IDS[cat]+'.scn') and not '--bake' in OS.get_cmdline_user_args():
		var ready_kart=load('res://built/'+CAT_IDS[cat]+'.scn').instantiate()
		add_child(ready_kart)
		add_contact_shadow(ready_kart)
		return ready_kart
	var kart = models.kart(cat)
	var batch=preload("res://scenery_batch.gd")
	batch.merge(kart,true)
	# Batch the anatomical surfaces with their animated parent. Head and tail
	# stay separate, while eyes, ears, legs and toes no longer cost individual draws.
	batch.merge(kart.get_node("Driver"),false,["Head","Tail"])
	batch.merge(kart.get_node("Driver/Head"))
	for wheel in ["FrontL","FrontR","RearL","RearR"]:
		batch.merge(kart.get_node(wheel+"/Spin"),true)
	return kart

func metal_part(parent: Node3D, p: Vector3, size_value: Vector3, color: Color, metallic: float=.7) -> MeshInstance3D:
	var node=cube(parent,p,size_value,color)
	node.material_override.metallic=metallic
	node.material_override.roughness=.4
	return node

func pad_specs() -> Array:
	return [
		{"q":.08,"route":0,"kind":"boost"},
		{"q":.255,"route":0,"kind":"slow"},
		{"q":.28,"route":1,"kind":"jump"},
		{"q":.55,"route":0,"kind":"boost"},
		{"q":.68,"route":0,"kind":"jump"},
		{"q":.86,"route":0,"kind":"slow"}]

func build_course_features() -> void:
	for spec in pad_specs():
		var p: Vector3=track.point(spec.q,spec.route)
		var direction: Vector3=track.direction(spec.q,spec.route)
		var n=Node3D.new()
		add_child(n)
		n.position=p+Vector3.UP*.28
		n.rotation.y=atan2(-direction.x,-direction.z)
		var color=Color("58bbb6") if spec.kind=="boost" else (Color("d2a147") if spec.kind=="slow" else Color("d37950"))
		metal_part(n,Vector3(0,-.06,0),Vector3(10,.13,4.6),Color("283c48"))
		for x in [-4.8,4.8]:
			metal_part(n,Vector3(x,.05,0),Vector3(.28,.14,4.6),Color("9aadaf"))
			for z in [-1.9,-.8,.8,1.9]:
				metal_part(n,Vector3(x,.14,z),Vector3(.14,.05,.14),Color("e1c382"))
		for x in range(-4,5):
			metal_part(n,Vector3(x,.02,0),Vector3(.9,.07,4.1),Color("485a61"),.5)
		for z in range(4):
			for x in [-1,1]:
				var strip=metal_part(n,Vector3(x*1.22,.095,-1.4+z*.8),Vector3(3.4,.055,.24),color,.3)
				strip.rotation.y=x*.48
				strip.material_override.emission_enabled=true
				strip.material_override.emission=color*.3
		if spec.kind=="slow":
			for z in 5:
				metal_part(n,Vector3(0,.17,-1.6+z*.8),Vector3(9.3,.17,.22),Color("cfa359"),.3)
		if spec.kind=="jump":
			var ramp=SurfaceTool.new()
			ramp.begin(Mesh.PRIMITIVE_TRIANGLES)
			var a=Vector3(-4.7,.0,2.5)
			var b=Vector3(4.7,.0,2.5)
			var c=Vector3(-4.7,1.2,-2.5)
			var d=Vector3(4.7,1.2,-2.5)
			for vertex in [a,c,b,b,c,d]:ramp.add_vertex(vertex)
			ramp.generate_normals()
			var shape=mesh(n,ramp.commit(),Color("6f858b"),Vector3.ZERO)
			shape.material_override.cull_mode=BaseMaterial3D.CULL_DISABLED
			shape.material_override.metallic=.6
			n.rotation.x=-.14
			for edge in [-4.7,4.7]:
				metal_part(n,Vector3(edge,.3,0),Vector3(.15,.3,4.5),color)
		terrain_pads.append(spec)
	for branch in 2:
		var board=Node3D.new()
		add_child(board)
		board.position=track.point(.145)+side(.145)*(14 if branch==0 else -14)
		board.rotation.y=heading(.145)
		metal_part(board,Vector3(0,2,0),Vector3(.18,4,.18),Color("899b9d"))
		metal_part(board,Vector3(0,4,0),Vector3(5,1.5,.26),Color("274f5b") if branch==0 else Color("835744"),.25)
		var sign=Label3D.new()
		sign.text="MARKET / EASY" if branch==0 else "CANAL / TRICKS"
		sign.font=load("res://art/Quadrit.ttf")
		sign.font_size=24
		sign.pixel_size=.009
		sign.position=Vector3(0,4,.15)
		board.add_child(sign)
func emit_spark(pos: Vector3, color: Color, amount: int = 5) -> void:
	for i in mini(amount,24):
		var n: MeshInstance3D
		if spark_pool.is_empty():
			n=cube(self,pos,Vector3(.045,.045,.36),color)
			n.material_override.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
		else:n=spark_pool.pop_back()
		n.visible=true
		n.position=pos
		n.material_override.albedo_color=color
		var velocity=Vector3(randf_range(-4,4),randf_range(.5,3),randf_range(-4,4))
		n.quaternion=Quaternion(Vector3.FORWARD,velocity.normalized())
		effects.append({"node":n,"velocity":velocity,"life":.45})

func label(text: String, font_size: int) -> Label:
	var l = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_font_override("font", load("res://art/Quadrit.ttf"))
	l.add_theme_color_override("font_color", Color("fff3d0"))
	return l

func button(text: String, callback: Callable) -> Button:
	var b = Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_font_override("font", load("res://art/Quadrit.ttf"))
	b.custom_minimum_size = Vector2(120, 44)
	b.pressed.connect(callback)
	return b

func build_ui() -> void:
	var pixel_layer = CanvasLayer.new()
	pixel_layer.layer = 0
	add_child(pixel_layer)
	var pixel_screen = ColorRect.new()
	pixel_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pixel_screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pixel_mat = ShaderMaterial.new()
	pixel_mat.shader = load("res://pixel_world.gdshader")
	pixel_screen.material = pixel_mat
	pixel_material=pixel_mat
	pixel_layer.add_child(pixel_screen)
	var layer = CanvasLayer.new()
	layer.layer = 1
	add_child(layer)
	var root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)
	var minimap = preload("res://minimap.gd").new()
	minimap.race = self
	root.add_child(minimap)
	minimap.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	minimap.offset_left = -180
	minimap.offset_right = -20
	minimap.offset_top = 82
	minimap.offset_bottom = 202
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var top = HBoxContainer.new()
	root.add_child(top)
	top.position = Vector2(20, 16)
	top.add_theme_constant_override("separation", 16)
	top.add_child(button("Back to town", close_game))
	top.add_child(button("Pause", toggle_pause))
	top.add_child(button("Sound",func():sound.toggle()))
	graphics_button=button("Detail: Auto",cycle_graphics)
	top.add_child(graphics_button)
	hud = label("CAT KART - TOWN SPRINT", 24)
	hud.add_theme_constant_override("outline_size", 5)
	hud.add_theme_color_override("font_outline_color", Color("254451"))
	top.add_child(hud)
	message = label("", 38)
	message.add_theme_constant_override("outline_size", 8)
	message.add_theme_color_override("font_outline_color", Color("254451"))
	root.add_child(message)
	message.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	message.position += Vector2(-240, 85)
	message.custom_minimum_size.x = 480
	message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var bottom = HBoxContainer.new()
	root.add_child(bottom)
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	bottom.offset_left = 20
	bottom.offset_top = -62
	bottom.offset_right = 880
	bottom.offset_bottom = -18
	for action in ["left", "gas", "brake", "right", "drift"]:
		var b = button({"left": "Left", "gas": "Accelerate", "brake": "Brake / Reverse", "right": "Right", "drift": "Drift"}[action], func(): pass)
		b.button_down.connect(func(): touch[action] = true)
		b.button_up.connect(func(): touch[action] = false)
		bottom.add_child(b)
	item_button = button("Item - E", use_item)
	bottom.add_child(item_button)
	menu = PanelContainer.new()
	root.add_child(menu)
	menu.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	menu.offset_left = -620
	menu.offset_top = -185
	menu.offset_right = -100
	menu.offset_bottom = 185
	menu.custom_minimum_size = Vector2(520, 340)
	var panel_style = StyleBoxFlat.new()
	panel_style.bg_color = Color("254451")
	panel_style.corner_radius_top_left = 22
	panel_style.corner_radius_top_right = 22
	panel_style.corner_radius_bottom_left = 22
	panel_style.corner_radius_bottom_right = 22
	panel_style.content_margin_left = 30
	panel_style.content_margin_right = 30
	panel_style.content_margin_top = 25
	panel_style.content_margin_bottom = 25
	menu.add_theme_stylebox_override("panel", panel_style)
	var v = VBoxContainer.new()
	menu.add_child(v)
	v.add_theme_constant_override("separation", 14)
	v.add_child(label("CAT KART - TOWN SPRINT", 30))
	result = label("Your cat. Five rivals. Three laps.\nWASD / arrows: drive - Space: drift\nRelease drift for a boost - E: use item\nR: recover - Esc: pause", 18)
	v.add_child(result)
	cat_picker = OptionButton.new()
	for name_value in CAT_NAMES:
		cat_picker.add_item(name_value)
	cat_picker.selected = player_cat
	cat_picker.item_selected.connect(func(i): player_cat = i; reset_race(false))
	v.add_child(cat_picker)
	race_button = button("Start race", func(): reset_race(true))
	v.add_child(race_button)
	v.add_child(button("Tour the track",func():touring=true;menu.hide();tour_q=0))
	v.add_child(button("Return to town", close_game))

func _process(delta: float) -> void:
	if pixel_material!=null:pixel_material.set_shader_parameter("boost",1.0 if boost>0 else 0.0)
	performance_clock += delta
	performance_frames += 1
	if performance_clock>=5:
		var measured_fps=performance_frames/performance_clock
		if graphics_mode==0 and not low_graphics and not paused:
			slow_windows=slow_windows+1 if measured_fps<38 else 0
			if slow_windows>=2:set_graphics(true)
		print("CAT KART PERFORMANCE: ",snappedf(performance_frames/performance_clock,0.1)," FPS; ",Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)," draws; ",Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)," primitives; physics ",snappedf(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000,.01),"ms; process ",snappedf(Performance.get_monitor(Performance.TIME_PROCESS)*1000,.01),"ms")
		performance_clock=0
		performance_frames=0
	if not started and is_instance_valid(camera) and racers.size()==6:
		if touring:
			tour_q=fposmod(tour_q+delta*.025,1)
			var p: Vector3=track.point(tour_q)
			var direction: Vector3=track.direction(tour_q)
			racers[0].node.position=p+Vector3.UP*.3
			racers[0].node.rotation.y=atan2(-direction.x,-direction.z)
			models.animate(racers[0].node,26,0,preview_angle,delta)
			camera.position=camera.position.lerp(p-direction*8+Vector3.UP*4.5,1-exp(-8*delta))
			camera.look_at(p+direction*4+Vector3.UP)
			hud.text="TRACK TOUR / PAUSE TO RETURN"
			return
		if not paused:preview_angle += delta*0.22
		var spot = track.point(0.52)+Vector3.UP*0.3
		racers[0].node.position = spot
		racers[0].node.rotation.y = 0
		models.animate(racers[0].node,0,0,preview_angle,delta)
		for i in range(1,6):
			racers[i].node.visible = false
		camera.position = spot+Vector3(sin(preview_angle)*5.2,3.1,cos(preview_angle)*5.2)
		camera.look_at(spot+Vector3.UP*1.1)
		camera.look_at(spot+Vector3.UP*1.1-camera.global_basis.x*1.75)

func reset_race(run: bool) -> void:
	preview_angle=PI+.15
	wrong_way=false
	wrong_way_time=0
	touring=false
	player_route = 0
	air_time = 0
	jump_lock = 0
	speed = 0
	progress = 0
	last_q = 0
	race_time = 0
	boost = 0
	shield = 0
	stun = 0
	drift_charge = 0
	drifting = false
	item = ""
	pickups = 0
	countdown = 3.5
	finished = false
	paused = false
	started = run
	menu.visible = not run
	race_button.text = "Start race"
	result.text = "Your cat. Five rivals. Three laps.\nW / up: accelerate - A / D: steer\nS / down: brake, then reverse\nSpace: drift - E: item - R: recover\nFollow the arrows. Esc: pause"
	for b in boxes:
		b.cooldown = 0
	for i in 6:
		racers[i].node.queue_free()
		racers[i].node = make_kart(player_cat if i == 0 else (player_cat + i) % 6)
		racers[i].progress = -float(i / 2) * 0.018
		racers[i].q = fposmod(racers[i].progress, 1)
		racers[i].speed = 0
		racers[i].route = i % 2
		racers[i].stun = 0
		racers[i].boost = 0.0
		racers[i].air = 0.0
		racers[i].jump_lock = 0.0
		var p = center(racers[i].q) + side(racers[i].q) * (-2.5 if i % 2 == 0 else 2.5)
		racers[i].node.position = p
		racers[i].node.rotation.y = heading(racers[i].q)
	player_pos = racers[0].node.position
	yaw = heading(0)
	camera.position = player_pos - tangent(0) * 10 + Vector3.UP * 6
	camera.look_at(player_pos + tangent(0) * 5 + Vector3.UP * 1.4)

func held(key: Key, alternate: Key, action: String) -> bool:
	return Input.is_physical_key_pressed(key) or Input.is_physical_key_pressed(alternate) or touch[action]

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_E:
			use_item()
		if event.physical_keycode == KEY_ESCAPE:
			toggle_pause()
		if event.physical_keycode == KEY_R and started and not finished:
			player_pos = center(last_q)
			yaw = heading(last_q)
			speed = 0
			wrong_way=false
			wrong_way_time=0

func toggle_pause() -> void:
	if touring:
		touring=false
		menu.show()
		return
	if not started or finished:
		return
	paused = not paused
	message.text = "PAUSED" if paused else ""
	for action in touch:
		touch[action] = false

func close_game() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("parent.postMessage({source:'cat-kart',type:'KART_CLOSE'},location.origin)")

func announce(text: String) -> void:
	message.text = text
	flash_until = race_time + 1.6
	if sound!=null:sound.cue(660 if "BOOST" in text else 440)

func use_item() -> void:
	if not started or finished or paused or countdown > 0 or item == "":
		return
	if item == "BOOST":
		boost = 2.5
		announce("FISH BOOST!")
	elif item == "SHIELD":
		shield = 6
		announce("BUBBLE SHIELD!")
	else:
		emit_spark(player_pos + Vector3.UP, Color("aeefeb"), 36)
		for i in range(1, 6):
			if racers[i].node.position.distance_to(player_pos) < 18:
				racers[i].stun = 2
		announce("PAW PULSE!")
	item = ""

func _physics_process(delta: float) -> void:
	var dt = minf(delta, 0.05)
	for i in range(effects.size()-1,-1,-1):
		var fx = effects[i]
		fx.life -= dt
		fx.node.position += fx.velocity*dt
		fx.node.scale = Vector3.ONE*maxf(0.1,fx.life/0.45)
		if fx.life<=0:
			fx.node.visible=false
			spark_pool.append(fx.node)
			effects.remove_at(i)
	for b in boxes:
		b.node.rotate_y(dt)
	if not started or finished or paused:
		return
	if countdown > 0:
		countdown -= dt
		message.text = str(ceili(countdown)) if countdown > 0.5 else "GO!"
		flash_until = 1.0
		return
	race_time += dt
	boost = maxf(0, boost - dt)
	shield = maxf(0, shield - dt)
	racers[0].node.get_node("Shield").visible = shield > 0
	stun = maxf(0, stun - dt)
	jump_lock = maxf(0,jump_lock-dt)
	var gas = held(KEY_W, KEY_UP, "gas")
	var brake = held(KEY_S, KEY_DOWN, "brake")
	var steer = float(held(KEY_D, KEY_RIGHT, "right")) - float(held(KEY_A, KEY_LEFT, "left"))
	var q = nearest_q(player_pos)
	var offroad = Vector2(player_pos.x - center(q).x, player_pos.z - center(q).z).length() > track.width(q,player_route)
	var max_speed = 45.0 if boost > 0 else 36.0
	if offroad:
		max_speed = 10
	if stun > 0:
		max_speed = 8
	if brake:
		# Brake to a stop before engaging reverse; reverse has its own speed cap.
		speed=move_toward(speed,0,26*dt) if speed>0 else move_toward(speed,-8.0,6*dt)
	elif gas:
		speed=move_toward(speed,0,26*dt) if speed<0 else move_toward(speed,max_speed,11*dt)
	else:
		speed=move_toward(speed,0,5*dt)
	var drift_now = held(KEY_SPACE, KEY_SHIFT, "drift") and absf(steer) > 0 and speed > 12 and not offroad
	if drift_now:
		drift_charge = minf(2.5, drift_charge + dt)
	elif drifting:
		if drift_charge > 0.65:
			boost = 1.0 + drift_charge * 0.5
			announce("DRIFT BOOST!")
		drift_charge = 0
	drifting = drift_now
	if drifting and Engine.get_physics_frames()%3==0:
		emit_spark(player_pos-Vector3(-sin(yaw),0,-cos(yaw)),Color("6fe5ee") if drift_charge<1.4 else Color("ffca68"),2)
	yaw -= steer * (1.4 if drifting else 1.05) * clampf(speed / 12, -1, 1) * dt
	move_kart_safely(Vector3(-sin(yaw), 0, -cos(yaw)) * speed * dt)
	q = nearest_q(player_pos)
	update_direction(dt,q)
	var c = center(q)
	var offset = Vector2(player_pos.x - c.x, player_pos.z - c.z)
	var boundary = track.width(q,player_route)+1.7
	if offset.length() > boundary:
		var edge = offset.normalized() * boundary
		player_pos.x = c.x + edge.x
		player_pos.z = c.z + edge.y
		speed *= 0.95
	player_pos.y = c.y + 0.3
	for pad in terrain_pads:
		var pad_pos: Vector3 = track.point(pad.q,pad.route)
		var pad_direction: Vector3=track.direction(pad.q,pad.route)
		var pad_offset=player_pos-pad_pos
		if absf(pad_offset.dot(pad_direction))<2.6 and absf(pad_offset.dot(pad_direction.cross(Vector3.UP)))<5 and air_time<=0:
			if pad.kind=="boost":
				boost = maxf(boost,1.4)
			elif pad.kind=="slow":
				speed = minf(speed,13)
			elif speed>14 and jump_lock<=0:
				air_time = air_duration
				jump_lock = 2.5
				announce("AIR TRICK!")
	if air_time>0:
		air_time = maxf(0,air_time-dt)
		var phase = 1.0-air_time/air_duration
		player_pos.y += sin(phase*PI)*5.0
		racers[0].node.rotation.x = phase*TAU
		if air_time<=0:
			racers[0].node.rotation.x = 0
			boost = maxf(boost,1.8)
			emit_spark(player_pos,Color("ffe4a1"),18)
			announce("360! LANDING BOOST")
	var dq = fposmod(q - last_q + 0.5, 1) - 0.5
	# Signed continuous progress prevents earning laps by reversing or resetting.
	if absf(dq) < 0.025:
		progress += dq
	last_q = q
	racers[0].progress = progress
	racers[0].node.position = player_pos
	racers[0].node.rotation.y = yaw
	models.animate(racers[0].node,speed,steer,race_time,dt)
	racers[0].node.rotation.z = lerpf(racers[0].node.rotation.z, -steer * (0.12 if drifting else 0.05), dt * 8)
	for name_value in ["ExhaustL","ExhaustR"]:
		var flame = racers[0].node.get_node(name_value)
		flame.visible = boost>0
		flame.scale.z = 0.8+sin(race_time*40)*0.2
	for i in range(1, 6):
		var r = racers[i]
		r.stun = maxf(0, r.stun - dt)
		r.boost = maxf(0,r.boost-dt)
		r.jump_lock = maxf(0,r.jump_lock-dt)
		var catchup = clampf((progress - r.progress) * 1.3, -1.8, 1.8)
		r.speed = move_toward(r.speed, 7.0 if r.stun > 0 else r.base + catchup + (7 if r.boost>0 else 0), 9 * dt)
		var local_length: float = track.point(r.q+0.0001,r.route).distance_to(track.point(r.q-0.0001,r.route))/0.0002
		r.progress += r.speed * dt / maxf(local_length,100)
		r.q = fposmod(r.progress, 1)
		var ai_direction: Vector3 = track.direction(r.q,r.route)
		r.node.position = track.point(r.q,r.route) + ai_direction.cross(Vector3.UP).normalized() * clampf(r.lane+sin(race_time*0.8+i)*0.6,-2.5,2.5) + Vector3.UP * 0.3
		r.node.rotation.y = atan2(-ai_direction.x,-ai_direction.z)
		r.node.visible=r.node.position.distance_squared_to(camera.position)<10000
		if r.node.visible:models.animate(r.node,r.speed,sin(race_time+i)*0.3,race_time,dt)
		for pad in terrain_pads:
			if r.node.position.distance_to(track.point(pad.q,pad.route))<3.5 and r.air<=0:
				if pad.kind=="boost":
					r.boost = 1.4
				elif pad.kind=="slow":
					r.speed = minf(r.speed,13)
				elif r.jump_lock<=0:
					r.air = air_duration
					r.jump_lock = 2.5
		if r.air>0:
			r.air = maxf(0,r.air-dt)
			var phase: float = 1-r.air/air_duration
			r.node.position.y += sin(phase*PI)*5
			r.node.rotation.x = phase*TAU
			if r.air<=0:
				r.node.rotation.x = 0
				r.boost = 1.8
		if r.node.position.distance_to(player_pos) < 2 and shield <= 0 and stun <= 0:
			speed *= 0.75
			stun = 0.8
	for b in boxes:
		b.cooldown = maxf(0, b.cooldown - dt)
		b.node.visible = b.cooldown <= 0
		if b.cooldown <= 0 and item == "" and b.node.position.distance_to(player_pos + Vector3.UP) < 2.8:
			item = ["BOOST", "SHIELD", "PULSE"][pickups % 3]
			pickups += 1
			b.cooldown = 8
			announce(item + " READY - E")
	var forward = Vector3(-sin(yaw), 0, -cos(yaw))
	camera.position = camera.position.lerp(player_pos - forward * 7.5 + Vector3.UP * 4.2, 1 - exp(-5 * dt))
	camera.look_at(player_pos + forward * 3 + Vector3.UP * 1.2)
	camera.fov = lerpf(camera.fov, 76 if boost > 0 else 68, dt * 3)
	var rank = 1
	for i in range(1, 6):
		if racers[i].progress > progress:
			rank += 1
	hud.text = "%d / 6   |   LAP %d / 3   |   %s%03d km/h   |   %.1fs" % [rank, clampi(int(maxf(0, progress)) + 1, 1, 3), "R " if speed<-.05 else "", int(absf(speed) * 3.6), race_time]
	item_button.text = (item if item != "" else "Item") + " - E"
	if race_time > flash_until:
		message.text = "DRIFT %d%%" % int(drift_charge / 2.5 * 100) if drifting else ("SHIELD" if shield > 0 else "")
	if wrong_way:message.text="WRONG WAY!"
	if progress >= LAPS:
		finished = true
		menu.show()
		result.text = "FINISH - %d / 6\nTime: %.2fs\n%s\nTry a cleaner drift on the next lap!" % [rank, race_time, "Purrfect podium!" if rank <= 3 else "Your rivals are waiting for a rematch."]
		race_button.text = "Race again"
		message.text = "FINISH!"













func batch_world() -> void:
	var chunks={}
	for node in get_children():
		if not node is Node3D or node is Light3D or node is WorldEnvironment:continue
		# Large continuous road and ground meshes stay global.
		if node is MeshInstance3D and node.mesh.get_aabb().size.length()>70:continue
		var cell=Vector2i(floori(node.position.x/64),floori(node.position.z/64))
		if not chunks.has(cell):
			var chunk=Node3D.new()
			add_child(chunk)
			chunk.position=Vector3(cell.x*64+32,0,cell.y*64+32)
			chunks[cell]=chunk
		node.reparent(chunks[cell],true)
	var batch=preload("res://scenery_batch.gd")
	for chunk in chunks.values():
		batch.merge(chunk)
		for part in chunk.get_children():
			if part is MeshInstance3D:
				part.visibility_range_end=115
				part.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	batch.merge(self,true)
	for part in get_children():
		if part is MeshInstance3D:part.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


