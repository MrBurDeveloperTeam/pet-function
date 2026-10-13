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
		for action in p.buttons:
			var radius: float = 34*controls.action_scale(action,p.scale)
			var center: Vector2 = p.buttons[action]
			assert(Rect2(Vector2.ZERO,Vector2(size)).encloses(Rect2(center-Vector2.ONE*radius,Vector2.ONE*radius*2)),"Buttons remain inside landscape screens")
			for other in p.buttons:
				if other == action: continue
				assert(center.distance_to(p.buttons[other]) > radius+34*controls.action_scale(other,p.scale),"Compact button hit areas do not overlap")
		assert(p.buttons.sprint.y > p.buttons.shoot.y and p.buttons.switch.x < p.buttons.sprint.x,"Sprint sits at bottom right; shoot is above it")
		assert(p.buttons.pass.x > p.buttons.switch.x and p.buttons.pass.x < p.buttons.sprint.x,"Pass sits between switch and sprint")
		for center in p.buttons.values():
			assert(center.y-34*p.scale >= size.y-158*p.scale,"Compact action fan stays close to the bottom edge")
	root.size = Vector2i(844,390)
	for density in [1,2,3]:
		root.size = Vector2i(844*density,390*density)
		controls.css_height = 390
		var p = controls.layout()
		assert(is_equal_approx(68*controls.action_scale("shoot",p.scale)/p.pixel_ratio,54.4),"Secondary buttons shrink by 20% at every pixel density")
		assert(is_equal_approx(p.radius/p.pixel_ratio,56),"Joystick radius shrinks by 20% at every pixel density")
	assert(is_equal_approx(controls.self_modulate.a,0.62),"Mobile controls are translucent")
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
	var aim_drag := InputEventScreenDrag.new()
	aim_drag.index = 2
	aim_drag.position = positions.buttons.shoot+Vector2(0,-90)
	controls._input(aim_drag)
	var selected_aim: Vector2 = scene.touch_shot_aim
	assert(selected_aim.y < -0.5 and scene.touch_move == Vector2.RIGHT,"Shoot drag aims upward independently while the left joystick moves right")
	scene.input_aim = Vector2.LEFT
	assert(scene.current_shot_aim().is_equal_approx(selected_aim),"Changing movement cannot override mobile aiming or its preview")
	scene.update_action_hint()
	assert(scene.prompt_key.text == "LIFT" and scene.prompt_title.text == "RELEASE TO SHOOT","Mobile charging prompt describes releasing the finger")
	scene.game.shot_charge = 0.7
	var shots = scene.game.shots
	touch(controls,Vector2.ZERO,2,false)
	assert(not scene.touch_shoot and scene.game.shots == shots+1,"Releasing Space shoots exactly once")
	assert(Vector2(scene.game.ball_velocity.x,scene.game.ball_velocity.z).normalized().is_equal_approx(selected_aim),"Released shot follows the selected independent aim")
	scene.game.owner = scene.game.controlled
	var passes = scene.game.passes
	assert(controls.pass_mode() == "pass","Friendly possession shows PASS")
	touch(controls,positions.buttons.pass,3)
	touch(controls,Vector2.ZERO,3,false)
	assert(scene.game.passes == passes+1,"C tap passes once")
	var controlled = scene.game.controlled
	touch(controls,positions.buttons.switch,4)
	touch(controls,Vector2.ZERO,4,false)
	assert(scene.game.controlled != controlled,"X tap switches control")
	scene.game.owner = 3
	assert(controls.pass_mode() == "steal","Enemy possession changes the same button to STEAL")
	scene.game.cats[3].pos = scene.game.cats[scene.game.controlled].pos+Vector2(0.1,0)
	scene.game.cats[scene.game.controlled].cooldown = 0
	var tackles = scene.game.tackles
	scene.update_action_hint()
	assert(scene.prompt_key.text == "TAP" and scene.prompt_title.text == "STEAL BUTTON","Mobile steal prompt describes a tap")
	shots = scene.game.shots
	touch(controls,positions.buttons.shoot,7)
	touch(controls,Vector2.ZERO,7,false)
	assert(scene.game.tackles == tackles and not scene.touch_shoot,"Shoot cannot tackle or start charging without possession")
	touch(controls,positions.buttons.pass,8)
	touch(controls,Vector2.ZERO,8,false)
	assert(scene.game.tackles == tackles+1 and scene.game.owner == scene.game.controlled and scene.game.shots == shots,"Shared Pass/Steal button tackles once without shooting on release")
	assert(controls.pass_mode() == "pass","Winning possession immediately restores PASS")
	touch(controls,positions.buttons.sprint,6)
	scene.clear_mobile_movement()
	assert(scene.touch_move == Vector2.ZERO and not scene.touch_sprint and not scene.touch_shoot and controls.held.is_empty(),"Rotation or pause clears every held finger without shooting")
	for step in range(6):
		scene.tutorial_step = step
		scene.prepare_tutorial_step()
		assert(not scene.tutorial_text.text.contains("SPACE") and not scene.tutorial_text.text.contains("SHIFT") and not scene.tutorial_text.text.contains("Press X") and not scene.tutorial_text.text.contains("Press C"),"Mobile tutorial uses touch instructions in every step")
	scene.tutorial_step = 0
	scene.prepare_tutorial_step()
	scene.input_aim = Vector2.RIGHT
	scene.update_tutorial(1.0)
	assert(scene.tutorial_step == 0,"Mobile movement training requires the joystick rather than keyboard input")
	scene.touch_move = Vector2.RIGHT
	scene.update_tutorial(1.0)
	assert(scene.tutorial_step == 1,"Joystick movement completes mobile movement training")
	scene.tutorial_step = 3
	scene.prepare_tutorial_step()
	scene.tutorial_charged = true
	scene.game.shots = 1
	scene.update_tutorial(0.1)
	assert(scene.tutorial_success_step == -1,"A mobile shot without dragging to aim cannot complete training")
	scene.tutorial_aimed = true
	scene.update_tutorial(0.1)
	assert(scene.tutorial_success_step == 3,"Charging, aiming and releasing completes mobile shooting training")
	scene.tutorial_step = 4
	scene.prepare_tutorial_step()
	scene.game.tackles = 1
	scene.game.owner = scene.game.controlled
	scene.update_tutorial(0.1)
	assert(scene.tutorial_success_step == -1,"Mobile steal training requires the shared Pass/Steal button")
	scene.tutorial_touch_actions["steal"] = true
	scene.update_tutorial(0.1)
	assert(scene.tutorial_success_step == 4 and scene.tutorial_text.text.contains("PASS again"),"Winning possession explains the switch back to PASS")
	scene.mobile_mode = false
	scene.tutorial_step = 3
	scene.prepare_tutorial_step()
	assert(scene.tutorial_text.text.contains("Hold SPACE"),"Desktop tutorial retains its original keyboard text")
	scene.tutorial_charged = true
	scene.game.shots = 1
	scene.update_tutorial(0.1)
	assert(scene.tutorial_success_step == 3,"Desktop shooting training does not require touch aiming")
	scene.free()
	print("FOOTBALL MOBILE: PASS / joystick, multi-touch fan buttons, hold, release, single taps and desktop isolation")
	quit()
