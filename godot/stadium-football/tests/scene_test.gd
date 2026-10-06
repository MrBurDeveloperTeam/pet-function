extends SceneTree
var failures := 0
func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description)
		failures += 1
func _initialize() -> void:
	call_deferred("verify")
func verify() -> void:
	root.size = Vector2i(1280, 720)
	var scene = load("res://main.gd").new()
	root.add_child(scene)
	scene.set_process(false)
	check(scene.cat_nodes.size()==6 and scene.cat_sprites.size()==6,"Scene has six original pixel cat sprites on a 3D stage")
	for i in range(6):
		check(scene.cat_atlases[i].atlas==scene.TEAM_SHEETS[0 if i<3 else 1],"Each team shares exactly one original cat appearance")
	check(scene.stadium_backdrop.texture.resource_path.ends_with("stadium-wide-goals.png"),"Pixel stadium with enlarged goals is installed")
	root.size = Vector2i(1480, 612)
	scene._process(0.0)
	var center: Vector3 = scene.pitch_position(Vector2.ZERO)
	var origin: Vector2 = scene.camera.unproject_position(center)
	var horizontal: float = origin.distance_to(scene.camera.unproject_position(center + scene.camera.global_basis.x))
	var vertical: float = origin.distance_to(scene.camera.unproject_position(center + scene.camera.global_basis.y))
	check(absf(horizontal-vertical)<0.01,"Wide viewport renders cat axes at equal scale")
	check(is_equal_approx(scene.stadium_backdrop.scale.y,scene.pitch_vertical_scale()),"Stadium alone fits the wide viewport")
	check(scene.cat_sprites[0].scale==Vector3.ONE,"Wide viewport never stretches the cat sprite")
	root.size = Vector2i(1280, 720)
	scene._process(0.0)
	scene.start_match()
	check(scene.started and scene.game.state=="countdown","Kickoff creates a fresh match")
	scene.game.state="playing"
	scene.game.cats[0].velocity=Vector2(4,0)
	scene.anim_time=0.2
	scene.update_visuals(0.1)
	var previous_frame: Rect2=scene.cat_atlases[0].region
	scene.anim_time=0.5
	scene.update_visuals(0.1)
	check(scene.cat_atlases[0].region!=previous_frame,"Running advances original paw animation frames")
	scene.game.cats[0].heading=Vector2.LEFT
	scene.update_visuals(0)
	check(scene.cat_atlases[0].region.position.y==416,"Left movement uses the original left-facing cycle")
	check(scene.selection_arrow.visible and scene.selection_arrow.position.y>scene.cat_nodes[0].position.y+3,"Control arrow appears above the controlled cat")
	scene.game.controlled=1
	scene.update_visuals(0)
	check(is_equal_approx(scene.selection_arrow.position.x,scene.cat_nodes[1].position.x),"Arrow follows a player switch")
	check(scene.ball_marker.visible and not scene.ball_node.visible,"High-contrast ball renders in UI above overlapping cats")
	scene.game.controlled=0
	var far_corner: Vector3=scene.pitch_position(Vector2(-22,-13))
	var near_corner: Vector3=scene.pitch_position(Vector2(-22,13))
	check(near_corner.x<far_corner.x and near_corner.z>far_corner.z,"Pitch projection matches the stadium's wider foreground")
	var action_key := InputEventKey.new()
	action_key.physical_keycode=KEY_SPACE
	action_key.pressed=true
	scene._unhandled_input(action_key)
	scene.game.shot_charge=0.7
	scene.update_visuals(0)
	check(scene.shot_guide.visible,"Charging displays the aiming guide")
	check(scene.prompt_hud.visible and scene.prompt_title.text=="RELEASE TO SHOOT","Charge state displays contextual space prompt")
	check(not scene.shoot_button.is_visible_in_tree() and not scene.pass_button.is_visible_in_tree(),"Legacy action buttons are hidden")
	check(scene.energy_hud.visible and not scene.stamina_bar.visible and not scene.possession_label.visible,"Text-free energy HUD replaces bottom possession panel")
	check(scene.game.shot_direction(0,Vector2.UP).y<scene.game.shot_direction(0,Vector2.DOWN).y,"Guide aim follows directional input")
	scene.game.state="paused"
	scene.update_visuals(0)
	check(not scene.shot_guide.visible,"Pause hides the aiming guide")
	check(not scene.prompt_hud.visible,"Pause hides the contextual prompt")
	scene.game.state="playing"
	action_key.pressed=false
	scene._unhandled_input(action_key)
	scene.update_visuals(0)
	check(not scene.shot_guide.visible,"Release hides the aiming guide")
	check(scene.game.owner==-1 and scene.game.shots==1,"Charged shot releases possession exactly once")
	scene.game.owner=3
	scene.game.cats[3].pos=Vector2(1,0)
	scene.game.cats[0].pos=Vector2.ZERO
	scene.game.cats[0].heading=Vector2.RIGHT
	scene.game.cats[0].cooldown=0
	scene.update_visuals(0)
	check(scene.action_hint.text.contains("STEAL NOW") and scene.shoot_button.text.contains("TACKLE"),"A valid tackle window names both timing and action")
	check(scene.pass_button.disabled and scene.pass_button.text.contains("PASS"),"Defending disables passing without offering a player switch")
	scene.try_pass()
	check(scene.game.controlled==0,"C without possession keeps the selected cat")
	scene.begin_shot_or_tackle()
	scene.release_shot()
	check(scene.game.owner==0 and scene.game.shots==1,"A successful tackle does not accidentally shoot on key release")
	scene.update_visuals(0)
	check(scene.shoot_button.text.contains("SHOOT") and scene.action_hint.text.contains("RELEASE"),"Possession restores shoot controls and instructions")
	check(not scene.pass_button.disabled,"Winning possession enables passing")
	check(scene.possession_feedback_label.visible and scene.possession_feedback_label.text=="BALL WON!","Successful tackle displays immediate possession feedback")
	check(scene.ball_marker.texture.get_image().get_pixel(30,15)==Color("ffdf54"),"Home possession uses a yellow outer ball ring")
	scene.game.owner=3
	scene.update_visuals(0)
	check(scene.ball_marker.texture.get_image().get_pixel(30,15)==Color("ff4d4d"),"Away possession uses a red outer ball ring")
	scene.game.owner=-1
	scene.update_visuals(1.3)
	check(not scene.possession_feedback_label.visible,"Possession success message fades after its feedback interval")
	check(scene.ball_marker.texture.get_image().get_pixel(30,15)==Color("e9e8d5"),"Unclaimed ball uses a neutral outer ring")
	scene.game.owner=1
	scene.game.cats[1].pos=Vector2(4,0)
	scene.update_visuals(0)
	check(scene.shoot_button.text.contains("CALL PASS") and scene.action_hint.text.contains("CALL A PASS"),"Friendly possession explains how to call for the ball")
	scene.begin_shot_or_tackle()
	scene.release_shot()
	check(scene.game.owner==-1 and scene.game.pass_target==0 and scene.game.controlled==0,"SPACE requests a teammate pass without stealing or changing control")
	scene.toggle_pause()
	var clock: float=scene.game.elapsed
	scene._process(0.2)
	check(scene.game.state=="paused" and scene.game.elapsed==clock,"Pause UI freezes simulation")
	scene.toggle_pause()
	check(scene.game.state=="playing","Resume preserves play phase")
	scene.game.state="finished"
	scene.show_result()
	check(scene.result_panel.visible and scene.settled,"Result UI shows once after finish")
	scene.start_match()
	check(not scene.settled and scene.game.score==[0,0] and scene.game.elapsed==0,"Replay resets scores, time and settlement")
	scene.game.state="playing"
	scene.game.cats[1].pos=Vector2(5,0)
	var pass_key := InputEventKey.new()
	pass_key.physical_keycode=KEY_C
	pass_key.pressed=true
	scene._unhandled_input(pass_key)
	check(scene.game.owner==-1 and scene.game.pass_target==1,"C key initiates a teammate pass")
	check(scene.pass_button.text.begins_with("C") and scene.shoot_button.text.begins_with("SPACE"),"Action buttons display the new keyboard bindings")
	scene.game.owner=-1
	scene.game.last_kicker=0
	scene.game.pickup_lock=0.22
	scene.game.pass_in_flight=true
	for cat in scene.game.cats: cat.pos=Vector2(-15,10)
	scene.game.cats[1].pos=Vector2(5,0)
	check(scene.game.receive_ball(Vector3(0,0.4,-2.5),Vector3(10,0.4,-2.5)),"Fast ball crossing the upper visible body is caught despite missing the feet radius")
	check(scene.game.owner==1 and scene.game.controlled==1,"Visible body contact immediately transfers possession and control")
	scene.game.owner=-1
	scene.game.previous_cat_positions.clear()
	for cat in scene.game.cats: scene.game.previous_cat_positions.append(cat.pos)
	scene.game.previous_cat_positions[1]=Vector2(5,6)
	scene.game.cats[1].pos=Vector2(5,-6)
	check(scene.game.receive_ball(Vector3(5,0.4,0),Vector3(5,0.4,0)) and scene.game.owner==1,"Moving cat body crossing the ball between frames receives it")
	scene.game.owner=-1
	scene.game.previous_cat_positions.clear()
	scene.game.cats[1].pos=Vector2(5,0)
	check(not scene.game.receive_ball(Vector3(0,0.4,-8),Vector3(10,0.4,-8)),"Ball above the visible body bounds is not captured")
	scene.game.reset_positions(0)
	scene.game.owner=2
	scene.game.cats[2].pos=Vector2(-19.8,0)
	scene.game.cats[2].think=0
	scene.game.cats[0].pos=Vector2(-16,1)
	scene.game.cats[1].pos=Vector2(-17,-1)
	scene.game.cats[3].pos=Vector2(-18.7,0)
	scene.game.update_ball(0)
	scene.game.ai_action(2)
	scene.update_visuals(0)
	check(not scene.prompt_hud.visible,"Keeper protection does not advertise an unavailable tackle")
	check(scene.game.owner==2 and scene.shoot_button.disabled and scene.action_hint.text.contains("SPREAD OUT"),"Keeper hold displays countdown and disables tackles")
	scene.game.step(2.49,Vector2.LEFT)
	check(scene.game.owner==2,"Keeper retains the ball for the full protected interval")
	scene.game.step(0.02)
	check(scene.game.owner==-1 and scene.game.pass_target in [0,1],"Keeper releases an ordinary pass to a random teammate after the hold")
	var pass_direction := Vector2(scene.game.ball_velocity.x,scene.game.ball_velocity.z).normalized()
	for i in [0,1,3,4]: scene.game.cats[i].pos=Vector2(0,12)
	scene.game.previous_cat_positions.clear()
	scene.game.cats[3].pos=Vector2(scene.game.ball.x,scene.game.ball.z)+pass_direction*3
	scene.game.cats[3].stun=0
	scene.game.update_ball(0.4)
	check(scene.game.owner==3,"Released keeper pass can be intercepted using actual visible body contact")
	# A spent shot must use the same rendered body contact as a pass.
	for speed in [0.0,3.0]:
		scene.game.reset_positions(0)
		scene.game.owner=-1
		scene.game.last_kicker=0
		scene.game.pickup_lock=0
		scene.game.flight_is_shot=true
		scene.game.cats[0].pos=Vector2(0,0)
		scene.game.ball_velocity=Vector3(speed,0,0)
		scene.update_visuals(0)
		var found_body_contact := false
		for offset in [Vector2(0,-1.5),Vector2(0,-2),Vector2(1.4,-1.5)]:
			var point := Vector3(offset.x,scene.game.BALL_RADIUS,offset.y)
			var interval: Vector2=scene.game.pass_body_contact.call(0,point,point,1.0)
			if interval.x>interval.y: continue
			found_body_contact=true
			check(scene.game.receive_ball(point,point) and scene.game.owner==0,"Original shooter can recover stopped or slow shots touching its visible body")
			break
		check(found_body_contact,"Recovery fixture touches the sprite beyond the old shot radius")
	check(scene.back_button.text.is_empty() and scene.pause_button.text.is_empty(),"Top controls are icon-only")
	scene.game.state="finished"
	scene.show_result()
	await process_frame
	scene.update_visuals(0)
	check(not scene.ball_marker.visible and not scene.ball_tag.visible and scene.result_backdrop.visible,"Final result hides match ball and sits above a full-screen scrim")
	check(scene.result_panel.z_index>scene.result_backdrop.z_index,"Result card renders above the match and scrim")
	check(scene.result_panel.visible and scene.result_panel.size.y>=400,"Football result panel lays out its content")
	scene.start_tutorial()
	check(scene.game.training and scene.tutorial_step==0,"Interactive tutorial starts without a timed match")
	scene.input_aim=Vector2.RIGHT
	scene.update_tutorial(0.9)
	check(scene.tutorial_step==1,"Movement completes the first exercise")
	scene.tutorial_step=2
	scene.prepare_tutorial_step()
	scene.try_pass()
	for frame in range(120): scene.game.step(1.0/60)
	scene.update_tutorial(0)
	check(scene.tutorial_step==3 and scene.game.elapsed==0,"Completed pass advances training without match time")
	scene.begin_shot_or_tackle()
	scene.game.shot_charge=0.01
	check(not scene.tutorial_charged,"Shot exercise begins without any charge completion")
	scene.release_shot()
	scene.update_tutorial(0)
	check(scene.tutorial_step==3 and scene.tutorial_success_step==3,"Shot stays in its step while displaying the actual result")
	var launched: Vector3 = scene.game.ball
	for frame in range(30): scene.game.step(1.0/60)
	check(scene.game.ball.distance_to(launched)>3,"Shot result shows the real ball travelling before the next step")
	scene.update_tutorial(1.0)
	check(scene.tutorial_step==3,"Shot observation keeps the current exercise visible")
	scene.update_tutorial(1.3)
	check(scene.tutorial_step==4,"Next exercise begins after observing the shot")
	scene.game.cats[scene.game.controlled].pos=scene.game.cats[3].pos+Vector2(-2,0)
	scene.begin_shot_or_tackle()
	scene.update_tutorial(0)
	check(scene.tutorial_step==4 and scene.tutorial_success_step==4,"Successful steal retains real possession for observation")
	scene.update_tutorial(2.3)
	check(scene.tutorial_step==5,"Steal observation advances to the switching exercise")
	var switch_key := InputEventKey.new()
	switch_key.physical_keycode=KEY_X
	switch_key.pressed=true
	scene._unhandled_input(switch_key)
	scene.update_visuals(0)
	check(scene.game.controlled==1 and is_equal_approx(scene.selection_arrow.position.x,scene.cat_nodes[1].position.x),"X transfers control and its arrow to the other cat")
	scene.update_tutorial(0)
	check(scene.tutorial_step==5 and scene.tutorial_success_step==5 and scene.game.controlled==1,"X keeps the switched cat visible during result observation")
	var switched_position: Vector2=scene.game.cats[1].pos
	scene.game.step(0.1,Vector2.UP)
	check(scene.game.cats[1].pos.distance_to(switched_position)>0,"New controlled cat moves during switch observation")
	scene.update_tutorial(1.0)
	check(scene.tutorial_step==5,"Switch result does not immediately end training")
	scene.update_tutorial(1.3)
	check(scene.tutorial_step==-1 and not scene.game.training and scene.game.state=="countdown","Switch observation finishes before starting a fresh match")
	scene.game.state="playing"
	scene.game.owner=3
	scene.game.select_initial_defender()
	var selected: int=scene.game.controlled
	scene.try_switch_control()
	scene.game.select_initial_defender()
	check(scene.game.controlled!=selected,"Explicit X selection is not immediately overwritten by nearest defender selection")
	scene.entry_initialized=false
	scene.initialize_entry(false)
	check(scene.tutorial_step==0 and scene.game.training,"First visit automatically enters training")
	scene.initialize_entry(true)
	check(scene.tutorial_step==0,"Repeated initialization does not interrupt training")
	scene.start_match()
	scene.entry_initialized=false
	scene.initialize_entry(true)
	check(scene.tutorial_step==-1 and scene.game.state=="countdown","Returning visitor starts a match directly")
	print("Football scene: ","PASS" if failures==0 else "FAIL", " / failures=",failures)
	scene.audio.stop()
	scene.queue_free()
	await process_frame
	await process_frame
	quit(1 if failures else 0)
