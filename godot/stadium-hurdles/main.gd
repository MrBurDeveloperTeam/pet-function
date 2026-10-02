extends Node2D

const LANE_WIDTH := 3.0
const HIT_Z := 0.0
const JUMP_DURATION := 1.4
const JUMP_HEIGHT := 6.8
const ROLL_DURATION := 0.25
const DIVE_ROLL_DURATION := 0.15
const ROLL_WINDOW_DURATION := 0.75
const BASE_SPEED := 16.0
const JUMP_BUFFER_DURATION := 0.14
const PICKUP_CLEARANCE := 7.0
const PICKUP_FLOORS = {"bench":4.05,"equipment":4.05,"closed":2.5,"open":2.5,"cone":2.0}
const SHAKE_DURATION := 0.38
var rng := RandomNumberGenerator.new()
var runner: Node2D
var world: Node2D
var entities: Array[Dictionary] = []
var entity_pool: Array[Node2D] = []
var entity_revision := 0
var sparks: Array[Dictionary] = []
var lane := 1
var jump_time := 0.0
var jump_buffer := 0.0
var slide_time := 0.0
var roll_duration := ROLL_DURATION
var elapsed := 0.0
var distance := 0.0
var teeth := 0
var speed := 16.0
var spawn_time := 2.0
var state := "menu"
var run_id := ""
var reward_sent := false
var host_callback: JavaScriptObject
var hud: Label
var toast: Label
var toast_time := 0.0
var overlay: PanelContainer
var panel_title: Label
var panel_body: Label
var start_button: Button
var pause_button: Button
var audio: AudioStreamPlayer
var progress_time := 0.0
var animation_time := 0.0
var tutorial := false
var session_initialized := false
var tutorial_step := 0
var tutorial_waiting := false
var tutorial_acted := false
var tutorial_hint: Label
var skip_button: Button
var reward_row: HBoxContainer
var sounds := {}
var practice_button: Button
var accessibility_time := 0.0
var results: Control
var dive_velocity := 0.0
var leaderboard: Array = []
var leaderboard_status := "Loading rankings..."
var ranking_panel: Control
var ranking_return_state := "menu"
var celebration_time := 0.0
var crash_time := 0.0
const CRASH_DURATION := 1.35
const CELEBRATION_DURATION := 0.9
const NPC_CLEARANCE := 20.0
const LESSONS = [
	[KEY_LEFT,"LEFT / A", "Move left to avoid the bench", "bench"],
	[KEY_RIGHT,"RIGHT / D", "Move right to collect the teeth", "equipment"],
	[KEY_UP,"UP / W / SPACE", "Jump over the closed dentures", "closed"],
	[KEY_DOWN,"DOWN / S", "Roll through the open mouth", "open"],
	[KEY_UP,"UP / W / SPACE", "You can also jump over an open mouth", "open"],
	[KEY_UP,"UP / W / SPACE", "Follow the teeth above the cone", "cone"],
]

func _ready() -> void:
	rng.randomize()
	# Warm up once instead of allocating/freeing a whole pickup row during a run.
	for i in range(160):
		var node := Node2D.new()
		node.hide()
		add_child(node)
		entity_pool.append(node)
	build_world()
	build_cat()
	build_ui()
	audio = AudioStreamPlayer.new()
	add_child(audio)
	if OS.has_feature("web"):
		host_callback = JavaScriptBridge.create_callback(on_host_message)
		JavaScriptBridge.get_interface("window").toothDashHostCallback = host_callback
		# Compare browser Window identities in JavaScript, not Godot proxy wrappers.
		JavaScriptBridge.eval("window.addEventListener('message', function(event) { if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) return; if (['RUNNER_INIT','RUNNER_LEADERBOARD','RUNNER_TUTORIAL_START','RUNNER_RANKINGS_OPEN','RUNNER_PAUSE_TOGGLE'].includes(event.data.type)) window.toothDashHostCallback(JSON.stringify(event.data)); else if (event.data.type === 'RUNNER_QUIT' || event.data.type === 'RUNNER_PAUSE') window.toothDashHostCallback(event.data.type); });")
		state="loading"
		show_panel("CAT DASH", "Getting the track ready...", "...")
		start_button.disabled=true
		post_host("RUNNER_READY")
	else: initialize_session(false)

func build_world() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	world = load("res://pixel_renderer.gd").new()
	world.game=self
	add_child(world)

func build_cat() -> void:
	runner = Node2D.new()
	add_child(runner)

func recycle_entity(node: Node2D) -> void:
	entity_revision+=1
	node.hide()
	entity_pool.append(node)

func acquire_entity() -> Node2D:
	while not entity_pool.is_empty():
		var node: Node2D=entity_pool.pop_back()
		if is_instance_valid(node) and not node.is_queued_for_deletion(): return node
	var node := Node2D.new()
	add_child(node)
	return node

func pickup_blocked(lane_index: int, z: float, height: float) -> bool:
	for entity in entities:
		if PICKUP_FLOORS.has(entity.kind) and entity.lane==lane_index and absf(entity.node.position.y-z)<PICKUP_CLEARANCE and height<PICKUP_FLOORS[entity.kind]: return true
	return false

func make_obstacle(kind: String, lane_index: int, z: float, height: float = 0.45) -> void:
	# Neighbouring rows overlap in depth; a safe lane in one row may be blocked
	# by another. Check both insertion orders while retaining reachable high arcs.
	if kind=="tooth" and pickup_blocked(lane_index,z,height): return
	if kind not in ["npc","tooth"]:
		for entity in entities:
			if entity.kind=="npc" and entity.lane==lane_index and absf(entity.node.position.y-z)<NPC_CLEARANCE: return
		for i in range(entities.size()-1,-1,-1):
			var entity: Dictionary=entities[i]
			if entity.kind=="tooth" and entity.lane==lane_index and absf(entity.node.position.y-z)<PICKUP_CLEARANCE and entity.height<PICKUP_FLOORS[kind]:
				recycle_entity(entity.node)
				entities.remove_at(i)
	var node := acquire_entity()
	node.position=Vector2((lane_index-1)*LANE_WIDTH,z)
	node.show()
	entities.append({"node":node,"kind":kind,"lane":lane_index,"checked":false,"height":height})
	entity_revision+=1

func spawn_row() -> void:
	var kinds := ["closed","open","cone","bench","equipment"]
	var blocked := rng.randi_range(0,2)
	var kind: String = kinds[rng.randi_range(0,4)]
	make_obstacle(kind,blocked,-92)
	var safe := (blocked+rng.randi_range(1,2))%3
	if elapsed > 12 and rng.randf() < 0.65:
		var other := 3-blocked-safe
		make_obstacle(kinds[rng.randi_range(0,4)],other,-92)
	for i in range(10):
		make_obstacle("tooth",safe,-68-i*4.2)
	spawn_arc(blocked,-92)
	if elapsed>8 and rng.randf()<0.08: spawn_npc(0 if rng.randf()<0.5 else 2,-92)

func spawn_npc(edge_lane: int, z: float) -> void:
	# Leave the adjacent running lane clear, including rows spawned later.
	for i in range(entities.size()-1,-1,-1):
		var entity: Dictionary=entities[i]
		if entity.lane==edge_lane and entity.kind!="npc" and absf(entity.node.position.y-z)<NPC_CLEARANCE:
			recycle_entity(entity.node)
			entities.remove_at(i)
	make_obstacle("npc",edge_lane,z,0)
	entities.back().node.position.x=-4.7 if edge_lane==0 else 4.7

func celebrate_high_five() -> void:
	celebration_time=CELEBRATION_DURATION
	jump_time=0
	jump_buffer=0
	dive_velocity=0
	slide_time=0
	runner.position.y=0
	for i in range(18):
		var angle := TAU*i/18
		sparks.append({"pos":Vector2(runner.position.x,0),"velocity":Vector2(cos(angle)*2.8,sin(angle)*1.8),"height":1.4,"lift":2.2,"life":0.9,"star":true})
	toast.text="HIGH FIVE!  +30"
	toast_time=1.3

func spawn_arc(lane_index: int, center_z: float) -> void:
	# A 1.4 second jump travels about 18–37 metres as the run accelerates.
	# Tooth heights follow the same sine as the cat, with the obstacle at the apex.
	for i in range(7):
		var phase := 0.08+i*0.14
		make_obstacle("tooth",lane_index,center_z+(0.5-phase)*speed*JUMP_DURATION,0.45+sin(phase*PI)*JUMP_HEIGHT)

func can_collect(cat_height: float, tooth_height: float) -> bool:
	return absf(cat_height+0.45-tooth_height)<1.0

func run_speed() -> float:
	# Additive milestones: 200 = 110%, 400 = 120%, not compound interest.
	return BASE_SPEED*(1.0+floori(teeth/200.0)*0.1)

func is_grounded() -> bool:
	return runner.position.y<=0.02 and (jump_time<=0 or jump_time<JUMP_DURATION*0.5)

func begin_jump() -> void:
	jump_buffer=0
	dive_velocity=0
	slide_time=0
	runner.position.y=0
	jump_time=JUMP_DURATION
	beep(420,0.09)

func prepare_lesson() -> void:
	for entity in entities: recycle_entity(entity.node)
	entities.clear()
	lane=1
	runner.position=Vector2.ZERO
	jump_time=0
	jump_buffer=0
	dive_velocity=0
	slide_time=0
	tutorial_waiting=false
	tutorial_acted=false
	var lesson = LESSONS[tutorial_step]
	make_obstacle(lesson[3],1,-28)
	if tutorial_step<2:
		var target := 0 if tutorial_step==0 else 2
		for i in range(6): make_obstacle("tooth",target,-26-i*4.2)
	elif tutorial_step==5: spawn_arc(1,-28)
	tutorial_hint.text="%d / 6   %s" % [tutorial_step+1,lesson[2]]
	tutorial_hint.show()

func start_tutorial() -> void:
	start_run(true)
	tutorial_step=0
	prepare_lesson()
	post_host("RUNNER_TUTORIAL_STARTED")

func initialize_session(tutorial_seen: bool) -> void:
	if session_initialized: return
	session_initialized=true
	start_button.disabled=false
	if tutorial_seen: start_run()
	else: start_tutorial()

func request_tutorial() -> void:
	if state in ["loading","crashed"]: return
	if state=="rankings": close_rankings()
	# Settle earned rewards once before replacing a live run with practice.
	finish_run("quit")
	start_tutorial()

func _process(delta: float) -> void:
	# Substeps prevent tunnelling without discarding time on slower frames.
	var remaining := delta
	while remaining>0 and state in ["running","crashed"]:
		var dt := minf(remaining,1.0/120.0)
		if state=="crashed":
			crash_time=maxf(0,crash_time-dt)
			if crash_time<=0:
				state="over"
				results.reveal()
		else: simulate(dt)
		remaining-=dt
	world.position=collision_shake(CRASH_DURATION-crash_time) if state=="crashed" else Vector2.ZERO
	var effect_delta := delta if state=="running" else 0.0
	for i in range(sparks.size()-1,-1,-1):
		var spark: Dictionary = sparks[i]
		spark.life-=effect_delta
		spark.pos+=spark.velocity*effect_delta
		spark.height+=spark.lift*effect_delta
		if spark.life<=0: sparks.remove_at(i)
	if state in ["running","crashed"]: world.queue_redraw()
	toast_time = maxf(0,toast_time-effect_delta)
	toast.visible = toast_time>0
	hud.text = str(teeth)
	accessibility_time+=delta
	if accessibility_time>0.5:
		accessibility_time=0
		if OS.has_feature("web"):
			var description := "Cat Dash: %s, %d teeth" % [state,teeth]
			if tutorial and state=="running": description+="; lesson %d: %s; %s" % [tutorial_step+1,LESSONS[tutorial_step][2],"waiting for "+LESSONS[tutorial_step][1] if tutorial_waiting else "approaching"]
			JavaScriptBridge.eval("var canvas = document.getElementById('canvas'); if (canvas) { canvas.setAttribute('aria-label', %s); canvas.setAttribute('data-runner-fps', '%d'); }" % [JSON.stringify(description),Engine.get_frames_per_second()])
	if tutorial and state=="running" and tutorial_waiting:
		tutorial_hint.text="%d / 6   PRESS %s\n%s" % [tutorial_step+1,LESSONS[tutorial_step][1],LESSONS[tutorial_step][2]]

func simulate(dt: float) -> void:
	if state == "running":
		if celebration_time>0:
			celebration_time=maxf(0,celebration_time-dt)
			return
		if tutorial and tutorial_waiting: return
		animation_time+=dt
		if not tutorial: elapsed += dt
		speed = run_speed()
		distance += speed*dt
		jump_time = maxf(0,jump_time-dt)
		slide_time = maxf(0,slide_time-dt)
		var jump_height := sin((1.0-jump_time/JUMP_DURATION)*PI)*JUMP_HEIGHT if jump_time>0 else 0.0
		if dive_velocity>0:
			jump_height=move_toward(runner.position.y,0,dt*dive_velocity)
			if jump_height<=0:
				dive_velocity=0
				begin_roll(DIVE_ROLL_DURATION)
		runner.position.y = jump_height
		# A press just before touchdown is consumed on the very first grounded
		# step, including a fast dive landing in the middle of a roll.
		if jump_buffer>0 and is_grounded(): begin_jump()
		else: jump_buffer=maxf(0,jump_buffer-dt)
		runner.position.x = move_toward(runner.position.x,(lane-1)*LANE_WIDTH,dt*18)
		spawn_time -= dt
		if spawn_time<=0 and not tutorial:
			spawn_row()
			spawn_time = maxf(1.05,1.65-elapsed*0.006)
		var tutorial_action_time := ROLL_WINDOW_DURATION*0.5 if tutorial and LESSONS[tutorial_step][0]==KEY_DOWN else JUMP_DURATION*0.5
		for entity in entities:
			var node: Node2D = entity.node
			node.position.y += speed*dt
			if tutorial and not tutorial_acted and entity.kind!="tooth" and node.position.y>=-speed*tutorial_action_time:
				tutorial_waiting=true
				return
			# Pickups remain eligible across the whole contact interval. Switching
			# lanes or landing after z=0 must not permanently discard a tooth.
			if entity.kind in ["tooth","npc"]:
				var contact_width := 2.05 if entity.kind=="npc" else 1.25
				if not entity.checked and node.position.y>=-1.8 and node.position.y<=1.8 and absf(node.position.x-runner.position.x)<contact_width:
					var reachable := can_collect(jump_height,entity.height) if entity.kind=="tooth" else jump_height<1.2
					if reachable:
						entity.checked=true
						teeth+=30 if entity.kind=="npc" else 1
						burst(node.position)
						if entity.kind=="npc":
							celebrate_high_five()
						else: node.visible=false
						beep(880,0.055)
				continue
			if not entity.checked and node.position.y >= HIT_Z:
				entity.checked = true
				if absf(node.position.x-runner.position.x)<1.05 and not can_pass(entity.kind,jump_height,slide_time>0):
					if tutorial: prepare_lesson()
					else: finish_run("collision")
					break
		for i in range(entities.size()-1,-1,-1):
			if entities[i].node.position.y>8:
				recycle_entity(entities[i].node)
				entities.remove_at(i)
		if tutorial and tutorial_acted and entities.is_empty():
			tutorial_step+=1
			if tutorial_step<LESSONS.size(): prepare_lesson()
			else:
				state="tutorial_done"
				tutorial_hint.hide()
				show_panel("READY TO RUN", "10 teeth = 1 coin     1 min = 2 XP", "START RUN")
		progress_time += dt
		if progress_time >= 0.5 and not tutorial:
			progress_time=0
			post_host("RUNNER_PROGRESS",{"runId":run_id,"teeth":teeth,"elapsedSeconds":elapsed})

func collision_shake(age: float) -> Vector2:
	if age<0 or age>=SHAKE_DURATION: return Vector2.ZERO
	var strength := pow(1-age/SHAKE_DURATION,2)*9.0
	return Vector2(cos(age*91),sin(age*113)*0.65)*strength

func can_pass(kind: String, height: float, sliding: bool) -> bool:
	if kind=="npc": return true
	if kind=="closed" or kind=="cone": return height>1.05
	if kind=="open": return height>1.05 or sliding
	if kind in ["bench","equipment"]: return height>3.0
	return false

func begin_roll(duration: float = ROLL_DURATION) -> void:
	# Rotation speed must not shorten the time available to reach a passage.
	roll_duration=duration
	slide_time=ROLL_WINDOW_DURATION

func roll_phase() -> float:
	# Repeat fast forward rolls throughout the low-profile travel window.
	return fposmod((ROLL_WINDOW_DURATION-slide_time)/roll_duration,1.0)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		# Physical WASD works across keyboard layouts; synthetic events may only have keycode.
		var action_key: int=event.physical_keycode if event.physical_keycode!=0 else event.keycode
		match action_key:
			KEY_A: action_key=KEY_LEFT
			KEY_D: action_key=KEY_RIGHT
			KEY_W,KEY_SPACE: action_key=KEY_UP
			KEY_S: action_key=KEY_DOWN
		if event.keycode==KEY_P or event.keycode==KEY_ESCAPE:
			if ranking_panel.visible:
				close_rankings()
				return
			pause_run()
			return
		if event.keycode==KEY_ENTER and state in ["menu","over","tutorial_done"]:
			primary_action()
			return
		if state!="running" or celebration_time>0: return
		if tutorial:
			if tutorial_acted and action_key in [KEY_UP,KEY_DOWN]:
				pass
			else:
				if not tutorial_waiting or action_key!=LESSONS[tutorial_step][0]: return
				tutorial_waiting=false
				tutorial_acted=true
				tutorial_hint.text="NICE!"
		match action_key:
			KEY_LEFT: lane = maxi(0,lane-1)
			KEY_RIGHT: lane = mini(2,lane+1)
			KEY_UP:
				if is_grounded(): begin_jump()
				else: jump_buffer=JUMP_BUFFER_DURATION
			KEY_DOWN:
				jump_buffer=0
				if jump_time>0 or runner.position.y>0:
					jump_time=0
					dive_velocity=38.0
				else: begin_roll()
		get_viewport().set_input_as_handled()

func burst(pos: Vector2) -> void:
	for i in range(8):
		sparks.append({"pos":pos,"velocity":Vector2(rng.randf_range(-2,2),rng.randf_range(-1,1)),"height":0.8,"lift":rng.randf_range(1,3),"life":0.45})
	toast.text="+1 TOOTH"
	toast_time=0.55

func beep(frequency: float, duration: float) -> void:
	var key := str(frequency)
	if sounds.has(key):
		audio.stream=sounds[key]
		audio.play()
		return
	var sound := AudioStreamWAV.new()
	sound.format=AudioStreamWAV.FORMAT_16_BITS
	sound.mix_rate=22050
	var data := PackedByteArray()
	data.resize(int(duration*22050)*2)
	for i in range(data.size()/2):
		var sample := sin(float(i)/22050*frequency*TAU)*5000*(1-float(i)/(data.size()/2))
		data.encode_s16(i*2,int(sample))
	sound.data=data
	sounds[key]=sound
	audio.stream=sound
	audio.play()

func start_run(practice: bool = false) -> void:
	for entity in entities: recycle_entity(entity.node)
	entities.clear()
	sparks.clear()
	tutorial=practice
	tutorial_waiting=false
	tutorial_hint.hide()
	skip_button.visible=practice
	animation_time=0
	celebration_time=0
	crash_time=0
	world.position=Vector2.ZERO
	lane=1
	runner.position=Vector2.ZERO
	runner.scale=Vector2.ONE
	runner.rotation=0.0
	elapsed=0
	distance=0
	teeth=0
	speed=BASE_SPEED
	jump_time=0
	jump_buffer=0
	dive_velocity=0
	slide_time=0
	spawn_time=0.5
	roll_duration=ROLL_DURATION
	reward_sent=false
	run_id="%d-%d" % [Time.get_ticks_usec(),rng.randi()]
	state="running"
	overlay.hide()
	results.hide()
	ranking_panel.hide()
	pause_button.text="II"
	if not tutorial: post_host("RUNNER_STARTED",{"runId":run_id})
	toast.text="GO!"
	toast_time=3.0

func finish_run(reason: String) -> void:
	if reward_sent or state not in ["running","paused"]: return
	if tutorial: return
	reward_sent=true
	state="crashed" if reason=="collision" else "over"
	post_host("RUNNER_OVER",{"runId":run_id,"teeth":teeth,"elapsedSeconds":elapsed,"reason":reason})
	beep(120,0.25)
	runner.rotation=0.0
	overlay.hide()
	if reason=="collision":
		crash_time=CRASH_DURATION
		world.position=collision_shake(0)
		celebration_time=0
		jump_time=0
		jump_buffer=0
		dive_velocity=0
		slide_time=0
		runner.position.y=0
		sparks.clear()
		toast_time=0
	else: results.reveal()

func pause_run() -> void:
	if ranking_panel.visible: return
	if state=="running":
		state="paused"
		show_panel("PAUSED", "Take your time.", "CONTINUE")
	elif state=="paused":
		state="running"
		overlay.hide()

func open_rankings() -> void:
	if ranking_panel.visible or state=="crashed": return
	ranking_return_state=state
	state="rankings"
	ranking_panel.reveal()
	post_host("RUNNER_RANKINGS_REQUEST")

func close_rankings() -> void:
	ranking_panel.hide()
	state=ranking_return_state
	if state=="paused": show_panel("PAUSED", "Take your time.", "CONTINUE")

func primary_action() -> void:
	if state=="paused": pause_run()
	else: start_run()

func quit_run() -> void:
	if state=="rankings": close_rankings()
	finish_run("quit")
	post_host("RUNNER_CLOSE")

func post_host(type: String, details: Dictionary = {}) -> void:
	if not OS.has_feature("web"): return
	var payload := {"source":"pet-function:stadium-hurdles","type":type}
	payload.merge(details)
	JavaScriptBridge.eval("window.parent.postMessage(%s, window.location.origin);" % JSON.stringify(payload))

func on_host_message(args: Array) -> void:
	if str(args[0]).begins_with("{"):
		var payload = JSON.parse_string(args[0])
		if payload is Dictionary:
			match payload.get("type"):
				"RUNNER_INIT": initialize_session(payload.get("tutorialSeen",false)==true)
				"RUNNER_LEADERBOARD":
					leaderboard=payload.get("entries",[])
					leaderboard_status=payload.get("status","")
				"RUNNER_TUTORIAL_START": request_tutorial()
				"RUNNER_RANKINGS_OPEN": open_rankings()
				"RUNNER_PAUSE_TOGGLE": pause_run()
		return
	if args[0]=="RUNNER_QUIT": quit_run()
	if args[0]=="RUNNER_PAUSE" and state=="rankings" and ranking_return_state=="running": ranking_return_state="paused"
	if args[0]=="RUNNER_PAUSE" and state=="running": pause_run()

func label(text: String, size: int, color: Color = Color.WHITE) -> Label:
	var node := Label.new()
	node.text=text
	node.add_theme_font_override("font",preload("res://art/Quadrit.ttf"))
	node.add_theme_font_size_override("font_size",size)
	node.add_theme_color_override("font_color",color)
	return node

func style(bg: Color) -> StyleBoxFlat:
	var node := StyleBoxFlat.new()
	node.bg_color=bg
	node.border_color=Color("71472f")
	node.shadow_color=Color("3d291e")
	node.shadow_size=6
	node.shadow_offset=Vector2(5,5)
	node.border_width_left=4
	node.border_width_right=4
	node.border_width_top=4
	node.border_width_bottom=4
	node.content_margin_left=28
	node.content_margin_right=28
	node.content_margin_top=22
	node.content_margin_bottom=22
	return node

func build_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter=Control.MOUSE_FILTER_IGNORE
	canvas.add_child(root)
	var tooth_icon := TextureRect.new()
	var tooth_texture := AtlasTexture.new()
	tooth_texture.atlas=preload("res://art/obstacles-teeth.png")
	tooth_texture.region=world.object_regions[2]
	tooth_icon.texture=tooth_texture
	tooth_icon.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	tooth_icon.position=Vector2(554,22)
	tooth_icon.size=Vector2(42,45)
	root.add_child(tooth_icon)
	hud=label("",30,Color("fff4cf"))
	hud.position=Vector2(608,24)
	hud.add_theme_constant_override("outline_size",5)
	hud.add_theme_color_override("font_outline_color",Color("224269"))
	root.add_child(hud)
	toast=label("",32,Color("fff4a6"))
	toast.position=Vector2(340,85)
	toast.size=Vector2(600,50)
	toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	toast.add_theme_constant_override("outline_size",6)
	toast.add_theme_color_override("font_outline_color",Color("365378"))
	root.add_child(toast)
	pause_button=Button.new()
	pause_button.text="II"
	pause_button.position=Vector2(1098,22)
	pause_button.add_theme_stylebox_override("normal",style(Color("fff0ba")))
	pause_button.pressed.connect(pause_run)
	pause_button.focus_mode=Control.FOCUS_NONE
	pixel_button(pause_button)
	root.add_child(pause_button)
	pause_button.visible=not OS.has_feature("web")
	tutorial_hint=label("",22,Color("fff4cf"))
	tutorial_hint.position=Vector2(290,83)
	tutorial_hint.size=Vector2(700,70)
	tutorial_hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	tutorial_hint.add_theme_constant_override("outline_size",5)
	tutorial_hint.add_theme_color_override("font_outline_color",Color("224269"))
	tutorial_hint.hide()
	root.add_child(tutorial_hint)
	skip_button=Button.new()
	skip_button.text="SKIP PRACTICE"
	skip_button.position=Vector2(510,653)
	skip_button.add_theme_stylebox_override("normal",style(Color("c8e4eb")))
	skip_button.pressed.connect(func(): start_run())
	skip_button.focus_mode=Control.FOCUS_NONE
	pixel_button(skip_button)
	skip_button.hide()
	root.add_child(skip_button)
	var shade := ColorRect.new()
	shade.color=Color(0.2,0.13,0.08,0.35)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	root.add_child(shade)
	overlay=PanelContainer.new()
	overlay.position=Vector2(350,130)
	overlay.size=Vector2(580,0)
	overlay.add_theme_stylebox_override("panel",style(Color("fff0ba")))
	root.add_child(overlay)
	overlay.visibility_changed.connect(func(): shade.visible=overlay.visible)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",18)
	overlay.add_child(column)
	var crest := label("*  STADIUM CLUB  *",15,Color("28617b"))
	crest.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(crest)
	panel_title=label("",38,Color("224269"))
	panel_title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(panel_title)
	panel_body=label("",18,Color("735640"))
	panel_body.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(panel_body)
	reward_row=HBoxContainer.new()
	reward_row.alignment=BoxContainer.ALIGNMENT_CENTER
	reward_row.add_theme_constant_override("separation",20)
	column.add_child(reward_row)
	var buttons := HBoxContainer.new()
	buttons.alignment=BoxContainer.ALIGNMENT_CENTER
	buttons.add_theme_constant_override("separation",18)
	column.add_child(buttons)
	start_button=Button.new()
	start_button.add_theme_font_size_override("font_size",24)
	start_button.add_theme_stylebox_override("normal",style(Color("f5c45a")))
	start_button.pressed.connect(primary_action)
	start_button.focus_mode=Control.FOCUS_NONE
	pixel_button(start_button)
	buttons.add_child(start_button)
	var exit := Button.new()
	exit.text="BACK TO SPORTS"
	exit.add_theme_stylebox_override("normal",style(Color("c8e4eb")))
	exit.pressed.connect(quit_run)
	exit.focus_mode=Control.FOCUS_NONE
	pixel_button(exit)
	buttons.add_child(exit)
	practice_button=Button.new()
	practice_button.text="SKIP PRACTICE"
	practice_button.add_theme_stylebox_override("normal",style(Color("e5d8a9")))
	practice_button.pressed.connect(func():
		if state=="menu": start_run()
		else: start_tutorial())
	practice_button.focus_mode=Control.FOCUS_NONE
	pixel_button(practice_button)
	column.add_child(practice_button)
	var stadium_frame = load("res://stadium_panel.gd").new()
	stadium_frame.panel=overlay
	root.add_child(stadium_frame)
	results=load("res://result_panel.gd").new()
	results.game=self
	root.add_child(results)
	results.hide()
	results.visibility_changed.connect(func(): shade.visible=overlay.visible or results.visible)
	ranking_panel=load("res://ranking_panel.gd").new()
	ranking_panel.game=self
	root.add_child(ranking_panel)
	ranking_panel.hide()
	ranking_panel.visibility_changed.connect(func(): shade.visible=overlay.visible or results.visible or ranking_panel.visible)
	var ranking_button := Button.new()
	ranking_button.text=""
	ranking_button.tooltip_text="Rankings"
	ranking_button.position=Vector2(1208,106)
	ranking_button.custom_minimum_size=Vector2(48,48)
	var ranking_skin := style(Color("fff0ba"))
	ranking_skin.content_margin_left=8
	ranking_skin.content_margin_right=8
	ranking_skin.content_margin_top=8
	ranking_skin.content_margin_bottom=8
	ranking_button.add_theme_stylebox_override("normal",ranking_skin)
	pixel_button(ranking_button)
	ranking_button.focus_mode=Control.FOCUS_NONE
	ranking_button.pressed.connect(open_rankings)
	ranking_button.draw.connect(func():
		for i in range(3): ranking_button.draw_rect(Rect2(13,13+i*9,22-i*4,4),Color("224269")))
	root.add_child(ranking_button)
	ranking_button.visible=not OS.has_feature("web")

func add_reward_card(title: String, value: String, color: Color) -> void:
	var card := PanelContainer.new()
	card.custom_minimum_size=Vector2(210,100)
	card.add_theme_stylebox_override("panel",style(color))
	var column := VBoxContainer.new()
	var caption := label(title,14,Color("224269"))
	caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	var amount := label(value,32,Color("224269"))
	amount.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(caption)
	column.add_child(amount)
	card.add_child(column)
	reward_row.add_child(card)

func show_panel(title: String, body: String, action: String) -> void:
	for child in reward_row.get_children():
		reward_row.remove_child(child)
		child.queue_free()
	panel_title.text=title
	panel_body.text=body
	start_button.text=action
	practice_button.visible=state=="menu"
	practice_button.text="SKIP PRACTICE" if state=="menu" else "PRACTICE AGAIN"
	overlay.size=Vector2(580,0)
	overlay.show()

func pixel_button(button: Button) -> void:
	button.add_theme_font_override("font",preload("res://art/Quadrit.ttf"))
	button.add_theme_font_size_override("font_size",18)
	button.add_theme_color_override("font_color",Color("67432f"))
	button.add_theme_color_override("font_hover_color",Color("67432f"))
	button.add_theme_color_override("font_pressed_color",Color("67432f"))
	button.add_theme_stylebox_override("hover",style(Color("ffe398")))
	button.add_theme_stylebox_override("pressed",style(Color("edb764")))


