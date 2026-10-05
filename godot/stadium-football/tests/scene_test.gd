extends SceneTree
var failures := 0
func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description)
		failures += 1
func _initialize() -> void:
	call_deferred("verify")
func verify() -> void:
	var scene = load("res://main.gd").new()
	root.add_child(scene)
	scene.set_process(false)
	check(scene.cat_nodes.size()==6 and scene.cat_sprites.size()==6,"Scene has six original pixel cat sprites on a 3D stage")
	for i in range(6):
		check(scene.cat_atlases[i].atlas==scene.TEAM_SHEETS[0 if i<3 else 1],"Each team shares exactly one original cat appearance")
	check(scene.stadium_backdrop.texture.resource_path.ends_with("stadium-pixel.png"),"Pixel stadium background is installed")
	scene.start_match()
	check(scene.started and scene.game.state=="countdown" and not scene.menu.visible,"Kickoff creates a fresh match")
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
	scene.game.controlled=0
	var far_corner: Vector3=scene.pitch_position(Vector2(-22,-13))
	var near_corner: Vector3=scene.pitch_position(Vector2(-22,13))
	check(near_corner.x<far_corner.x and near_corner.z>far_corner.z,"Pitch projection matches the stadium's wider foreground")
	scene.begin_shot_or_tackle()
	scene.game.shot_charge=0.7
	scene.release_shot()
	check(scene.game.owner==-1 and scene.game.shots==1,"Charged shot releases possession exactly once")
	scene.game.owner=3
	scene.game.cats[3].pos=Vector2(1,0)
	scene.game.cats[0].pos=Vector2.ZERO
	scene.game.cats[0].heading=Vector2.RIGHT
	scene.game.cats[0].cooldown=0
	scene.begin_shot_or_tackle()
	scene.release_shot()
	check(scene.game.owner==0 and scene.game.shots==1,"A successful tackle does not accidentally shoot on key release")
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
	print("Football scene: ","PASS" if failures==0 else "FAIL", " / failures=",failures)
	scene.audio.stop()
	scene.queue_free()
	await process_frame
	await process_frame
	quit(1 if failures else 0)
