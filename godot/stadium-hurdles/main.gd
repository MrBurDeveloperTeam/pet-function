extends Node2D

const LANE_WIDTH := 3.0
const HIT_Z := 0.0
const JUMP_DURATION := 1.4
const JUMP_HEIGHT := 6.8
const ROLL_DURATION := 0.25
const DIVE_ROLL_DURATION := 0.15
const ROLL_WINDOW_DURATION := 0.75
const BASE_SPEED := 16.0
const POWERUP_DURATION := 10.0
const POWERUP_COST := 30
const FLIGHT_HEIGHT := 6.0
const FLIGHT_LANDING_DURATION := 1.25
const FLIGHT_SPEED_MULTIPLIER := 1.5
const AIR_HAZARDS := ["cloud","bird"]
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
var magnet_time := 0.0
var flight_time := 0.0
var flight_height := 0.0
var air_route_lane := -1
var camera_height := 0.0
var landing_velocity := 0.0
var jetpack_pickups := 0
var powerup_spawn_time := 10.0
var powerup_report_time := 0.0
var powerup_report_signature := ""
var opening_choice_available := false
var purchase_request := ""
var purchase_kind := ""
var quit_after_purchase := false
var pause_after_purchase := false
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
var reported_state := ""
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
		JavaScriptBridge.eval("window.addEventListener('message', function(event) { if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) return; if (['RUNNER_INIT','RUNNER_LEADERBOARD','RUNNER_TUTORIAL_START','RUNNER_RANKINGS_OPEN','RUNNER_RANKINGS_CLOSE','RUNNER_PAUSE_TOGGLE','RUNNER_POWERUP_PURCHASE_RESULT'].includes(event.data.type)) window.toothDashHostCallback(JSON.stringify(event.data)); else if (event.data.type === 'RUNNER_QUIT' || event.data.type === 'RUNNER_PAUSE') window.toothDashHostCallback(event.data.type); });")
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

func pickup_blocked(lane_index: int, z: float, height: float, air: bool = false, world_x: float = INF) -> bool:
	var x := (lane_index-1)*LANE_WIDTH if is_inf(world_x) else world_x
	for entity in entities:
		var hazard: bool=PICKUP_FLOORS.has(entity.kind) or entity.kind in AIR_HAZARDS
		var floor_height: float=1.8 if entity.kind in AIR_HAZARDS else PICKUP_FLOORS.get(entity.kind,0.0)
		if entity.get("air",false)==air and hazard and absf(entity.node.position.x-x)<1.65 and absf(entity.node.position.y-z)<PICKUP_CLEARANCE and height<floor_height: return true
	return false

func make_obstacle(kind: String, lane_index: int, z: float, height: float = 0.45, air: bool = false, paid: bool = false, world_x: float = INF) -> void:
	# The two courses have distinct hazards; benches and dentures stay grounded.
	if air and kind not in ["tooth","magnet","jetpack","cloud","bird"]: return
	if not air and kind in AIR_HAZARDS: return
	var x := (lane_index-1)*LANE_WIDTH if is_inf(world_x) else world_x
	if air and kind=="tooth": height=0.45
	# Neighbouring rows overlap in depth; a safe lane in one row may be blocked
	# by another. Check both insertion orders while retaining reachable high arcs.
	if kind=="tooth" and pickup_blocked(lane_index,z,height,air,x): return
	if PICKUP_FLOORS.has(kind) or kind in AIR_HAZARDS:
		for entity in entities:
			if entity.kind=="npc" and entity.lane==lane_index and entity.get("air",false)==air and absf(entity.node.position.y-z)<NPC_CLEARANCE: return
			if entity.kind in ["magnet","jetpack"] and entity.lane==lane_index and entity.get("air",false)==air and absf(entity.node.position.y-z)<PICKUP_CLEARANCE: return
		var floor_height: float=1.8 if kind in AIR_HAZARDS else PICKUP_FLOORS[kind]
		for i in range(entities.size()-1,-1,-1):
			var entity: Dictionary=entities[i]
			if entity.kind=="tooth" and entity.get("air",false)==air and absf(entity.node.position.x-x)<1.65 and absf(entity.node.position.y-z)<PICKUP_CLEARANCE and entity.height<floor_height:
				recycle_entity(entity.node)
				entities.remove_at(i)
	var node := acquire_entity()
	node.position=Vector2(x,z)
	node.show()
	entities.append({"node":node,"kind":kind,"lane":lane_index,"checked":false,"height":height,"air":air,"paid":paid})
	entity_revision+=1

func spawn_row() -> void:
	var air := flight_time>0
	if air:
		spawn_air_row()
		# The ground course continues below the flight route, ready for landing.
		make_obstacle("bench" if rng.randf()<0.5 else "equipment",rng.randi_range(0,2),-92)
	else:
		var kinds := ["closed","open","cone","bench","equipment"]
		var blocked := rng.randi_range(0,2)
		var kind: String = kinds[rng.randi_range(0,kinds.size()-1)]
		make_obstacle(kind,blocked,-92)
		var safe := (blocked+rng.randi_range(1,2))%3
		if elapsed > 12 and rng.randf() < 0.65:
			var other := 3-blocked-safe
			make_obstacle(kinds[rng.randi_range(0,kinds.size()-1)],other,-92)
		for i in range(10): make_obstacle("tooth",safe,-68-i*4.2)
		spawn_arc(blocked,-92)
		if elapsed>8 and rng.randf()<0.08: spawn_npc(0 if rng.randf()<0.5 else 2,-92)
	if not tutorial and powerup_spawn_time<=0 and flight_height<=FLIGHT_HEIGHT+0.1:
		spawn_powerup("magnet" if rng.randf()<0.5 else "jetpack",rng.randi_range(0,2),-64,air)
		powerup_spawn_time=rng.randf_range(13,20)

func spawn_air_row(center_z: float = -92.0) -> void:
	# A single trail approaches a random blocked lane, then turns into safety.
	var blocked := air_route_lane if air_route_lane>=0 else rng.randi_range(0,2)
	make_obstacle(AIR_HAZARDS[rng.randi_range(0,1)],blocked,center_z,0.65,true)
	# A diagonal is an escape route from this hazard, never an unrelated cross-lane trail.
	var safe_lane := 1 if blocked!=1 else (0 if rng.randf()<0.5 else 2)
	var turn_distance := run_speed()*LANE_WIDTH/18.0
	var turn_end := center_z+PICKUP_CLEARANCE+2.0
	var turn_start := turn_end+turn_distance
	for i in range(10):
		var z := center_z+24-i*4.2
		if z>turn_end and z<=turn_start: continue
		make_obstacle("tooth",blocked if z>turn_start else safe_lane,z,0.45,true)
	spawn_air_diagonal(blocked,safe_lane,turn_start)
	air_route_lane=safe_lane

func spawn_air_diagonal(from_lane: int, to_lane: int, start_z: float) -> void:
	var from_x := (from_lane-1)*LANE_WIDTH
	var to_x := (to_lane-1)*LANE_WIDTH
	var travel_distance := run_speed()*absf(to_x-from_x)/18.0
	for step in range(1,5):
		var phase := step/4.0
		var x := lerpf(from_x,to_x,phase)
		var nearest_lane := clampi(roundi(x/LANE_WIDTH)+1,0,2)
		make_obstacle("tooth",nearest_lane,start_z-travel_distance*phase,0.45,true,false,x)

func spawn_powerup(kind: String, target_lane: int, z: float, air: bool = false, paid: bool = false) -> void:
	# Every pickup has a clear approach, also respected by later hazard rows.
	for i in range(entities.size()-1,-1,-1):
		var entity: Dictionary=entities[i]
		if absf(entity.node.position.x-(target_lane-1)*LANE_WIDTH)<1.65 and entity.get("air",false)==air and absf(entity.node.position.y-z)<10:
			recycle_entity(entity.node)
			entities.remove_at(i)
	make_obstacle(kind,target_lane,z,0.8,air,paid)

func remove_opening_powerups() -> void:
	for i in range(entities.size()-1,-1,-1):
		if entities[i].get("paid",false):
			recycle_entity(entities[i].node)
			entities.remove_at(i)

func activate_powerup(kind: String) -> void:
	if kind=="magnet":
		magnet_time=POWERUP_DURATION
		# Existing passed teeth stay missed; activation never rewinds the road.
		for entity in entities:
			if entity.kind=="tooth" and entity.node.position.y>0.12: entity["magnet_missed"]=true
	else:
		flight_time=POWERUP_DURATION
		jetpack_pickups+=1
		if flight_height<=0:
			air_route_lane=-1
			flight_height=runner.position.y
			jump_time=0
			jump_buffer=0
			dive_velocity=0
			slide_time=0
			# Populate the flying route immediately, without a long empty ascent.
			for i in range(entities.size()-1,-1,-1):
				if entities[i].kind=="tooth":
					recycle_entity(entities[i].node)
					entities.remove_at(i)
			spawn_air_row(-52)
			# The opening segment begins closer than subsequent segments.
			spawn_time=8.0/run_speed()
	speed=run_speed()
	toast.text="MAGNET!" if kind=="magnet" else "JETPACK!  SPEED +50%"
	toast_time=1.1
	beep(660,0.09)
	report_powerups()

func request_powerup_purchase(kind: String) -> void:
	if not opening_choice_available or tutorial: return
	opening_choice_available=false
	purchase_kind=kind
	purchase_request=run_id+":"+kind
	state="purchasing"
	toast.text="BUYING..."
	toast_time=1.0
	post_host("RUNNER_STATE",{"state":state,"tutorial":tutorial})
	post_host("RUNNER_BUY_POWERUP",{"runId":run_id,"requestId":purchase_request,"kind":kind})
	world.queue_redraw()
	# Native preview has no shared wallet. Decline rather than grant for free.
	if not OS.has_feature("web"): resolve_powerup_purchase(run_id,purchase_request,false)

func resolve_powerup_purchase(result_run: String, request: String, approved: bool) -> void:
	if state!="purchasing" or result_run!=run_id or request!=purchase_request or purchase_request.is_empty(): return
	remove_opening_powerups()
	state="running"
	var kind := purchase_kind
	purchase_request=""
	purchase_kind=""
	if approved: activate_powerup(kind)
	else:
		toast.text="NEED 30 COINS / PURCHASE UNAVAILABLE"
		toast_time=2.0
	if quit_after_purchase: quit_run()
	elif pause_after_purchase: pause_run()
	world.queue_redraw()

func report_powerups() -> void:
	var magnet := snappedf(magnet_time,0.1)
	var jetpack := snappedf(flight_time,0.1)
	var landing := state in ["running","paused","rankings"] and flight_time<=0 and flight_height>0
	var signature := "%s:%.1f:%.1f:%s" % [run_id,magnet,jetpack,landing]
	if signature==powerup_report_signature: return
	powerup_report_signature=signature
	post_host("RUNNER_POWERUPS",{"runId":run_id,"magnet":magnet,"jetpack":jetpack,"landing":landing})

func end_flight() -> void:
	# Keep ground obstacles visible and let the player steer during descent.
	flight_height=runner.position.y
	landing_velocity=flight_height/FLIGHT_LANDING_DURATION
	jump_time=0
	dive_velocity=0
	slide_time=0
	for i in range(entities.size()-1,-1,-1):
		var entity: Dictionary=entities[i]
		if entity.get("air",false):
			recycle_entity(entity.node)
			entities.remove_at(i)
	toast.text="LANDING..."
	toast_time=1.0

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

func spawn_arc(lane_index: int, center_z: float, air: bool = false) -> void:
	# A 1.4 second jump travels about 18–37 metres as the run accelerates.
	# Tooth heights follow the same sine as the cat, with the obstacle at the apex.
	for i in range(7):
		var phase := 0.08+i*0.14
		make_obstacle("tooth",lane_index,center_z+(0.5-phase)*speed*JUMP_DURATION,0.45+sin(phase*PI)*JUMP_HEIGHT,air)

func can_collect(cat_height: float, tooth_height: float) -> bool:
	return absf(cat_height+0.45-tooth_height)<1.0

func run_speed() -> float:
	var ground_speed := BASE_SPEED*(1.0+floori(teeth/200.0)*0.2)
	# Flight is a temporary boost over the current ground speed, including
	# its tooth milestones. Remove it on touchdown, never leave a pickup bonus.
	return ground_speed*(FLIGHT_SPEED_MULTIPLIER if is_flying() else 1.0)

func is_flying() -> bool:
	return flight_time>0 or flight_height>0

func is_grounded() -> bool:
	if flight_time<=0 and flight_height>0: return false
	return runner.position.y<=flight_height+0.02 and (jump_time<=0 or jump_time<JUMP_DURATION*0.5)

func begin_jump() -> void:
	if is_flying(): return
	jump_buffer=0
	dive_velocity=0
	slide_time=0
	runner.position.y=flight_height
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
	if state in ["loading","crashed","purchasing"]: return
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
	if state!=reported_state:
		reported_state=state
		post_host("RUNNER_STATE",{"state":state,"tutorial":tutorial})
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

func tooth_contact(before: Vector2, after: Vector2, tooth_x: float, before_z: float, after_z: float, height: float, rolling: bool = false) -> bool:
	# Intersect the contact intervals on all axes at the same instant, including touchdown.
	# The tuck-and-roll silhouette reaches low arc teeth around the cat's head.
	var center_height := 1.25 if rolling else 0.45
	var start := Vector3(before.x-tooth_x,before.y+center_height-height,before_z)
	var finish := Vector3(after.x-tooth_x,after.y+center_height-height,after_z)
	var bounds := Vector3(1.25,1.25 if rolling else 1.0,1.8)
	var enter := 0.0
	var leave := 1.0
	for axis in range(3):
		var change: float=finish[axis]-start[axis]
		if absf(change)<0.000001:
			if absf(start[axis])>=bounds[axis]: return false
			continue
		var first: float=(-bounds[axis]-start[axis])/change
		var last: float=(bounds[axis]-start[axis])/change
		enter=maxf(enter,minf(first,last))
		leave=minf(leave,maxf(first,last))
		if enter>leave: return false
	return true

func simulate(dt: float) -> void:
	if state == "running":
		var previous_cat := runner.position
		var was_rolling := slide_time>0
		if jump_time>0 and dive_velocity<=0:
			previous_cat.y=flight_height+sin((1.0-jump_time/JUMP_DURATION)*PI)*JUMP_HEIGHT
		if celebration_time>0:
			celebration_time=maxf(0,celebration_time-dt)
			return
		if tutorial and tutorial_waiting: return
		animation_time+=dt
		if not tutorial: elapsed += dt
		magnet_time=maxf(0,magnet_time-dt)
		var was_flying := flight_time>0
		flight_time=maxf(0,flight_time-dt)
		if was_flying and flight_time<=0: end_flight()
		flight_height=move_toward(flight_height,FLIGHT_HEIGHT if flight_time>0 else 0,dt*(6.0 if flight_time>0 else landing_velocity))
		# Follow the flight floor, leaving aerial jumps visible above the cat.
		# World positions and collision rules stay independent of the camera.
		camera_height=lerpf(camera_height,flight_height,1.0-exp(-dt*7.5))
		if flight_height==0 and camera_height<0.001: camera_height=0
		powerup_spawn_time-=dt
		powerup_report_time-=dt
		if powerup_report_time<=0:
			powerup_report_time=0.1
			report_powerups()
		speed = run_speed()
		distance += speed*dt
		jump_time = maxf(0,jump_time-dt)
		slide_time = maxf(0,slide_time-dt)
		var jump_height := flight_height+(sin((1.0-jump_time/JUMP_DURATION)*PI)*JUMP_HEIGHT if jump_time>0 else 0.0)
		if dive_velocity>0:
			jump_height=move_toward(runner.position.y,flight_height,dt*dive_velocity)
			if jump_height<=flight_height:
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
			spawn_time = 48.0/speed if flight_time>0 else maxf(1.05,1.65-elapsed*0.006)
		var tutorial_action_time := ROLL_WINDOW_DURATION*0.5 if tutorial and LESSONS[tutorial_step][0]==KEY_DOWN else JUMP_DURATION*0.5
		for entity in entities:
			var node: Node2D = entity.node
			if entity.get("pull",0.0)>0:
				entity.pull=maxf(0,entity.pull-dt)
				var phase: float=1-entity.pull/0.18
				node.position=entity.pull_from.lerp(Vector2(runner.position.x,0),phase)
				entity.height=lerpf(entity.pull_height,runner.position.y+0.45,phase)
				if entity.pull<=0: node.hide()
				continue
			var previous_z := node.position.y
			node.position.y += speed*dt
			if tutorial and not tutorial_acted and entity.kind!="tooth" and node.position.y>=-speed*tutorial_action_time:
				tutorial_waiting=true
				return
			# Pickups remain eligible across the whole contact interval. Switching
			# lanes or landing after z=0 must not permanently discard a tooth.
			if entity.kind in ["magnet","jetpack"]:
				var pickup_height: float=entity.height+(FLIGHT_HEIGHT if entity.air else 0)
				if not entity.checked and absf(node.position.y)<=1.8 and absf(node.position.x-runner.position.x)<1.25 and can_collect(jump_height,pickup_height):
					entity.checked=true
					node.hide()
					if entity.paid:
						request_powerup_purchase(entity.kind)
						break
					activate_powerup(entity.kind)
				continue
			if entity.kind in ["tooth","npc"]:
				var magnetic: bool=entity.kind=="tooth" and magnet_time>0 and not entity.get("magnet_missed",false) and previous_z<=0.12 and node.position.y>=0 and node.position.y<=maxf(0.2,speed*dt+0.12)
				var contact_width := 2.05 if entity.kind=="npc" else 1.25
				var tooth_height: float=entity.height+(FLIGHT_HEIGHT if entity.air else 0)
				var swept_tooth: bool=entity.kind=="tooth" and tooth_contact(previous_cat,runner.position,node.position.x,previous_z,node.position.y,tooth_height,was_rolling or slide_time>0)
				if not entity.checked and (magnetic or swept_tooth or (entity.kind=="npc" and node.position.y>=-1.8 and node.position.y<=1.8 and absf(node.position.x-runner.position.x)<contact_width)):
					var reachable: bool=magnetic or swept_tooth or (entity.kind=="npc" and jump_height<1.2)
					if reachable:
						entity.checked=true
						teeth+=30 if entity.kind=="npc" else 1
						if not tutorial: post_host("RUNNER_SCORE",{"runId":run_id,"teeth":teeth})
						if magnetic:
							entity.pull=0.18
							entity.pull_from=node.position
							entity.pull_height=tooth_height
							entity.height=tooth_height
							entity.air=false
						else: burst(node.position)
						if entity.kind=="npc":
							celebrate_high_five()
						elif not magnetic: node.visible=false
						beep(880,0.055)
				continue
			if not entity.checked and node.position.y >= HIT_Z:
				entity.checked = true
				var contact_height: float=jump_height-(FLIGHT_HEIGHT if entity.air else 0)
				var same_course: bool=entity.air if flight_time>0 else not entity.air and flight_height<=0
				if same_course and absf(node.position.x-runner.position.x)<1.05 and not can_pass(entity.kind,contact_height,slide_time>0):
					if tutorial: prepare_lesson()
					else: finish_run("collision")
					break
		for i in range(entities.size()-1,-1,-1):
			if entities[i].node.position.y>8:
				recycle_entity(entities[i].node)
				entities.remove_at(i)
		if opening_choice_available and distance>55:
			opening_choice_available=false
			remove_opening_powerups()
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
	if is_flying(): return
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
			if state=="rankings":
				close_rankings()
				return
			pause_run()
			return
		if event.keycode==KEY_ENTER and state in ["menu","over","tutorial_done"]:
			primary_action()
			return
		if state!="running" or celebration_time>0: return
		# The jetpack course, including the landing, has lateral controls only.
		if is_flying() and action_key in [KEY_UP,KEY_DOWN]:
			get_viewport().set_input_as_handled()
			return
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
				if flight_time<=0 and flight_height>0: pass
				elif jump_time>0 or runner.position.y>flight_height:
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

func start_run(practice: bool = false, opening: bool = true) -> void:
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
	magnet_time=0
	flight_time=0
	flight_height=0
	camera_height=0
	landing_velocity=0
	jetpack_pickups=0
	air_route_lane=-1
	powerup_spawn_time=rng.randf_range(9,14)
	powerup_report_time=0
	opening_choice_available=not practice and opening
	purchase_request=""
	purchase_kind=""
	quit_after_purchase=false
	pause_after_purchase=false
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
	if opening_choice_available:
		# Leave the starting lane free, so spending coins always needs a choice.
		var first := 0 if rng.randf()<0.5 else 2
		spawn_powerup("magnet",first,-36,false,true)
		spawn_powerup("jetpack",2-first,-36,false,true)
	report_powerups()
	toast.text="GO!"
	toast_time=3.0

func finish_run(reason: String) -> void:
	if reward_sent or state not in ["running","paused"]: return
	if tutorial: return
	reward_sent=true
	magnet_time=0
	flight_time=0
	if reason!="collision":
		flight_height=0
		camera_height=0
	state="crashed" if reason=="collision" else "over"
	report_powerups()
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
		runner.position.y=flight_height
		sparks.clear()
		toast_time=0
	else: results.reveal()

func pause_run() -> void:
	if state=="purchasing":
		pause_after_purchase=true
		return
	if state=="rankings": return
	if state=="running":
		state="paused"
		show_panel("PAUSED", "Take your time.", "CONTINUE")
	elif state=="paused":
		state="running"
		overlay.hide()

func open_rankings() -> void:
	if state in ["rankings","crashed","purchasing"]: return
	ranking_return_state=state
	state="rankings"
	# The web host draws portraits as native images without cross-origin
	# canvas copies. Desktop keeps the in-engine records board.
	if not OS.has_feature("web"): ranking_panel.reveal()
	post_host("RUNNER_RANKINGS_REQUEST")

func close_rankings() -> void:
	ranking_panel.hide()
	state=ranking_return_state
	if state=="paused": show_panel("PAUSED", "Take your time.", "CONTINUE")

func primary_action() -> void:
	if state=="paused": pause_run()
	else: start_run()

func quit_run() -> void:
	if state=="purchasing":
		quit_after_purchase=true
		return
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
				"RUNNER_RANKINGS_CLOSE":
					if state=="rankings": close_rankings()
				"RUNNER_PAUSE_TOGGLE": pause_run()
				"RUNNER_POWERUP_PURCHASE_RESULT": resolve_powerup_purchase(str(payload.get("runId","")),str(payload.get("requestId","")),payload.get("approved",false)==true)
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


