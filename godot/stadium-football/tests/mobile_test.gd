extends SceneTree
func _initialize(): call_deferred("verify")
func touch(controls, pos: Vector2, id: int, pressed: bool = true):
	var event := InputEventScreenTouch.new()
	event.position = pos
	event.index = id
	event.pressed = pressed
	controls._input(event)
func verify():
	root.size = Vector2i(844,390)
	var scene = load("res://main.gd").new()
	root.add_child(scene)
	scene.set_process(false)
	assert(scene.mobile_controls == null,"Desktop does not create touch controls")
	assert(scene.prompt_key.text == "SPACE","Desktop retains its keyboard prompt")
	scene.mobile_mode = true
	scene.build_mobile_controls()
	scene.started = true
	scene.game.state = "playing"
	scene.game.owner = scene.game.controlled
	var controls = scene.mobile_controls
	controls.set_process(false)
	var positions = controls.layout()
	for size in [Vector2i(844,390),Vector2i(932,430),Vector2i(740,360)]:
		root.size = size
		var p = controls.layout()
		assert(p.buttons.size() == 4 and not p.buttons.has("steal"),"Only Space, Shift, X and C buttons are shown")
		for center in p.buttons.values():
			assert(Rect2(Vector2.ZERO,Vector2(size)).encloses(Rect2(center-Vector2.ONE*34*p.scale,Vector2.ONE*68*p.scale)),"Enlarged buttons remain inside landscape screens")
		assert(p.buttons.sprint.y < p.buttons.shoot.y and p.buttons.switch.x < p.buttons.shoot.x,"Sprint sits above shoot; switch sits left")
		assert(p.buttons.pass.x > p.buttons.switch.x and p.buttons.pass.x < p.buttons.sprint.x,"Pass sits between switch and sprint")
		for center in p.buttons.values():
			assert(center.y-34*p.scale >= size.y-158*p.scale,"Compact action fan stays close to the bottom edge")
	root.size = Vector2i(844,390)
	for density in [1,2,3]:
		root.size = Vector2i(844*density,390*density)
		controls.css_height = 390
		var p = controls.layout()
		assert(is_equal_approx(68*p.scale/p.pixel_ratio,68),"Button visible diameter stays 68 pixels at every pixel density")
		assert(is_equal_approx(p.radius/p.pixel_ratio,70),"Joystick visible radius stays 70 pixels at every pixel density")
	root.size = Vector2i(844,390)
	controls.css_height = 0
	scene.update_action_hint()
	assert(scene.prompt_key.text == "HOLD" and scene.prompt_title.text == "SHOOT BUTTON","Mobile possession prompt describes holding the shoot button")
	positions = controls.layout()
	touch(controls,positions.stick,0)
	var drag := InputEventScreenDrag.new()
	drag.index = 0
	drag.position = positions.stick+Vector2(300,0)
	controls._input(drag)
	assert(scene.touch_move == Vector2.RIGHT,"Joystick drives arrow-equivalent movement and clamps its travel")
	touch(controls,positions.buttons.sprint,1)
	assert(scene.touch_sprint and scene.touch_move == Vector2.RIGHT,"Sprint can be held while the joystick moves")
	touch(controls,Vector2.ZERO,1,false)
	assert(not scene.touch_sprint and scene.touch_move == Vector2.RIGHT,"Sprint ends on release even outside the button")
	touch(controls,positions.buttons.shoot,2)
	assert(scene.touch_shoot and scene.charging_cat == scene.game.controlled,"Holding Space begins shot charge")
	scene.update_action_hint()
	assert(scene.prompt_key.text == "LIFT" and scene.prompt_title.text == "RELEASE TO SHOOT","Mobile charging prompt describes releasing the finger")
	scene.game.shot_charge = 0.7
	var shots = scene.game.shots
	touch(controls,Vector2.ZERO,2,false)
	assert(not scene.touch_shoot and scene.game.shots == shots+1,"Releasing Space shoots exactly once")
	scene.game.owner = scene.game.controlled
	var passes = scene.game.passes
	touch(controls,positions.buttons.pass,3)
	touch(controls,Vector2.ZERO,3,false)
	assert(scene.game.passes == passes+1,"C tap passes once")
	var controlled = scene.game.controlled
	touch(controls,positions.buttons.switch,4)
	touch(controls,Vector2.ZERO,4,false)
	assert(scene.game.controlled != controlled,"X tap switches control")
	scene.game.owner = 3
	scene.game.cats[3].pos = scene.game.cats[scene.game.controlled].pos+Vector2(0.1,0)
	scene.game.cats[scene.game.controlled].cooldown = 0
	var tackles = scene.game.tackles
	scene.update_action_hint()
	assert(scene.prompt_key.text == "TAP" and scene.prompt_title.text == "STEAL BUTTON","Mobile steal prompt describes a tap")
	shots = scene.game.shots
	touch(controls,positions.buttons.shoot,7)
	touch(controls,Vector2.ZERO,7,false)
	assert(scene.game.tackles == tackles+1 and scene.game.owner == scene.game.controlled and scene.game.shots == shots,"Space button steals without accidentally shooting on release")
	touch(controls,positions.buttons.sprint,6)
	scene.clear_mobile_movement()
	assert(scene.touch_move == Vector2.ZERO and not scene.touch_sprint and not scene.touch_shoot and controls.held.is_empty(),"Rotation or pause clears every held finger without shooting")
	scene.free()
	print("FOOTBALL MOBILE: PASS / joystick, multi-touch fan buttons, hold, release, single taps and desktop isolation")
	quit()
