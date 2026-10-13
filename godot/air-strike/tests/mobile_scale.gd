extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	root.size=Vector2i(440,956)
	var game=load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	var desktop_size: Vector2i=root.content_scale_size
	game.configure_mobile_scale()
	assert(root.content_scale_size==desktop_size,"Desktop keeps its original viewport configuration")
	game.burst(Vector2.ZERO,60,"fire")
	assert(game.particles.size()==60,"Desktop explosion particle count is unchanged")
	game.particles.clear()
	game.mobile_skill_cards=true
	game.configure_text_font()
	assert(game.font.multichannel_signed_distance_field and game.font.antialiasing==TextServer.FONT_ANTIALIASING_GRAY,"Mobile uses scalable antialiased text rather than enlarged pixel glyphs")
	game.configure_mobile_scale()
	await process_frame
	game.resize_arena(game.get_viewport_rect().size)
	assert(root.content_scale_size==Vector2i(480,270),"Mobile game uses half the logical base size to double visual size")
	assert(is_equal_approx(game.arena_size.x,480),"Portrait mobile world retains full viewport width")
	assert(game.combat_rect.encloses(game.pause_button_rect()) and game.combat_rect.encloses(game.exit_button_rect()),"Enlarged top-right buttons stay inside the viewport")
	game.burst(Vector2.ZERO,60,"fire")
	assert(game.particles.size()==15,"Mobile explosion reduces particles by 75 percent")
	for i in range(20):game.burst(Vector2.ZERO,100,"fire")
	assert(game.particles.size()<=120,"Mobile particle population has a hard budget")
	game.allow_skill_choices=false
	game.reset_run()
	game.player=game.player_bounds.end
	game.joystick_active=true
	game.joystick_axis=Vector2.RIGHT
	game.update_player_movement(0.1)
	assert(game.player_bounds.has_point(game.player-Vector2(0.001,0.001)),"Enlarged aircraft movement still clamps to world bounds")
	game.free()
	print("MOBILE SCALE: PASS / double visual size, button bounds, particle budget and desktop isolation")
	quit()
