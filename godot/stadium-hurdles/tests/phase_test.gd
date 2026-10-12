extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var game = load("res://main.gd").new()
	root.add_child(game)
	game.set_process(false)
	game.start_run(false,false)
	game.spawn_time = 1000
	game.spawn_powerup("phase",1,0)
	game._process(0.02)
	assert(game.phase_time>9.9 and game.phase_time<=10,"Picking up ghost cat starts ten seconds")
	for kind in ["closed","open","cone","bench","equipment","cloud","bird"]:
		assert(game.can_pass(kind,0,false),"Ghost cat passes every ground and aerial obstacle")
	game.make_obstacle("equipment",1,-0.1)
	game._process(0.02)
	assert(game.state=="running","Contact with equipment cannot end a ghost run")
	game.pause_run()
	var remaining = game.phase_time
	game._process(1)
	assert(game.phase_time==remaining,"Pause freezes the powerup")
	game.state="running"
	for entity in game.entities: game.recycle_entity(entity.node)
	game.entities.clear()
	game.make_obstacle("equipment",1,-0.2)
	var close_obstacle = game.entities.back()
	game.make_obstacle("equipment",0,-80)
	var distant_obstacle = game.entities.back()
	game.phase_time=0.005
	game._process(0.01)
	assert(game.phase_time==0 and not game.can_pass("equipment",0,false),"Collision rules return when time expires")
	assert(close_obstacle.checked and close_obstacle.node.visible and game.state=="running","Expiry lets a nearby obstacle pass safely without vanishing")
	assert(not distant_obstacle.checked,"Expiry never disables distant obstacle collisions")
	game.activate_powerup("phase")
	game.start_run(false,false)
	assert(game.phase_time==0,"Replay clears ghost state")
	game.free()
	print("GHOST CAT: PASS / pickup, obstacles, ten-second effect, pause, expiry and replay")
	quit()
