extends SceneTree
var failures = 0
func check(condition: bool, message: String):
	if not condition:
		failures += 1
		push_error(message)
func _initialize():
	call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.allow_skill_choices = false
	game.set_physics_process(false)
	game.reset_run()
	game.pointer_press(game.pause_button_rect().get_center())
	var stopped_at = game.player
	var stopped_time = game.elapsed
	game._physics_process(1)
	check(game.state == "paused" and game.player == stopped_at and game.elapsed == stopped_time and not game.dragging,"pause button immediately freezes combat without dragging")
	game.pointer_press(game.start_rect.get_center())
	check(game.state == "playing","resume button restores combat")
	game.state = "skill_choice"
	game.toggle_pause()
	game.toggle_pause()
	check(game.state == "skill_choice","resume preserves an unfinished skill selection")
	game.score = 600
	game.pointer_press(game.exit_button_rect().get_center())
	check(game.state == "defeat" and game.abandoned and game.score == 600,"exit ends skill selection and preserves earned score for settlement")
	game.reset_run()
	check(not game.abandoned,"replay clears voluntary exit state")
	game.explode(Vector2(300,180),90,true)
	var start = game.player
	game.finish_run("victory")
	game._physics_process(0.5)
	check(game.state == "ending_victory" and game.player == start and not game.effects.is_empty(),"victory waits while the explosion is visible")
	for i in range(300):
		game._physics_process(1.0/60)
		if game.escaping: break
	check(game.escaping and game.state == "ending_victory" and game.effects.is_empty() and game.particles.is_empty(),"flyout begins only after explosion effects finish")
	for i in range(300):
		game._physics_process(1.0/60)
		if game.state == "victory": break
	check(game.state == "victory" and game.player.y+game.aircraft_dimensions("player").y/2 < 0,"victory results wait for the whole player aircraft to exit")
	game.reset_run()
	check(not game.escaping and game.ending_result == "","restart clears the ending sequence")
	game.hp = 0
	game.explode(game.player,35)
	game.finish_run("defeat")
	game._physics_process(0.5)
	check(game.state == "ending_defeat" and not game.effects.is_empty(),"defeat waits for player explosion")
	for i in range(180): game._physics_process(1.0/60)
	check(game.state == "defeat" and not game.escaping,"defeat completes without flying a destroyed aircraft out")
	for cue in game.audio.CUES:
		var stream = game.audio.synthesize(game.audio.CUES[cue])
		check(stream.data.size() > 1000 and Array(stream.data).any(func(sample): return sample != 0),"audible PCM exists for "+cue)
		check(stream.format == AudioStreamWAV.FORMAT_16_BITS and stream.mix_rate == 22050,"valid browser-compatible audio format for "+cue)
	game.free()
	print("ENDING/AUDIO: ",failures," failures")
	quit(1 if failures else 0)
