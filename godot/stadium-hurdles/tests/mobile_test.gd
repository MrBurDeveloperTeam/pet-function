extends SceneTree
func _initialize(): call_deferred("verify")
func swipe(game, offset: Vector2):
	var event := InputEventScreenTouch.new()
	event.index = 0
	event.position = Vector2(300,400)
	event.pressed = true
	game._unhandled_input(event)
	var drag := InputEventScreenDrag.new()
	drag.index=0
	drag.position=event.position+offset
	game._input(drag)
	if offset.length()>=36: assert(game.swipe_id == -1,"Swipe triggers before finger release")
	event.pressed = false
	event.position += offset
	game._input(event)
func verify():
	var game = load("res://main.gd").new()
	root.add_child(game)
	game.set_process(false)
	game.mobile_portrait = true
	game.start_run()
	var before_distance: float = game.distance
	game._process(0.5)
	assert(game.distance-before_distance <= game.speed*0.051,"Mobile long frames cannot jump half a second forward")
	swipe(game,Vector2(-80,0))
	assert(game.lane == 0,"Left swipe equals left arrow")
	swipe(game,Vector2(80,0))
	assert(game.lane == 1,"Right swipe equals right arrow")
	swipe(game,Vector2(0,-80))
	assert(game.jump_time > 0,"Up swipe uses the existing jump")
	swipe(game,Vector2(0,80))
	assert(game.jump_time == 0 and game.dive_velocity > 0,"Down swipe uses the existing downward action")
	var lane = game.lane
	swipe(game,Vector2(4,2))
	assert(game.lane == lane,"A tap cannot accidentally change lanes")
	for size in [Vector2i(390,844),Vector2i(440,956),Vector2i(768,1024)]:
		root.size = size
		game.configure_mobile_view(size)
		await process_frame
		assert(is_equal_approx(game.world.scale.x,game.world.scale.y),"Mobile world preserves sprite proportions")
		assert(is_equal_approx(game.world.mobile_sky.scale.x,game.world.mobile_sky.scale.y),"Mobile sky preserves image proportions")
		var height = game.get_tree().root.content_scale_size.y
		assert(absf(game.mobile_world_offset.y+game.world.mobile_sky.position.y*game.MOBILE_WORLD_SCALE)<0.01,"Sky covers the top edge within pixel rounding")
		var feet = game.world.project(0,0)
		assert(absf(game.mobile_world_offset.y+feet.y*game.MOBILE_WORLD_SCALE-height*0.76)<0.01,"Cat sits closer at the lower portrait framing")
		assert(absf(game.mobile_world_offset.y+210*game.MOBILE_WORLD_SCALE-height*0.28)<0.01,"Elevated camera leaves most of the screen for obstacles")
		assert(game.world.scale.x>0.5625,"Camera brings cat and obstacles closer without stretching")
		for elevation in [0.0,game.FLIGHT_HEIGHT]:
			game.camera_height = elevation
			for z in [-20.0,-8.0,-1.0,0.0,1.0]:
				var point = game.world.project(0,z,elevation)
				var tooth_rect := Rect2(point.x-27*point.z,point.y-54*point.z,54*point.z,54*point.z)
				assert(tooth_rect.intersects(game.world.visible_world_rect()),"Ground and flying pickups stay visible through actual contact")
		game.camera_height = 0
		assert(game.overlay.position.x >= 0 and game.overlay.position.x+580 <= 720,"Menus fit the portrait width")
		assert(height >= 960,"Portrait viewport uses a portrait rendering size")
	game.free()
	print("MOBILE RUNNER: PASS / four swipes, uniform art scale, viewport and menu bounds")
	quit()
