extends SceneTree

func mesh_count(node: Node) -> int:
	var count=1 if node is MeshInstance3D else 0
	for child in node.get_children():count+=mesh_count(child)
	return count

func lod_count(node: Node) -> int:
	var count=0
	if node is MeshInstance3D and node.mesh is ArrayMesh:
		var imported=ImporterMesh.from_mesh(node.mesh)
		for surface in imported.get_surface_count():count+=imported.get_surface_lod_count(surface)
	for child in node.get_children():count+=lod_count(child)
	return count

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	assert(game.racers.size() == 6)
	assert(game.boxes.size() == 6)
	assert(game.sample_length > 1000,"Rebuilt circuit must exceed one kilometre")
	print("STATIC SCENERY MESHES: ",mesh_count(game.get_node("TownCircuit")))
	assert(mesh_count(game.get_node("TownCircuit"))<350,"Scenery must retain its material batching")
	assert(lod_count(game.get_node("TownCircuit"))>0,"Baked scenery must retain distance-based mesh detail")
	assert(game.collision_body is CharacterBody3D)
	game.set_graphics(true)
	assert(is_equal_approx(game.get_viewport().scaling_3d_scale,.5))
	assert(game.racers[0].node.get_node("ContactShadow").visible)
	for light in game.find_children("*","DirectionalLight3D",true,false):assert(not light.shadow_enabled)
	game.set_graphics(false)
	assert(not game.racers[0].node.get_node("ContactShadow").visible)
	for light in game.find_children("*","DirectionalLight3D",true,false):assert(light.shadow_enabled)
	# A swept motion must stop at a thin wall even when one step crosses it entirely.
	var test_wall=game.solid_box(game,Vector3(0,25,0),Vector3(20,14,.4))
	await physics_frame
	game.player_pos=Vector3(0,22,-10)
	game.speed=45
	game.move_kart_safely(Vector3(0,0,60))
	assert(game.player_pos.z < -1.4,"Boost speed cannot tunnel through a wall")
	game.player_pos=Vector3(0,28,-10)
	game.move_kart_safely(Vector3(0,0,60))
	assert(game.player_pos.z < -1.4,"Airborne karts cannot pass through tall buildings")
	test_wall.queue_free()
	await physics_frame
	# Exercise the baked course barriers as well as the isolated thin-wall case.
	var road_center:Vector3=game.track.point(.52)
	var road_side:Vector3=game.track.direction(.52).cross(Vector3.UP).normalized()
	for elevation in [.3,4.0]:
		for edge in [-1,1]:
			game.player_pos=road_center+Vector3.UP*elevation
			game.move_kart_safely(road_side*edge*60)
			assert(absf((game.player_pos-road_center).dot(road_side))<game.track.width(.52)+2,"Baked guardrails must contain grounded and jumping racers")
	# Both branch mouths must remain open to a kart-sized swept sphere.
	for route in 2:
		for q in [.161,.379]:
			game.player_pos=game.track.point(q,route)+Vector3.UP*.3
			var expected:Vector3=game.track.point(q+.002,route)+Vector3.UP*.3
			game.move_kart_safely(expected-game.player_pos)
			assert(game.player_pos.distance_to(expected)<.1,"Fork merge must not have an invisible wall")
	for identity in game.CAT_IDS:
		var anatomy=load("res://models/"+identity+"_driver.glb").instantiate()
		var eye_meshes=anatomy.find_children("*Curved inset eye*","MeshInstance3D",true,false)
		var bodies=anatomy.find_children("*Continuous feline anatomy*","MeshInstance3D",true,false)
		var noses=anatomy.find_children("*Sculpted nose*","MeshInstance3D",true,false)
		assert(eye_meshes.size()==2 and bodies.size()==1 and noses.size()==1,"Every cat must export curved eyes, connected anatomy and a solid nose")
		for eye in eye_meshes:assert(eye.mesh.get_aabb().size.z*eye.scale.z>.07,"Eyes must have volume rather than a plane")
		assert(bodies[0].mesh.get_aabb().size.z>.3,"Connected anatomy must retain front-to-back depth")
		assert(bodies[0].mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR].size()>0,"Original kitten coat colours must survive import")
		assert(noses[0].mesh.get_aabb().size.z>.015,"Nose must be a solid part")
		var eye_position=Vector3.ZERO
		var eye_parent:Node=eye_meshes[0]
		while eye_parent is Node3D:
			eye_position=eye_parent.transform*eye_position
			eye_parent=eye_parent.get_parent()
		assert(eye_position.z < -.1,"Driver must face the kart nose, not the rear wing")
		anatomy.free()
		var kart=load("res://built/"+identity+".scn").instantiate()
		assert(kart.has_node("Driver/Head") and kart.has_node("Driver/Tail"))
		print(identity," render meshes: ",mesh_count(kart))
		assert(mesh_count(kart)<100,"Baked kart must not retain its unmerged duplicates")
		var has_face_texture=false
		for node in kart.get_node("Driver").get_children():
			if node is MeshInstance3D:
				var mat=node.get_active_material(0)
				if mat is StandardMaterial3D and mat.albedo_texture!=null:has_face_texture=true
		assert(has_face_texture,"Every identity needs its own painted face")
		kart.free()
	var easy_length = game.track.fork_length(0)
	var hard_length = game.track.fork_length(1)
	assert(abs(easy_length-hard_length)/easy_length<0.005,"Fork routes must have near equal lengths")
	assert(game.track.point(0.16,0).distance_to(game.track.point(0.16,1))<0.01)
	assert(game.track.point(0.38,0).distance_to(game.track.point(0.38,1))<0.01)
	assert(game.track.point(0.26,0).distance_to(game.track.point(0.26,1))>8)
	assert(game.terrain_pads.size()==6)
	assert(game.racers[0].node.has_node("Driver/Head"))
	assert(game.racers[0].node.has_node("FrontL/Spin"))
	var wheel = game.racers[0].node.get_node("FrontL/Spin")
	game.models.animate(game.racers[0].node,20,1,1,0.05)
	assert(abs(wheel.rotation.x)>0.1)
	assert(game.racers[0].node.get_node("FrontL").rotation.y<0)
	assert(game.racers[0].node.get_node("Driver").rotation.z<0)
	print("FORK LENGTHS: market %.3fm, challenge %.3fm" % [easy_length,hard_length])
	game.reset_race(true)
	game.countdown = 0
	game.touch.gas=true
	game._physics_process(.05)
	assert(game.speed>0,"Acceleration input must move the kart")
	game.speed=22
	game.touch.brake=true
	game._physics_process(.05)
	assert(game.speed<22,"Brake input must reduce speed")
	# Brake first, then reverse at a capped speed, with inverted steering response.
	game.reset_race(true)
	game.countdown=0
	game.player_pos=game.track.point(.52)+Vector3.UP*.3
	game.yaw=game.heading(.52)
	game.last_q=.52
	game.touch.brake=true
	var reverse_start:Vector3=game.player_pos
	for frame in 20:game._physics_process(.05)
	assert(game.speed<0 and game.speed>=-8,"Holding brake from rest must engage capped reverse")
	assert((game.player_pos-reverse_start).dot(game.track.direction(.52))<-.5,"Reverse must actually move backwards")
	assert(game.wrong_way,"Reversing against the course must warn")
	game.touch.left=true
	var reverse_yaw=game.yaw
	game._physics_process(.05)
	assert(game.yaw<reverse_yaw,"Steering response must invert in reverse")
	for action in game.touch:game.touch[action]=false
	assert(game.progress<=0,"Reversing must not award lap progress")
	game.touch.gas=true
	for frame in 20:game._physics_process(.05)
	assert(game.speed>0,"Accelerating must brake out of reverse and resume forward motion")
	for action in game.touch:game.touch[action]=false
	# Heading against either one-way branch warns; reversing while facing backwards
	# is valid because the actual movement is in the course direction.
	for route in 2:
		game.player_route=route
		var direction:Vector3=game.track.direction(.30,route)
		game.yaw=atan2(-direction.x,-direction.z)+PI
		game.speed=12
		game.wrong_way_time=0
		game.update_direction(.4,.30)
		assert(game.wrong_way,"Both directed fork paths must warn about wrong-way driving")
		game.speed=-6
		game.update_direction(.4,.30)
		assert(not game.wrong_way,"Backward-facing reverse in the correct course direction is valid")
		var exit_q=game.track.FORK_END-.004
		game.player_pos=game.track.point(exit_q,route)
		direction=game.track.direction(exit_q,route)
		game.yaw=atan2(-direction.x,-direction.z)+PI
		game.speed=12
		game.wrong_way_time=0
		game.update_direction(.4,exit_q)
		assert(game.wrong_way,"Entering either fork from its exit must warn")
		game.speed=0
		game.update_direction(.4,exit_q)
		assert(not game.wrong_way,"A parked kart must not keep the direction warning")
	game.reset_race(true)
	game.countdown=0
	game.touch.gas=true
	game.speed=22
	game.touch.brake=false
	game.touch.left=true
	game.touch.drift=true
	for frame in 25:
		game.player_pos=game.center(.52)
		game.last_q=.52
		game.speed=22
		game._physics_process(.05)
	assert(game.drift_charge>.65)
	game.touch.drift=false
	game._physics_process(.01)
	assert(game.boost>0,"Releasing a charged drift must boost")
	for action in game.touch:game.touch[action]=false
	game.reset_race(true)
	game.countdown=0
	game._physics_process(0.05)
	assert(game.racers[1].progress > 0)
	game.paused = true
	var previous = game.race_time
	game._physics_process(0.05)
	assert(game.race_time == previous)
	game.paused = false
	game.item = "BOOST"
	game.use_item()
	assert(game.boost > 0 and game.item == "")
	game.item = "SHIELD"
	game.use_item()
	assert(game.shield > 0)
	game.reset_race(true)
	game.countdown = 0
	game.player_pos = game.center(0.5)
	game._physics_process(0.01)
	assert(abs(game.progress) < 0.025, "Teleport must not award half a lap")
	game.reset_race(true)
	game.countdown = 0
	for i in range(1, 1600):
		game.player_pos = game.center(fposmod(i * 0.002, 1))
		game._physics_process(0.016)
		if game.finished:
			break
	assert(game.finished and game.progress >= 3, "Three forward laps finish the race")
	game.reset_race(true)
	assert(game.progress == 0 and game.item == "" and not game.finished)
	game.countdown = 0
	game.player_pos = game.track.point(0.68)
	game.last_q = 0.68
	game.speed = 23
	game._physics_process(0.016)
	assert(game.air_time>0,"Jump ramp must launch the kart")
	game.paused = true
	var airborne = game.air_time
	game._physics_process(0.016)
	assert(game.air_time==airborne,"Pause must freeze the jump")
	print("CAT KART TESTS PASSED: six racers, AI, pause, items, checkpoint protection, finish, restart")
	game.queue_free()
	await process_frame
	quit(0)

