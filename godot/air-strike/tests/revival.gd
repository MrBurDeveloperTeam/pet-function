extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var bridge=load("res://revive_bridge.gd")
	assert(bridge.matches_run_id(1.0,1),"Browser floating point run id matches native integer")
	assert(not bridge.matches_run_id(2.0,1),"Stale run id cannot revive a different game")
	assert(bridge.matches_run_id("runner-1","runner-1"))
	assert(not bridge.matches_run_id(1.0,"1"))
	var game=load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.allow_skill_choices=false
	game.reset_run()
	game.hp=0
	game.explode(game.player,40)
	game.begin_revive_death()
	game._physics_process(0.5)
	assert(game.state=="dying_revive" and not game.effects.is_empty(),"Death effect plays before offering revival")
	game._physics_process(4)
	assert(game.state=="reviving","Revival is offered once death effects finish")
	game.reset_run()
	var receiver
	for child in game.get_children():
		if child.has_method("apply_request"): receiver=child
	game.state="reviving"
	var request=JSON.parse_string(JSON.stringify({"source":"pet-function:revive","runId":game.run_id,"approved":true}))
	var ack=receiver.apply_request(request)
	assert(ack.source=="pet-function:revive-ack" and game.state=="playing" and game.revive_count==1,"JSON message revives game and returns confirmation")
	receiver.apply_request(request)
	assert(game.revive_count==1,"Retry confirms without spending another life")
	game.reset_run()
	game.score=700
	for i in range(3):
		game.state="reviving"
		game.hp=0
		game.resolve_revive(true)
		assert(game.state=="playing" and game.hp>0 and game.invincible==3 and game.score==700)
		assert(game.revive_count==i+1)
	game.state="reviving"
	game.resolve_revive(true)
	assert(game.state=="ending_defeat" and game.revive_count==3,"Fourth revival is rejected")
	game.reset_run()
	assert(game.revive_count==0 and not game.revive_declined,"Replay has a fresh quota")
	game.free()
	print("AIR REVIVAL: PASS / shared quota, restore, safe entry, preserved score and replay")
	quit()
