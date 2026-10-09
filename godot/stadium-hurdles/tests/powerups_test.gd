extends SceneTree

func _initialize() -> void: call_deferred("verify")

func fresh(game) -> void:
	game.start_run(false,false)
	game.spawn_time=1000

func key(game, code: int) -> void:
	var event := InputEventKey.new()
	event.keycode=code
	event.pressed=true
	game._unhandled_input(event)

func verify() -> void:
	var game=load("res://main.gd").new()
	root.add_child(game)
	game.set_process(false)
	fresh(game)
	game.begin_roll()
	game.make_obstacle("tooth",1,-0.1,2.2)
	game.make_obstacle("tooth",1,-0.1,5.5)
	game._process(0.02)
	assert(game.teeth==1,"Rolling collects low arc teeth overlapping the cat, while high obstacle teeth still require jumping")
	assert(game.tooth_contact(Vector2(0,1.2),Vector2(0,0),0,1.6,2.2,0.45),"A descending cat collects a tooth touched between simulation steps")
	assert(game.tooth_contact(Vector2.ZERO,Vector2.ZERO,0,-3,3,0.45),"Fast travel cannot tunnel through a tooth")
	assert(not game.tooth_contact(Vector2(0,3),Vector2(0,3),0,-3,3,0.45),"Jumping above a ground tooth does not collect it")
	assert(not game.tooth_contact(Vector2(0,3),Vector2(0,0),0,1.7,5,0.45),"Landing after passing a tooth does not collect it retrospectively")
	game.start_run()
	assert(game.entities.size()==2 and game.entities[0].lane!=game.entities[1].lane)
	assert(game.entities[0].paid and game.entities[1].paid and game.opening_choice_available,"The opening has two priced choices and a free lane")
	assert(game.entities[0].lane!=1 and game.entities[1].lane!=1,"The starting lane must stay free to avoid an automatic coin purchase")
	fresh(game)
	game.teeth=400
	assert(is_equal_approx(game.run_speed(),22.4))
	game.activate_powerup("jetpack")
	assert(is_equal_approx(game.run_speed(),33.6),"Flight is 50% faster than the current milestone-based ground speed")
	game.activate_powerup("jetpack")
	assert(is_equal_approx(game.run_speed(),33.6) and game.flight_time==10,"Repeated jetpacks refresh ten seconds without compounding the temporary speed boost")
	game.teeth=600
	assert(is_equal_approx(game.run_speed(),38.4),"Tooth milestones remain active during flight")
	fresh(game)
	game.make_obstacle("tooth",0,-0.1)
	game.make_obstacle("tooth",1,-0.1,6.8)
	game.make_obstacle("tooth",2,-0.1)
	game.make_obstacle("tooth",0,-8)
	game.make_obstacle("tooth",2,0.8)
	game.activate_powerup("magnet")
	game._process(0.02)
	assert(game.teeth==3,"Magnet takes the current row in all three lanes, including high teeth")
	assert(not game.entities[3].checked and not game.entities[4].checked,"Teeth ahead and already passed teeth must stay in place")
	assert(game.entities[0].pull>0 and game.entities[0].node.visible,"Only contact-row teeth animate toward the cat")
	game._process(0.21)
	assert(not game.entities[0].node.visible and game.teeth==3,"Attraction finishes without awarding the tooth twice")
	game._process(0.31)
	assert(game.teeth==4,"A forward tooth is collected only when its own row arrives")
	game.pause_run()
	var timer: float=game.magnet_time
	game._process(4)
	assert(game.magnet_time==timer)
	game.pause_run()
	game.open_rankings()
	game._process(4)
	assert(game.magnet_time==timer,"Pause and rankings both freeze powerup countdowns")
	game.close_rankings()
	game._process(10)
	assert(game.magnet_time==0)
	game.make_obstacle("tooth",0,-0.1)
	game._process(0.02)
	assert(game.teeth==4,"Expired magnet must stop collecting neighbouring lanes")
	fresh(game)
	game.make_obstacle("bench",2,-40)
	game.spawn_powerup("magnet",2,-40)
	game.make_obstacle("equipment",2,-43)
	assert(game.entities.size()==1 and not game.entities[0].paid,"Random free items have a clear approach respected by later obstacles")
	fresh(game)
	game.spawn_powerup("jetpack",1,-0.1)
	game._process(0.02)
	assert(game.flight_time>9.9 and game.jetpack_pickups==1,"Free jetpack activate on contact without a wallet purchase")
	game._process(1.05)
	assert(is_equal_approx(game.runner.position.y,game.FLIGHT_HEIGHT))
	assert(game.FLIGHT_HEIGHT>5.5,"The jetpack flies visibly higher than the old wing route")
	assert(game.camera_height>5.3 and game.camera_height<game.FLIGHT_HEIGHT,"The camera rises smoothly with the aerial course")
	var flight_view: Vector3=game.world.project(0,0,game.runner.position.y)
	var forward_view: Vector3=game.world.project(0,-80,game.FLIGHT_HEIGHT+0.45)
	assert(flight_view.y>540 and flight_view.y<590,"Flight keeps the cat below the forward route instead of at the horizon")
	assert(flight_view.y-forward_view.y>280,"The visible aerial route has substantial depth in front of the cat")
	var ground_renderer=game.world.get_children()[1]
	var scenery_renderer=game.world.get_children()[2]
	ground_renderer._process(0)
	var ground_span: float=ground_renderer.surface.get_shader_parameter("depth_span")
	for z in [-80.0,-20.0,0.0]:
		var edge: Vector3=scenery_renderer.project(4.5,z)
		var depth := (edge.y-210.0)/ground_span
		var world_x := (edge.x-710.2)/(108.0*depth)+0.65
		var world_z := (1.0-1.0/depth)/0.065
		assert(is_equal_approx(world_x,4.5) and is_equal_approx(world_z,z),"Ground shader and scenery must agree at each track edge while the camera rises")
	game.pause_run()
	var paused_camera: float=game.camera_height
	game._process(2)
	assert(game.camera_height==paused_camera,"Pausing freezes the flight camera along with the powerup")
	game.pause_run()
	game.spawn_time=1000
	game.make_obstacle("tooth",1,-0.1,0.45,true)
	game._process(0.02)
	assert(game.teeth==1,"Flying route teeth are collectable at the cat's airborne height")
	key(game,KEY_D)
	assert(game.lane==2)
	for code in [KEY_SPACE,KEY_UP,KEY_W,KEY_DOWN,KEY_S]: key(game,code)
	game.begin_jump()
	game.begin_roll()
	game._process(0.2)
	assert(game.jump_time==0 and game.jump_buffer==0 and game.slide_time==0 and game.dive_velocity==0,"All jump and roll entry points are disabled in flight")
	assert(game.runner.position.x==game.LANE_WIDTH and game.runner.position.y==game.FLIGHT_HEIGHT,"Flight keeps sideways movement at a constant altitude")
	game.lane=1
	game.runner.position.x=0
	game.make_obstacle("closed",1,-0.1)
	game._process(0.02)
	assert(game.state=="running","The jetpack flies safely above ground obstacles")
	fresh(game)
	game.make_obstacle("tooth",1,-40,6.8)
	game.activate_powerup("jetpack")
	for entity in game.entities:
		if entity.kind=="tooth": assert(entity.air and entity.height==0.45,"Takeoff replaces old multi-lane ground teeth with the single flight route")
	game.powerup_spawn_time=1000
	game.elapsed=100
	game.rng.seed=44
	for row in range(12):
		var first: int=game.entities.size()
		var previous_lane: int=game.air_route_lane
		game.spawn_air_row(-92-row*48)
		assert(previous_lane<0 or game.entities[first].lane==previous_lane,"The next hazard and approach continue from the preceding route endpoint, never jumping to an unrelated lane")
		assert(abs(game.entities[first].lane-game.air_route_lane)==1,"Every lane change follows an adjacent diagonal escape route")
		var depth_lanes := {}
		for index in range(first,game.entities.size()):
			var tooth: Dictionary=game.entities[index]
			if tooth.kind!="tooth": continue
			var depth: String="%.3f" % tooth.node.position.y
			assert(not depth_lanes.has(depth),"Each flight segment has a single tooth route rather than parallel trails in three lanes")
			depth_lanes[depth]=tooth.lane
	var air_kinds := {}
	var tooth_lanes := {}
	var connectors := 0
	for entity in game.entities:
		assert(entity.air and entity.kind in ["tooth","cloud","bird"],"The sky course has distinct clouds and birds, never ground furniture")
		air_kinds[entity.kind]=true
		if entity.kind=="tooth":
			assert(entity.height==0.45 and not game.pickup_blocked(entity.lane,entity.node.position.y,entity.height,true,entity.node.position.x),"Aerial teeth stay reachable and clear of hazards in either insertion order")
			tooth_lanes[entity.lane]=true
			if absf(entity.node.position.x)>0.01 and absf(entity.node.position.x)<game.LANE_WIDTH-0.01:
				connectors+=1
				var guides_hazard := false
				for hazard in game.entities:
					if hazard.kind not in game.AIR_HAZARDS: continue
					var lead: float=entity.node.position.y-hazard.node.position.y
					var blocked_x: float=hazard.node.position.x
					var turn_distance: float=game.run_speed()*game.LANE_WIDTH/18.0
					var leaves_blocked_lane: bool=(blocked_x<0 and entity.node.position.x<0) or (blocked_x>0 and entity.node.position.x>0) or blocked_x==0
					if leaves_blocked_lane and lead>=game.PICKUP_CLEARANCE+2.0-0.01 and lead<=game.PICKUP_CLEARANCE+turn_distance+2.0:
						guides_hazard=true
				assert(guides_hazard,"Every diagonal leads away from a blocked lane before its hazard, with time to finish the turn")
	assert(air_kinds.has("cloud") and air_kinds.has("bird") and tooth_lanes.size()==3 and connectors>0,"Flight generates both hazards, tooth trails in all three lanes and connecting pickups")
	for hazard in game.entities:
		if hazard.kind not in game.AIR_HAZARDS: continue
		var blocked_lanes := {}
		for other in game.entities:
			if other.kind in game.AIR_HAZARDS and absf(other.node.position.y-hazard.node.position.y)<game.PICKUP_CLEARANCE: blocked_lanes[other.lane]=true
		assert(blocked_lanes.size()==1,"Each aerial encounter leaves two lanes open for lateral evasion")
	var count: int=game.entities.size()
	for kind in game.PICKUP_FLOORS: game.make_obstacle(kind,1,-20,0.45,true)
	game.make_obstacle("npc",1,-20,0,true)
	assert(game.entities.size()==count,"Ground hazards and NPCs cannot be inserted into the aerial course")
	fresh(game)
	game.activate_powerup("jetpack")
	game._process(1.05)
	game.spawn_time=1000
	game.make_obstacle("bird",1,-8,0.65,true)
	game.make_obstacle("tooth",2,-0.5,0.45,true,false,1.5)
	var before_connector: int=game.teeth
	key(game,KEY_D)
	game._process(0.3)
	assert(game.state=="running" and game.teeth>before_connector,"A lane change collects the in-between tooth and avoids the bird")
	game._process(0.2)
	assert(game.state=="running","Aerial hazards are passed safely from another lane")
	for direction in [-1,1]:
		fresh(game)
		game.teeth=1000
		game.flight_time=10
		game.flight_height=game.FLIGHT_HEIGHT
		game.runner.position.y=game.FLIGHT_HEIGHT
		game.spawn_air_diagonal(1,1+direction,0)
		assert(game.entities.size()==4,"Each adjacent lane transition has four diagonal teeth")
		var last_z: float=0
		for tooth in game.entities:
			assert(tooth.node.position.y<last_z,"Diagonal teeth extend forward rather than sharing a transverse row")
			last_z=tooth.node.position.y
		key(game,KEY_D if direction==1 else KEY_A)
		game._process(0.2)
		assert(game.teeth==1004,"All diagonal teeth can be collected during a single lane change at increased speed")
	fresh(game)
	game.activate_powerup("jetpack")
	game._process(1.05)
	game.spawn_time=1000
	game.make_obstacle("cloud",1,-0.1,0.65,true)
	key(game,KEY_SPACE)
	key(game,KEY_S)
	game._process(0.02)
	assert(game.state=="crashed" and game.runner.position.y==game.FLIGHT_HEIGHT and game.camera_height>5.3,"An aerial collision retains the flight view for the hurt animation, rather than teleporting to the ground")
	assert(game.world.position.length()>0,"Aerial collisions retain screen shake")
	game._process(game.CRASH_DURATION)
	assert(game.state=="over" and game.results.visible,"The results appear only after the aerial hurt animation")
	fresh(game)
	game.activate_powerup("jetpack")
	game._process(1.05)
	game.spawn_time=1000
	game.flight_time=0.02
	game.make_obstacle("tooth",1,-1,0.45,true)
	game.make_obstacle("bench",1,-10)
	game._process(0.03)
	assert(game.flight_time==0 and game.runner.position.y>3 and game.state=="running","Expiry begins a gentle landing rather than teleporting")
	assert(game.camera_height>5.3,"Expiry must not snap the camera back to the ground")
	for code in [KEY_SPACE,KEY_W,KEY_UP,KEY_S,KEY_DOWN]: key(game,code)
	assert(game.jump_time==0 and game.jump_buffer==0 and game.slide_time==0,"Landing also disables jump, roll and deferred jump inputs")
	assert(is_equal_approx(game.run_speed(),24.0),"The temporary boost stays active until touchdown")
	var retained_bench := false
	for entity in game.entities:
		assert(not entity.air,"Expiry removes sky entities without clearing the ground course")
		if entity.kind=="bench" and entity.lane==1: retained_bench=true
	assert(retained_bench,"The nearby ground bench remains visible during descent")
	key(game,KEY_D)
	game._process(0.2)
	assert(game.runner.position.x==game.LANE_WIDTH and game.flight_height>0,"The player can steer right while descending")
	key(game,KEY_A)
	game._process(0.2)
	assert(game.runner.position.x==0 and game.flight_height>0,"The player can also steer left during descent")
	key(game,KEY_D)
	game._process(0.9)
	assert(game.runner.position.y==0 and game.flight_height==0)
	assert(game.camera_height<0.5,"The camera gently returns to the ground with the landing cat")
	key(game,KEY_SPACE)
	assert(game.jump_time>0,"Normal jumping resumes immediately after the landing")
	assert(is_equal_approx(game.run_speed(),16.0),"Touchdown restores the ground speed with no permanent jetpack bonus")
	fresh(game)
	game.activate_powerup("jetpack")
	game._process(1)
	var one_frame_camera: float=game.camera_height
	fresh(game)
	game.activate_powerup("jetpack")
	for frame in range(60): game._process(1.0/60.0)
	assert(is_equal_approx(game.camera_height,one_frame_camera),"Flight camera follows at the same speed across different frame timings")
	fresh(game)
	game.state="purchasing"
	game.purchase_request="opening"
	game.purchase_kind="magnet"
	game.resolve_powerup_purchase("old","opening",true)
	assert(game.state=="purchasing" and game.magnet_time==0)
	game.resolve_powerup_purchase(game.run_id,"opening",false)
	assert(game.state=="running" and game.magnet_time==0,"Failed purchases never activate a free powerup")
	game.state="purchasing"
	game.purchase_request="second"
	game.purchase_kind="jetpack"
	game.resolve_powerup_purchase(game.run_id,"second",true)
	assert(game.flight_time==10 and game.jetpack_pickups==1)
	game.resolve_powerup_purchase(game.run_id,"second",true)
	assert(game.jetpack_pickups==1,"Repeated wallet responses cannot grant a second effect")
	game.start_tutorial()
	assert(game.magnet_time==0 and game.flight_time==0 and game.jetpack_pickups==0 and not game.opening_choice_available,"Tutorial and replay clear powerups, bonuses and priced offers")
	assert(game.camera_height==0,"A fresh tutorial starts with the ground camera")
	game.flight_time=10
	game.flight_height=game.FLIGHT_HEIGHT
	for collected in [2000,3000,4000,10000]:
		game.teeth=collected
		assert(is_equal_approx(game.run_speed(),64.0),"Jetpack cannot exceed the ground speed at 3000 teeth")
	game.flight_time=0
	game.flight_height=0
	game.teeth=3000
	assert(is_equal_approx(game.run_speed(),64.0),"Flight cap equals the actual ground speed at 3000 teeth")
	game.teeth=4000
	assert(is_equal_approx(game.run_speed(),80.0),"Ground progression is not capped by the jetpack limit")
	print("PASS: powerups, aerial visibility and camera consistency, lateral-only flight, safe cloud/bird rows, connecting teeth, airborne crash feedback, temporary 50% flight speed and smooth landing")
	game.queue_free()
	await process_frame
	quit(0)
