extends SceneTree
const Rules = preload("res://match.gd")
var failures := 0
func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description)
		failures += 1

func _initialize() -> void:
	var match_game = Rules.new(1)
	check(match_game.cats.size()==6,"Two teams of three cats")
	match_game.step(3.1)
	check(match_game.state=="playing" and match_game.elapsed==0,"Countdown does not consume regulation time")
	match_game.state="paused"
	match_game.step(12)
	check(match_game.elapsed==0,"Pause freezes clock")
	match_game.state="playing"
	match_game.elapsed=179.99
	match_game.step(0.02)
	check(match_game.overtime and match_game.state=="playing","Tied regulation enters golden goal")
	match_game.goal(1)
	check(match_game.state=="finished" and match_game.score[1]==1,"First extra-time goal wins")
	match_game=Rules.new(2)
	match_game.state="playing"
	match_game.score=[1,0]
	match_game.elapsed=179.99
	match_game.step(0.02)
	check(match_game.state=="finished","A leading team wins at full time")
	match_game=Rules.new(3)
	match_game.state="playing"
	match_game.overtime=true
	match_game.elapsed=209.99
	match_game.step(0.02)
	check(match_game.state=="finished" and match_game.score==[0,0],"Extra-time timeout is a draw")
	match_game=Rules.new(4)
	match_game.state="playing"
	check(match_game.pass_ball(0) and match_game.owner==-1 and match_game.controlled==1,"Pass releases ball and controls recipient")
	check(match_game.ball_velocity.length()>10,"Pass has real travel velocity")
	match_game.owner=0
	check(match_game.shoot(0,1,Vector2.ZERO),"Owner can shoot")
	check(not match_game.shoot(0,1,Vector2.ZERO),"Non-owner cannot shoot again")
	match_game.ball=Vector3(21,0.4,0)
	match_game.ball_velocity=Vector3(100,0,0)
	match_game.update_ball(0.05)
	check(match_game.score[0]==1,"Fast shots count swept goal-line crossing")
	match_game=Rules.new(5)
	match_game.state="playing"
	match_game.owner=-1
	match_game.pickup_lock=1
	match_game.ball=Vector3(0,0.4,12.5)
	match_game.ball_velocity=Vector3(0,0,20)
	match_game.update_ball(0.1)
	check(match_game.ball_velocity.z<0 and match_game.ball.z<=12.601,"Side wall rebounds ball")
	match_game.owner=3
	match_game.cats[3].pos=Vector2(1,0)
	match_game.cats[0].pos=Vector2.ZERO
	match_game.cats[0].heading=Vector2.RIGHT
	check(match_game.tackle(0) and match_game.owner==0,"Facing tackle wins nearby possession")
	check(not match_game.tackle(0),"Tackle cooldown prevents spamming")
	match_game.owner=3
	match_game.cats[0].cooldown=0
	match_game.cats[0].heading=Vector2.LEFT
	check(not match_game.tackle(0) and match_game.owner==3,"Facing away cannot steal the ball")
	match_game=Rules.new(7)
	match_game.state="playing"
	for n in range(600): match_game.step(1.0/60,Vector2.UP,true)
	check(match_game.cats[0].stamina<100 and absf(match_game.cats[0].pos.y)<=12.2,"Sprint consumes stamina and respects field boundaries")
	# Run a full autonomous match: all AI / possession paths must remain finite.
	match_game=Rules.new(8)
	for n in range(18000):
		match_game.step(1.0/60)
		for cat in match_game.cats: check(cat.pos.is_finite(),"AI position must stay finite")
		if match_game.state=="finished": break
	check(match_game.state=="finished","Full match reaches a result")
	print("Football rules: ","PASS" if failures==0 else "FAIL", " / failures=",failures)
	quit(1 if failures else 0)
