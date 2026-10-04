extends SceneTree

func _initialize() -> void:
	call_deferred("verify")

func key(game, code: int) -> void:
	var event := InputEventKey.new()
	event.keycode=code
	event.pressed=true
	game._unhandled_input(event)

func verify() -> void:
	var game = load("res://main.gd").new()
	root.add_child(game)
	game.set_process(false)
	assert(game.tutorial and game.tutorial_step==0 and game.state=="running","First entry must begin guided teaching without a question")
	game.session_initialized=false
	game.on_host_message([JSON.stringify({"type":"RUNNER_INIT","tutorialSeen":true})])
	assert(not game.tutorial and game.state=="running","Returning players must start a normal run directly")
	game.distance=12
	var initialized_run: String=game.run_id
	game.on_host_message([JSON.stringify({"type":"RUNNER_INIT","tutorialSeen":false})])
	assert(game.run_id==initialized_run and game.distance==12 and not game.tutorial,"Duplicate initialization must not restart the run")
	game.on_host_message([JSON.stringify({"type":"RUNNER_PAUSE_TOGGLE"})])
	assert(game.state=="paused")
	game.on_host_message([JSON.stringify({"type":"RUNNER_PAUSE_TOGGLE"})])
	assert(game.state=="running")
	game.on_host_message([JSON.stringify({"type":"RUNNER_RANKINGS_OPEN"})])
	assert(game.state=="rankings" and game.ranking_panel.visible)
	var ranking_distance: float=game.distance
	game._process(0.2)
	assert(game.distance==ranking_distance,"Opening records must freeze gameplay")
	game.on_host_message([JSON.stringify({"type":"RUNNER_RANKINGS_CLOSE"})])
	assert(game.state=="running" and not game.ranking_panel.visible,"The host records close button must restore the run")
	game.open_rankings()
	game.teeth=25
	game.on_host_message([JSON.stringify({"type":"RUNNER_TUTORIAL_START"})])
	assert(game.tutorial and game.tutorial_step==0 and game.state=="running" and not game.ranking_panel.visible,"Guide must leave rankings and start teaching from lesson one")
	assert(game.teeth==0 and game.elapsed==0 and game.run_id!=initialized_run)
	game.finish_run("quit")
	assert(not game.reward_sent,"Manual teaching must never earn wallet rewards")
	assert(game.world.object_regions.size()==6)
	assert(game.world.cat_regions.size()==8)
	var scenery = game.world.get_children().back()
	assert(scenery.LAMP_X<scenery.FENCE_X-0.8,"Lamp bases must stay separate from fence pillars")
	assert(fposmod(scenery.LAMP_SPACING,scenery.FENCE_SPACING)==0 and fposmod(scenery.LAMP_OFFSET-scenery.FENCE_OFFSET,scenery.FENCE_SPACING)==scenery.FENCE_SPACING*0.5,"Lamps must always stand halfway between fence pillars")
	assert(scenery.TREE_SPACING==54,"Trees must be more frequent than the original 160 m landscaping")
	game.start_run(false,false)
	var pooled_count: int=game.entity_pool.size()
	game.make_obstacle("tooth",1,-2)
	var reused_node: Node2D=game.entities.back().node
	assert(game.entity_pool.size()==pooled_count-1)
	game.start_run(false,false)
	assert(game.entity_pool.size()==pooled_count,"Replay must recycle nodes without allocating a new row")
	game.make_obstacle("bench",1,-20)
	assert(game.entities.back().node==reused_node and reused_node.visible,"Reused pickup nodes must show obstacles normally")
	game.start_run(false,false)
	assert(absf(game.world.project(0,0).x-640)<0.01,"Camera must keep the cat centered without moving its world position")
	for x in [-3.0,0.0,3.0]:
		var p: Vector3=game.world.project(x,0,game.JUMP_HEIGHT)
		assert(p.x>96 and p.x<1184 and p.y>180,"All three lanes and the full jump must remain visible")
	for child in game.world.get_children(): assert(child.z_index<0,"Scenery must render behind every cat and obstacle")
	assert(game.world.project(0,-92).y<game.world.project(0,0).y)
	assert(game.can_pass("closed",1.5,false))
	assert(not game.can_pass("closed",0.0,true))
	assert(game.can_pass("open",1.5,false) and game.can_pass("open",0.0,true))
	assert(game.can_pass("equipment",3.5,false))
	assert(game.can_pass("bench",3.5,false))
	assert(not game.can_pass("equipment",2.9,false))
	assert(game.world.object_regions[3].end.x<480,"Cone must never sample the neighbouring bench")
	assert(not game.can_pass("bench",0.0,true))
	assert(game.can_collect(0,0.45))
	assert(not game.can_collect(3.6,0.45),"Airborne cats must miss ground teeth")
	assert(game.can_collect(3.6,4.05))
	assert(not game.can_collect(0,4.05),"High teeth require a jump")
	for kind in game.PICKUP_FLOORS:
		game.start_run(false,false)
		game.make_obstacle("tooth",1,-40,0.45)
		game.make_obstacle(kind,1,-40)
		assert(game.entities.size()==1,"Spawning an obstacle must recycle teeth underneath it")
		game.make_obstacle("tooth",1,-42,0.45)
		assert(game.entities.size()==1,"Later rows must not place teeth underneath an obstacle")
		game.make_obstacle("tooth",1,-40,game.PICKUP_FLOORS[kind]+0.2)
		game.make_obstacle("tooth",0,-40,0.45)
		game.make_obstacle("tooth",1,-48,0.45)
		assert(game.entities.size()==4,"Elevated teeth, adjacent lanes and teeth outside the footprint remain available")
	assert(game.world.somersault_regions.size()==8)
	for i in range(101):
		var phase := float(i)/100
		var flip_rect: Rect2=game.world.somersault_rect(Vector2(640,588),phase)
		assert(flip_rect.size.x>100 and flip_rect.size.y>100,"Every somersault phase must show a full body, never an edge-on line")
		assert(game.world.somersault_frame(phase) in range(8))
	assert(game.world.somersault_frame(0)==0 and game.world.somersault_frame(1)==7,"Takeoff and landing use upright poses")
	for i in range(101):
		var phase := float(i)/100
		var roll_rect: Rect2=game.world.roll_rect(Vector2(640,588),phase)
		assert(game.world.roll_frame(phase)==7-game.world.somersault_frame(phase),"Down rolls head-first in the opposite direction to the celebration")
		assert(roll_rect.size.x>100 and roll_rect.size.y>100,"Ground rolls keep body volume at every angle")
		assert(roll_rect.end.y<=588.01 and roll_rect.end.y>=581.99,"All forward roll poses remain in contact with the road")
	game.start_run(false,false)
	game.spawn_time=1000
	for milestone in [[0,16.0],[199,16.0],[200,19.2],[399,19.2],[400,22.4],[600,25.6],[10000,176.0]]:
		game.teeth=milestone[0]
		game._process(0.01)
		assert(absf(game.speed-milestone[1])<0.001,"Tooth milestones must add 20% of base speed, with no cap")
	game.start_run(false,false)
	assert(game.speed==16)
	game.spawn_time=1000
	key(game,KEY_A)
	assert(game.lane==0)
	key(game,KEY_D)
	assert(game.lane==1)
	key(game,KEY_S)
	assert(game.slide_time>0)
	assert(game.roll_duration==game.ROLL_DURATION and game.world.roll_frame(game.roll_phase())==7)
	game._process(0.23)
	var paused_roll: float=game.slide_time
	var paused_roll_phase: float=game.roll_phase()
	game.pause_run()
	game._process(1)
	assert(game.slide_time==paused_roll,"Pause must freeze the current roll pose")
	assert(game.roll_phase()==paused_roll_phase)
	game.pause_run()
	key(game,KEY_SPACE)
	assert(game.jump_time==game.JUMP_DURATION and game.slide_time==0)
	key(game,KEY_S)
	assert(game.dive_velocity>0)
	game._process(0.01)
	key(game,KEY_W)
	assert(game.jump_time==game.JUMP_DURATION and game.slide_time==0)
	game.start_run(false,false)
	game.spawn_time=1000
	key(game,KEY_DOWN)
	key(game,KEY_UP)
	assert(game.jump_time==game.JUMP_DURATION and game.slide_time==0,"Up must interrupt a ground roll immediately")
	game._process(game.JUMP_DURATION)
	key(game,KEY_UP)
	assert(game.jump_time==game.JUMP_DURATION,"A normal landing must allow the next jump immediately")
	game._process(0.5)
	key(game,KEY_DOWN)
	game._process(0.2)
	key(game,KEY_UP)
	assert(game.jump_time==game.JUMP_DURATION and game.dive_velocity==0 and game.slide_time==0,"A dive landing has no recovery cooldown")
	game._process(0.5)
	var airborne_timer: float=game.jump_time
	key(game,KEY_UP)
	assert(game.jump_time==airborne_timer,"An early airborne press must not double jump")
	game._process(0.3)
	assert(game.jump_buffer==0,"A stale airborne request must expire")
	key(game,KEY_DOWN)
	game._process(0.14)
	key(game,KEY_UP)
	game._process(0.06)
	assert(game.jump_time>1.3 and game.dive_velocity==0,"A press just before touchdown must jump at contact")
	game.start_run(false,false)
	game.spawn_time=1000
	game.jump_time=game.JUMP_DURATION*0.5
	game._process(0.01)
	key(game,KEY_DOWN)
	assert(game.dive_velocity>0 and game.jump_time==0)
	game._process(0.2)
	assert(game.runner.position.y==0 and game.slide_time>0,"Down in mid-air must land quickly into a roll")
	assert(game.roll_duration==game.DIVE_ROLL_DURATION,"A dive landing retains the faster forward rotation")
	# Contact happens after the first fast rotation has finished. Both kinds of
	# roll must stay low until the cat actually reaches these open dentures.
	for rotation_duration in [game.ROLL_DURATION,game.DIVE_ROLL_DURATION]:
		game.start_run(false,false)
		game.spawn_time=1000
		game.begin_roll(rotation_duration)
		game.make_obstacle("open",1,-8)
		game.make_obstacle("open",1,-10.8)
		game._process(0.70)
		assert(game.state=="running" and game.slide_time>0,"Fast rotation must still pass obstacles 8 to 10.8 metres ahead")
		assert(game.entities[0].checked and game.entities[1].checked,"Both late contacts must be resolved during the roll")
		assert(game.roll_duration==rotation_duration,"Extending travel must not slow the requested rotation")
		game._process(0.08)
		assert(game.slide_time==0,"The longer roll must still end normally")
		game.make_obstacle("open",1,-0.1)
		game._process(0.02)
		assert(game.state=="crashed","Low-profile protection must end when the roll ends")
	game.start_run(false,false)
	game.spawn_time=1000
	game.teeth=400
	key(game,KEY_DOWN)
	game.make_obstacle("open",1,-11)
	game._process(0.60)
	assert(game.state=="running" and game.entities[0].checked,"The longer roll must also work at increased milestone speeds")
	game.start_run(false,false)
	game.spawn_time=1000
	game.lane=2
	game.runner.position.x=3
	game.make_obstacle("bench",2,-0.1)
	game.spawn_npc(2,-0.1)
	assert(game.entities.size()==1 and game.entities[0].node.position.x>4.5,"NPC stands on the pavement and clears the adjacent obstacle")
	game.make_obstacle("equipment",2,-10)
	assert(game.entities.size()==1,"Later obstacle rows must respect the interaction clearance")
	game._process(0.02)
	assert(game.teeth==30 and game.state=="running" and game.celebration_time>0)
	var celebration_distance: float=game.distance
	game._process(0.04)
	assert(game.teeth==30,"Each NPC awards exactly one high-five bonus")
	assert(game.distance==celebration_distance,"The celebration pauses scenery instead of risking a collision")
	game.open_rankings()
	game._process(1)
	assert(game.distance==celebration_distance and game.ranking_panel.visible)
	game.close_rankings()
	assert(game.state=="running" and not game.ranking_panel.visible)
	game._process(1)
	assert(game.celebration_time==0 and game.teeth==30)
	game.start_run(false,false)
	game.spawn_time=1000
	game.runner.position.x=3
	game.lane=2
	game.make_obstacle("tooth",1,0.1)
	game._process(0.01)
	assert(game.teeth==0 and not game.entities[0].checked)
	game.lane=1
	game.runner.position.x=0
	game._process(0.01)
	assert(game.teeth==1,"A tooth remains collectable after crossing the old one-shot plane")
	for kind in ["bench","equipment"]:
		game.start_run(false,false)
		game.make_obstacle(kind,1,-92)
		game.spawn_arc(1,-92)
		assert(game.entities.size()==8 and game.entities[4].height>7,"Box and bench lure arcs clear their tops")
	for kind in ["bench","equipment"]:
		game.start_run(false,false)
		game.spawn_time=1000
		game.jump_time=game.JUMP_DURATION*0.5
		game.make_obstacle(kind,1,-0.1)
		game._process(0.02)
		assert(game.state=="running","A high jump must clear benches and carts")
		game.start_run(false,false)
		game.spawn_time=1000
		game.make_obstacle(kind,1,-0.1)
		game._process(0.02)
		assert(game.state=="crashed" and not game.results.visible,"Ground contact must first show injury, not results")
		game._process(game.CRASH_DURATION)
		assert(game.state=="over" and game.results.visible)
	game.start_run(false,false)
	game.spawn_time=1000
	game.jump_time=game.JUMP_DURATION*0.5
	game.make_obstacle("tooth",1,-0.1,0.45)
	game._process(0.02)
	assert(game.teeth==0,"Crossing a ground tooth mid-jump must not collect it")
	game.start_run(false,false)
	game.spawn_time=1000
	game.make_obstacle("tooth",1,-0.1,0.45)
	game._process(0.02)
	assert(game.teeth==1,"Running through a ground tooth must collect it")
	game.start_run(false,false)
	game.spawn_time=1000
	game.jump_time=game.JUMP_DURATION*0.5
	game.make_obstacle("tooth",1,-0.1,game.JUMP_HEIGHT+0.45)
	game._process(0.02)
	assert(game.teeth==1,"The jump apex must collect an elevated arc tooth")
	game.start_tutorial()
	for step in range(6):
		game._process(3.0)
		assert(game.tutorial_waiting and game.tutorial_step==step)
		var stopped: float=game.distance
		key(game,KEY_Q)
		game._process(1.0)
		assert(game.distance==stopped,"Wrong key must not release the tutorial")
		key(game,[KEY_A,KEY_D,KEY_SPACE,KEY_S,KEY_W,KEY_SPACE][step])
		game._process(2.0)
	assert(game.state=="tutorial_done" and game.elapsed==0 and not game.reward_sent)
	game.start_run(false,false)
	game.spawn_row()
	var blocked := {}
	var ground := 0
	var high := 0
	for entity in game.entities:
		if entity.kind!="tooth": blocked[entity.lane]=true
		elif entity.height>1: high+=1
		else: ground+=1
	assert(blocked.size()<=2 and ground>=10)
	for entity in game.entities: entity.node.queue_free()
	game.entities.clear()
	game.spawn_time=1000
	game.pause_run()
	game._process(60.0)
	assert(game.elapsed==0)
	game.pause_run()
	for i in range(60): game._process(1.0)
	assert(absf(game.elapsed-60)<0.001)
	var coarse_distance: float=game.distance
	game.start_run(false,false)
	game.spawn_time=1000
	for i in range(3600): game._process(1.0/60.0)
	assert(absf(game.distance-coarse_distance)<0.01,"Travel must not depend on frame rate")
	game.finish_run("collision")
	assert(game.state=="crashed" and game.reward_sent and not game.results.visible)
	assert(game.world.position.length()>0,"Impact must immediately shake the whole world")
	assert(game.collision_shake(0.1)!=game.collision_shake(0))
	assert(game.collision_shake(game.SHAKE_DURATION)==Vector2.ZERO,"Shake must stop before the results appear")
	assert(game.collision_shake(0.3).length()<game.collision_shake(0).length(),"Impact shake must decay")
	var crash_distance: float=game.distance
	var crash_elapsed: float=game.elapsed
	var crash_teeth: int=game.teeth
	key(game,KEY_SPACE)
	key(game,KEY_D)
	assert(game.jump_time==0 and game.lane==1,"Injury must ignore movement")
	game.open_rankings()
	assert(game.state=="crashed","Rankings must not interrupt the injury animation")
	game._process(0.7)
	assert(game.state=="crashed" and not game.results.visible)
	assert(game.world.position==Vector2.ZERO,"Hurt pose remains after the short screen shake settles")
	assert(game.distance==crash_distance and game.elapsed==crash_elapsed and game.teeth==crash_teeth,"Injury must freeze gameplay and reward totals")
	var remaining_crash: float=game.crash_time
	game.finish_run("collision")
	assert(game.crash_time==remaining_crash,"Repeated collisions must not restart animation or settle twice")
	game._process(0.66)
	assert(game.state=="over" and game.reward_sent)
	assert(game.results.visible and not game.overlay.visible,"Results use the illustrated game panel")
	game.start_run(false,false)
	assert(game.teeth==0 and not game.reward_sent and game.crash_time==0)
	assert(game.world.position==Vector2.ZERO,"Replay must reset the camera offset")
	game.finish_run("quit")
	assert(game.state=="over" and game.results.visible,"Voluntary exit must not play an injury")
	print("PASS: six guided lessons, wrong-key freeze, tutorial reward exclusion, height-aware teeth, safe dense rows, pause, 60 Hz / 1 Hz travel equivalence and replay")
	game.queue_free()
	await process_frame
	quit(0)



