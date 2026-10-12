extends SceneTree

func _initialize(): call_deferred("verify")

func tap(game, pos: Vector2, index: int = 0, pressed: bool = true):
	var event := InputEventScreenTouch.new()
	event.position = pos
	event.index = index
	event.pressed = pressed
	game._unhandled_input(event)

func drag(game, pos: Vector2, index: int = 0):
	var event := InputEventScreenDrag.new()
	event.position = pos
	event.index = index
	game._unhandled_input(event)

func verify():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices = false
	game.reset_run()
	var origin := Vector2(310,310)
	tap(game, origin)
	assert(game.joystick_active and game.joystick_origin == origin, "Joystick appears exactly where the finger presses")
	assert(not game.dragging, "Touch does not enter desktop drag mode")
	drag(game, origin+Vector2(3,3))
	assert(game.joystick_axis == Vector2.ZERO, "Deadzone avoids accidental movement")
	drag(game, origin+Vector2(300,0), 1)
	assert(game.joystick_axis == Vector2.ZERO, "A second finger cannot move the stick")
	drag(game, origin+Vector2(300,0))
	assert(game.joystick_axis == Vector2.RIGHT, "Stick travel is clamped")
	var start: Vector2 = game.player
	game.update_player_movement(0.1)
	assert(is_equal_approx(game.player.x-start.x, game.PLAYER_SPEED*0.1), "Full stick uses keyboard movement speed")
	drag(game, origin+Vector2(300,300))
	assert(is_equal_approx(game.joystick_axis.length(),1.0), "Diagonal movement cannot exceed normal speed")
	tap(game, Vector2(600,300), 1)
	assert(game.joystick_origin == origin, "Second finger cannot relocate the joystick")
	tap(game, origin, 1, false)
	assert(game.joystick_active, "Releasing a different finger does not stop movement")
	tap(game, origin, 0, false)
	assert(not game.joystick_active and game.pointer_id == -1, "Release hides the stick and clears ownership")
	start = game.player
	game.update_player_movement(0.1)
	assert(game.player == start, "Aircraft stops immediately after release")
	var right := InputEventKey.new()
	right.keycode = KEY_RIGHT
	right.pressed = true
	Input.parse_input_event(right)
	Input.flush_buffered_events()
	start = game.player
	game.update_player_movement(0.1)
	assert(is_equal_approx(game.player.x-start.x,44.2), "Desktop arrows move 30 percent faster than the previous 340 speed")
	var release := right.duplicate()
	release.pressed = false
	Input.parse_input_event(release)
	Input.flush_buffered_events()
	tap(game, Vector2(600,300))
	assert(game.joystick_origin == Vector2(600,300), "Each new press creates a new origin")
	tap(game, game.pause_button_rect().get_center(), 1)
	assert(game.state == "paused" and not game.joystick_active, "Second finger can pause without starting movement")
	tap(game, game.start_rect.get_center(), 1)
	assert(game.state == "playing", "Touch resumes through the same button as desktop")
	game.clear_mobile_movement()
	tap(game, game.skill_inventory.button_rect(game).get_center())
	assert(game.skill_inventory.opened and not game.joystick_active, "Inventory touch never activates movement")
	game.skill_inventory.toggle(game)
	game.allow_skill_choices = true
	game.progression.offer(true)
	game.progression.choice_age = 1.0
	tap(game, game.skill_card_rect(0).get_center())
	assert(game.state == "playing" and game.progression.skills.size() == 1, "Skill cards respond to touch")
	assert(not game.joystick_active, "Choosing a card cannot move the aircraft")
	game.clear_mobile_movement()
	game.pointer_press(origin)
	assert(game.dragging and not game.joystick_active, "Desktop mouse keeps its existing drag mode")
	game.pointer_move(origin+Vector2(20,10))
	assert(game.target == game.drag_player+Vector2(20,10), "Desktop drag target is unchanged")
	game.clear_mobile_movement()
	tap(game, origin)
	drag(game, origin+Vector2(500,0))
	game.player = game.player_bounds.end
	game.update_player_movement(0.1)
	assert(game.player == game.player_bounds.end, "Joystick cannot leave the playfield")
	game.clear_mobile_movement()
	assert(not game.joystick_active, "Orientation pause clears the joystick")
	game.free()
	print("MOBILE JOYSTICK: PASS / floating origin, touch controls, bounds, release and desktop drag")
	quit()
