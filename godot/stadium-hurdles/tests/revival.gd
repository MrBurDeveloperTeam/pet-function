extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var game=load("res://main.gd").new()
	root.add_child(game)
	game.set_process(false)
	game.start_run(false,false)
	game.begin_revive_death()
	game._process(0.5)
	assert(game.state=="crashed" and game.crash_time>0 and not game.reward_sent,"Crash animation precedes revival without settlement")
	game._process(1)
	assert(game.state=="reviving" and not game.reward_sent,"Prompt waits until crash animation completes")
	game.start_run(false,false)
	game.teeth=50
	for i in range(3):
		game.state="reviving"
		game.resolve_revive(true)
		assert(game.state=="running" and game.teeth==50 and not game.reward_sent and game.revive_grace==3)
		assert(game.revive_count==i+1)
	game.state="reviving"
	game.resolve_revive(false)
	assert(game.reward_sent and game.state=="crashed","Only final death settles the run")
	game.start_run(false,false)
	assert(game.revive_count==0 and game.revive_grace==0)
	game.free()
	print("HURDLES REVIVAL: PASS / quota, preserved progress, collision grace, final settlement and replay")
	quit()
