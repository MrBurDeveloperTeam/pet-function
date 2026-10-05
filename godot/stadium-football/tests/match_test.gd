extends SceneTree
const Rules = preload("res://match.gd")
var failures := 0
func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description)
		failures += 1

func _initialize() -> void:
	verify_reception()
	verify_tackle_recovery()
	verify_control_lock()
	verify_pass_selection_cycles()
	verify_positions()
	verify_keeper_clearance()
	verify_random_scatter()
	verify_rebound_recovery()
	verify_keeper_pass_power()
	verify_pass_and_home_pursuit()
	verify_exhaustion_and_tackles()
	verify_stamina_reset()
	verify_easier_ai_and_recovery()
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
	check(match_game.pass_ball(0) and match_game.owner==-1 and match_game.controlled==0,"Pass releases ball and retains control until reception")
	check(Vector2(match_game.ball_velocity.x,match_game.ball_velocity.z).length()<=10.01 and match_game.ball_velocity.length()>9,"Pass travels at the reduced speed")
	match_game.owner=0
	check(match_game.shoot(0,1,Vector2.ZERO),"Owner can shoot")
	check(not match_game.shoot(0,1,Vector2.ZERO),"Non-owner cannot shoot again")
	for heading in [Vector2.RIGHT,Vector2.LEFT,Vector2.UP,Vector2.DOWN,Vector2(1,-1).normalized(),Vector2(1,1).normalized()]:
		for charge in [0.0,1.0]:
			for explicit_aim in [true,false]:
				match_game.owner=0
				match_game.cats[0].pos=Vector2(8,7)
				match_game.cats[0].heading=heading
				var aim: Vector2=heading if explicit_aim else Vector2.ZERO
				check(match_game.shot_direction(0,aim).is_equal_approx(heading),"Preview follows input or last heading away from goal centre")
				match_game.shoot(0,charge,aim)
				var actual := Vector2(match_game.ball_velocity.x,match_game.ball_velocity.z).normalized()
				check(actual.is_equal_approx(heading),"Released shot matches the guide in all directions and charge levels")

	match_game.cats[5].pos=Vector2(20,8)
	match_game.ball=Vector3(21,0.4,0)
	match_game.ball_velocity=Vector3(100,0,0)
	match_game.update_ball(0.05)
	check(match_game.score[0]==1,"Fast shots count swept goal-line crossing")
	# New wing openings score on both ends; posts and crossbar still reject misses.
	for side in [-1, 1]:
		for wing in [-1, 1]:
			match_game=Rules.new(40)
			match_game.state="playing"
			match_game.owner=-1
			match_game.ball=Vector3(side*21,0.4,wing*4.2)
			match_game.ball_velocity=Vector3(side*100,0,0)
			match_game.update_ball(0.05)
			check(match_game.score[0 if side==1 else 1]==1,"Shots through enlarged wing openings score at either goal")
		for miss in [Vector2(5.2,0.4),Vector2(0,4.2)]:
			match_game=Rules.new(41)
			match_game.state="playing"
			match_game.owner=-1
			match_game.pickup_lock=1
			match_game.ball=Vector3(side*21,miss.y,miss.x)
			match_game.ball_velocity=Vector3(side*100,0,0)
			match_game.update_ball(0.05)
			check(match_game.score==[0,0] and match_game.ball_velocity.x*side<0,"Shots outside enlarged posts or above crossbar rebound")
	match_game=Rules.new(5)
	match_game.state="playing"
	match_game.owner=-1
	match_game.pickup_lock=1
	match_game.ball=Vector3(0,0.4,12.5)
	match_game.ball_velocity=Vector3(0,0,20)
	match_game.update_ball(0.1)
	check(match_game.ball_velocity.z<0 and match_game.ball.z<=12.601,"Side wall rebounds ball")
	match_game.owner=3
	match_game.cats[0].pos=Vector2.ZERO
	match_game.cats[0].heading=Vector2.RIGHT
	match_game.cats[0].cooldown=0
	match_game.cats[3].pos=Vector2(3,0)
	check(match_game.tackle_status(0)=="approach","Distant carrier requires approaching")
	match_game.cats[3].pos=Vector2(2.4,0)
	match_game.cats[0].heading=Vector2.LEFT
	check(match_game.tackle_status(0)=="ready","Carrier in the expanded range is tackleable even when facing away")
	match_game.cats[0].heading=Vector2.RIGHT
	check(match_game.tackle_status(0)=="ready","Facing direction does not change tackle readiness")
	match_game.cats[0].cooldown=0.5
	check(match_game.tackle_status(0)=="cooldown" and not match_game.tackle(0),"Recovery prevents another tackle")
	match_game.cats[0].cooldown=0
	match_game.cats[3].pos=Vector2(1,0)
	match_game.cats[0].pos=Vector2.ZERO
	match_game.cats[0].heading=Vector2.RIGHT
	check(match_game.tackle(0) and match_game.owner==0,"Nearby tackle wins possession")
	check(not match_game.tackle(0),"Tackle cooldown prevents spamming")
	match_game.owner=3
	match_game.cats[0].cooldown=0
	match_game.cats[0].heading=Vector2.LEFT
	match_game.cats[3].pos=Vector2(2.4,0)
	check(match_game.tackle(0) and match_game.owner==0,"Tapping tackle wins the ball from behind in the expanded range")
	match_game.owner=3
	match_game.cats[0].cooldown=0
	match_game.cats[3].pos=Vector2(2.6,0)
	check(not match_game.tackle(0) and match_game.owner==3,"Carrier outside the expanded range still requires approaching")
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

func reception_fixture():
	var fixture = Rules.new(90)
	fixture.state="playing"
	fixture.owner=-1
	fixture.pickup_lock=0.22
	fixture.last_kicker=0
	for cat in fixture.cats: cat.pos=Vector2(0,10)
	fixture.cats[0].pos=Vector2.ZERO
	fixture.ball=Vector3(0,0.4,0)
	fixture.ball_velocity=Vector3(100,0,0)
	return fixture

func verify_tackle_recovery() -> void:
	var fixture = reception_fixture()
	for cat in fixture.cats: cat.think=100
	fixture.owner=3
	fixture.cats[3].pos=Vector2(3,0)
	fixture.tackle(0)
	fixture.step(0.29)
	check(not fixture.tackle(0) and fixture.cats[0].cooldown>0,"Tackle cannot repeat before 0.3 seconds")
	fixture.step(0.02)
	fixture.cats[0].pos=Vector2.ZERO
	fixture.cats[0].heading=Vector2.RIGHT
	fixture.cats[3].pos=Vector2(1,0)
	check(fixture.tackle(0) and fixture.owner==0,"Tackle becomes available after 0.3 seconds")

func verify_control_lock() -> void:
	var fixture = reception_fixture()
	fixture.owner=3
	fixture.cats[3].pos=Vector2(5,0)
	fixture.ball=Vector3(5,0.4,0)
	fixture.cats[1].pos=Vector2(4,0)
	fixture.select_initial_defender()
	check(fixture.controlled==1,"First defensive selection uses the nearest home outfield cat")
	fixture.ball=Vector3.ZERO
	fixture.select_initial_defender()
	check(fixture.controlled==1,"Moving possession closer to another cat does not change locked control")
	fixture.owner=4
	fixture.select_initial_defender()
	check(fixture.controlled==0,"A new opponent carrier selects the nearest defender rather than retaining a stale lock")
	fixture.owner=-1
	fixture.ball=Vector3(0,0.4,0)
	fixture.pickup_lock=0
	fixture.receive_ball(fixture.ball,fixture.ball)
	check(fixture.owner==0 and fixture.controlled==0,"Incidental teammate pickup keeps the current control lock")
	fixture = reception_fixture()
	fixture.owner=0
	fixture.cats[1].pos=Vector2(5,0)
	check(fixture.pass_ball(0) and fixture.controlled==0,"Passing cat stays controlled while its pass is in flight")
	fixture.update_ball(0.5)
	check(fixture.owner==1 and fixture.controlled==1,"Receiving a deliberate pass transfers control to that teammate")
	fixture = reception_fixture()
	fixture.owner=0
	fixture.defender_selected=true
	fixture.cats[1].pos=Vector2(6,0)
	fixture.cats[3].pos=Vector2(3,0)
	fixture.pass_ball(0)
	fixture.update_ball(0.5)
	check(fixture.owner==3 and fixture.controlled==0 and not fixture.pass_in_flight,"An intercepted pass cannot transfer control to its intended receiver")

func verify_pass_selection_cycles() -> void:
	var fixture = reception_fixture()
	fixture.owner=3
	fixture.cats[0].pos=Vector2(-4,2)
	fixture.cats[1].pos=Vector2(4,2)
	fixture.cats[3].pos=Vector2(5,0)
	fixture.cats[4].pos=Vector2(-5,0)
	fixture.ball=Vector3(5,0.4,0)
	fixture.select_initial_defender()
	check(fixture.controlled==1,"Select the cat nearest the initial opponent carrier")
	check(fixture.pass_ball(3) and not fixture.defender_selected and fixture.controlled==1,"Opponent pass unlocks the next selection while keeping control during flight")
	fixture.update_ball(1)
	check(fixture.owner==4 and fixture.controlled==0 and fixture.defender_selected,"Opponent receiver triggers one new nearest-defender selection")
	fixture.cats[1].pos=Vector2(-5,1.5)
	fixture.select_initial_defender()
	check(fixture.controlled==0,"A closer cat after selection cannot override the current cycle lock")
	fixture.cats[1].pos=Vector2(4,2)
	fixture.pass_ball(4)
	fixture.update_ball(1)
	check(fixture.owner==3 and fixture.controlled==1 and fixture.defender_selected,"Another pass starts another selection cycle")
	fixture.owner=1
	fixture.ball=Vector3(4,0.4,2)
	check(fixture.pass_ball(1) and not fixture.defender_selected,"Home pass also resets the next defensive selection")
	fixture.owner=3
	fixture.cats[3].pos=Vector2(-5,0)
	fixture.select_initial_defender()
	check(fixture.controlled==0,"Opponent possession after a home pass selects the nearest cat anew")

func verify_positions() -> void:
	var fixture = reception_fixture()
	fixture.owner=0
	fixture.cats[0].pos=Vector2(2,3)
	fixture.cats[3].pos=Vector2(3,3)
	fixture.cats[4].pos=Vector2(10,-6)
	fixture.ball=Vector3(2,0.4,3)
	fixture.refresh_roles()
	check(fixture.pressing_cats[1]==3 and fixture.ai_target(3)==Vector2(2,3),"Only the nearest opposing outfield cat presses the carrier")
	check(fixture.ai_target(4).distance_to(Vector2(2,3))>5,"Second defender covers space away from the ball")
	check(fixture.ai_target(1).y==-6 and fixture.ai_target(1).distance_to(fixture.cats[0].pos)>6,"Attacking teammate opens a separate passing lane")
	fixture.cats[4].pos=Vector2(2.5,3)
	fixture.cats[4].think=0
	fixture.ai_action(4)
	check(fixture.owner==0,"Covering defender does not also attempt to tackle")
	fixture.cats[3].pos=Vector2(12,3)
	fixture.refresh_roles()
	check(fixture.pressing_cats[1]==3,"Pressing role remains stable as other defenders become closer")
	check(absf(fixture.ai_target(2).x+19.8)<0.01 and absf(fixture.ai_target(5).x-19.8)<0.01,"Both keepers stay in front of their own goals")
	fixture.owner=3
	fixture.controlled=1
	fixture.refresh_roles()
	check(fixture.pressing_cats[0]==1 and fixture.ai_target(0).is_equal_approx(fixture.cats[3].pos),"Home AI pursues opposing possession alongside player control")
	fixture.owner=0
	fixture.cats[1].pos=Vector2(8,-6)
	fixture.pass_ball(0)
	fixture.refresh_roles()
	check(fixture.pressing_cats[0]==1,"Intended receiver follows the pass instead of remaining in the cover position")

func verify_easier_ai_and_recovery() -> void:
	var fixture = reception_fixture()
	check(is_equal_approx(fixture.ai_interval(3,0.7),0.875),"Away AI action frequency uses 80 percent difficulty")
	fixture.owner=0
	fixture.cats[3].pos=Vector2(10,0)
	for cat in fixture.cats: cat.think=100
	fixture.step(0.5,Vector2.RIGHT)
	check(is_equal_approx(fixture.cats[3].velocity.length(),4.48),"Away outfield movement speed uses 80 percent difficulty")
	check(is_equal_approx(fixture.cats[0].velocity.length(),5.6*0.92),"Player movement speed is preserved")
	fixture = reception_fixture()
	fixture.owner=3
	fixture.cats[3].pos=Vector2(1,0)
	fixture.cats[0].pos=Vector2.ZERO
	fixture.cats[0].cooldown=0
	check(fixture.tackle(0),"Player can take the ball from the opponent")
	fixture.cats[3].stun=0
	fixture.cats[3].think=0
	fixture.refresh_roles()
	fixture.ai_action(3)
	check(fixture.owner==0,"AI cannot instantly steal back freshly won possession")
	fixture.ai_tackle_grace=0.6
	fixture.owner=3
	fixture.cats[0].cooldown=0
	check(fixture.tackle(0),"AI steal-back protection never blocks the player's tackle")
	fixture = reception_fixture()
	fixture.owner=1
	fixture.cats[1].pos=Vector2(4,0)
	fixture.cats[0].pos=Vector2.ZERO
	check(fixture.tackle(0) and fixture.owner==-1 and fixture.pass_target==0,"K requests a pass from a friendly carrier without switching player control")
	fixture.update_ball(0.5)
	check(fixture.owner==0 and fixture.controlled==0,"Called pass returns possession to the controlled cat")
	fixture = reception_fixture()
	fixture.owner=1
	fixture.cats[1].pos=Vector2(18,0)
	fixture.cats[5].pos=Vector2(20,0)
	fixture.cats[5].think=100
	fixture.cats[1].think=0
	fixture.update_ball(0)
	fixture.ai_action(1)
	check(fixture.owner==-1 and absf(fixture.ball_velocity.z)>1,"Friendly attacker aims beside the goalkeeper")
	for n in range(300):
		fixture.step(1.0/60)
		if fixture.score[0]>0: break
	check(fixture.score[0]>0,"Friendly attacker finishes a near-goal chance instead of entering a possession loop")
	fixture = reception_fixture()
	fixture.owner=3
	fixture.cats[3].pos=Vector2(5,0)
	fixture.cats[4].pos=Vector2(-5,0)
	fixture.cats[0].pos=Vector2(-4,2)
	fixture.cats[1].pos=Vector2(4,2)
	fixture.select_initial_defender()
	for n in range(6):
		var passer: int = fixture.owner
		fixture.pass_ball(passer)
		fixture.update_ball(1)
		check(fixture.owner==(4 if passer==3 else 3),"Rapid consecutive passes reach alternating carriers")
		check(fixture.controlled==(0 if fixture.owner==4 else 1) and fixture.selected_sequence==fixture.pass_sequence,"Every rapid pass cycle independently refreshes the nearest defender")

func verify_keeper_clearance() -> void:
	for team in range(2):
		var fixture = Rules.new(201+team)
		fixture.state="playing"
		var keeper := team*3+2
		var attacker := (1-team)*3
		var attack := 1.0 if team==0 else -1.0
		fixture.owner=keeper
		fixture.cats[keeper].pos=Vector2(-attack*19.8,0)
		fixture.cats[team*3].pos=Vector2(-attack*16,1)
		fixture.cats[team*3+1].pos=Vector2(-attack*17,-1)
		fixture.cats[attacker].pos=Vector2(-attack*18.7,0)
		fixture.cats[attacker+1].pos=Vector2(-attack*17.5,-1)
		fixture.cats[keeper].think=0
		fixture.ai_action(keeper)
		check(fixture.owner==keeper and is_equal_approx(fixture.keeper_hold_time,2.5),"Keeper starts a 2.5-second hold instead of immediately passing")
		check(not fixture.tackle(attacker) and not fixture.pass_ball(keeper),"Keeper possession is protected and cannot be released early")
		fixture.state="paused"
		fixture.step(0.5)
		check(is_equal_approx(fixture.keeper_hold_time,2.5),"Pause freezes the keeper countdown")
		fixture.state="playing"
		fixture.step(2.49,Vector2(-attack,0))
		check(fixture.owner==keeper,"Keeper holds through the first 2.49 seconds")
		for i in [0,1,3,4]:
			check(fixture.cats[i].pos.distance_to(fixture.cats[keeper].pos)>Rules.KEEPER_KEEP_OUT,"Every outfield cat scatters outside the keeper area, including the controlled player")
		fixture.step(0.02)
		check(fixture.owner==-1 and fixture.pass_target/3==team and fixture.pass_target%3<2,"After 2.5 seconds keeper passes to a home-team outfield recipient")
		check(fixture.keeper_hold_time==0 and fixture.ball.y<Rules.RECEIVE_HEIGHT,"Released keeper pass has no remaining protection and is catchable")
		var direction := Vector2(fixture.ball_velocity.x,fixture.ball_velocity.z).normalized()
		for i in [0,1,3,4]: fixture.cats[i].pos=Vector2(0,12)
		fixture.cats[attacker].pos=Vector2(fixture.ball.x,fixture.ball.z)+direction*3
		fixture.cats[attacker].stun=0
		fixture.update_ball(0.4)
		check(fixture.owner==attacker,"Opponent can intercept the released keeper pass in flight")
	for team in range(2):
		for blocked in range(2):
			var fixture = Rules.new(501)
			fixture.state="playing"
			var keeper := team*3+2
			var first := team*3
			var rival := (1-team)*3
			var direction := 1.0 if team==0 else -1.0
			fixture.cats[keeper].pos=Vector2(-19*direction,0)
			fixture.cats[first].pos=Vector2(-9*direction,-8)
			fixture.cats[first+1].pos=Vector2(-9*direction,8)
			fixture.cats[rival].pos=fixture.cats[keeper].pos.lerp(fixture.cats[first+blocked].pos,0.5)
			fixture.cats[rival+1].pos=Vector2(15*direction,11)
			fixture.cats[rival+2].pos=Vector2(19*direction,0)
			check(fixture.safest_keeper_recipient(keeper)==first+1-blocked,"Keeper compares both lanes and avoids the obstructed one at either goal")
			fixture.owner=keeper
			fixture.ensure_keeper_hold()
			fixture.keeper_hold_time=0
			fixture.ai_action(keeper)
			check(fixture.pass_target==first+1-blocked,"Keeper actually distributes to the safer teammate")
	var fixture = Rules.new(400)
	fixture.state="playing"
	fixture.cats[0].pos=Vector2(-19.8,0)
	for n in range(60):
		fixture.step(1.0/60,Vector2.LEFT)
		for i in [0,1,3,4]:
			for keeper in [2,5]: check(fixture.cats[i].pos.distance_to(fixture.cats[keeper].pos)>=Rules.KEEPER_KEEP_OUT-0.001,"Outfield cats cannot enter either keeper's position during normal play")

func verify_reception() -> void:
	var fixture = reception_fixture()
	fixture.cats[1].pos=Vector2(5,1.6)
	fixture.update_ball(0.1)
	check(fixture.owner==1 and fixture.possession_serial==1,"Side contact with the cat body receives a fast ball and records feedback")
	fixture = reception_fixture()
	fixture.cats[1].pos=Vector2(5,1.9)
	fixture.update_ball(0.1)
	check(fixture.owner==-1,"A ball outside body contact range is not captured")
	fixture = reception_fixture()
	fixture.last_kicker=3
	fixture.cats[0].pos=Vector2(5,1.6)
	fixture.update_ball(0.1)
	check(fixture.owner==0 and fixture.possession_feedback=="INTERCEPTED!","Body interception records a distinct success message")
	fixture = reception_fixture()
	fixture.cats[1].pos=Vector2(5,0)
	fixture.update_ball(0.1)
	check(fixture.owner==1 and fixture.controlled==0 and fixture.ball_velocity==Vector3.ZERO,"Loose-ball contact transfers possession without changing locked control")
	fixture = reception_fixture()
	fixture.cats[1].pos=Vector2(6,0)
	fixture.cats[3].pos=Vector2(3,0)
	fixture.update_ball(0.1)
	check(fixture.owner==3,"First opponent on the ball path intercepts before a later teammate")
	fixture = reception_fixture()
	fixture.update_ball(0.01)
	check(fixture.owner==-1,"Kicker cannot immediately recapture their own pass")
	fixture = reception_fixture()
	fixture.pickup_lock=0
	fixture.update_ball(0.001)
	check(fixture.owner==0,"Kicker may recover a loose ball after the lock expires")
	fixture = reception_fixture()
	fixture.cats[1].pos=Vector2(3,0)
	fixture.cats[1].stun=0.5
	fixture.cats[4].pos=Vector2(6,0)
	fixture.update_ball(0.1)
	check(fixture.owner==4,"Stunned cats cannot receive, allowing the next cat to intercept")
	fixture = reception_fixture()
	fixture.ball.y=3
	fixture.cats[1].pos=Vector2(5,0)
	fixture.update_ball(0.1)
	check(fixture.owner==-1,"High airborne shots pass above cats rather than being caught on the ground")
	fixture = reception_fixture()
	fixture.cats[2].pos=Vector2(5,0)
	fixture.controlled=1
	fixture.update_ball(0.1)
	check(fixture.owner==2 and fixture.controlled==1,"Goalkeeper catches the ball while keeping outfield player control")

func verify_random_scatter() -> void:
	var fixture = Rules.new(805)
	var regions := {}
	var previous := {}
	for catch_number in range(40):
		fixture.owner=-1
		fixture.ensure_keeper_hold()
		fixture.owner=2 if catch_number%2==0 else 5
		fixture.ensure_keeper_hold()
		var targets: Dictionary=fixture.scatter_targets.duplicate()
		check(targets!=previous,"Each keeper catch chooses fresh scatter targets")
		fixture.ensure_keeper_hold()
		check(targets==fixture.scatter_targets,"Scatter targets stay fixed within a single hold")
		for i in [0,1,3,4]:
			var target: Vector2=fixture.scatter_target(i)
			check(absf(target.x)<=20.5 and absf(target.y)<=11.5,"Random scatter stays inside the pitch")
			for keeper in [2,5]: check(target.distance_to(fixture.cats[keeper].pos)>=Rules.KEEPER_KEEP_OUT+1.5,"Scatter avoids both keeper areas")
			for j in [0,1,3,4]:
				if i!=j: check(target.distance_to(targets[j])>=5,"Scatter destinations keep cats apart")
			regions[Vector2i(1 if target.x>0 else -1,1 if target.y>0 else -1)]=true
		previous=targets
	check(regions.size()==4,"Scatter destinations cover both halves and both wings")

func verify_rebound_recovery() -> void:
	for wall in [Vector2(0,12.9),Vector2(21.9,8)]:
		var fixture = Rules.new(913)
		fixture.state="playing"
		fixture.owner=-1
		fixture.last_kicker=0
		fixture.pickup_lock=0
		fixture.flight_is_shot=true
		fixture.ball=Vector3(wall.x,0.4,wall.y)
		fixture.ball_velocity=Vector3(12,0,12)
		for cat in fixture.cats: cat.pos=Vector2(-10,-10)
		fixture.update_ball(0.02)
		check(not fixture.flight_is_shot,"Wall rebound becomes a recoverable loose ball")
		fixture.cats[0].pos=Vector2(fixture.ball.x,fixture.ball.z)+Vector2(-1.5,0)
		check(fixture.receive_ball(fixture.ball,fixture.ball) and fixture.owner==0,"Shooter recovers rebound with normal body radius")

func verify_keeper_pass_power() -> void:
	for team in range(2):
		var previous_speed := 0.0
		for distance in [6.0,18.0,38.0]:
			for intercepted in [false,true]:
				var fixture = Rules.new(713)
				fixture.state="playing"
				var keeper := team*3+2
				var recipient := team*3
				var opponent := (1-team)*3
				var direction := 1.0 if team==0 else -1.0
				for cat in fixture.cats: cat.pos=Vector2(0,11)
				fixture.cats[keeper].pos=Vector2(-19*direction,0)
				fixture.cats[recipient].pos=fixture.cats[keeper].pos+Vector2(distance*direction,0)
				fixture.owner=keeper
				fixture.ensure_keeper_hold()
				fixture.keeper_hold_time=0
				check(fixture.pass_ball(keeper,recipient),"Keeper can distribute to a selected near or far teammate")
				var speed := Vector2(fixture.ball_velocity.x,fixture.ball_velocity.z).length()
				if not intercepted:
					check(speed>previous_speed and speed<=Rules.KEEPER_PASS_MAX_SPEED,"Keeper pass speed increases with distance within its cap")
					previous_speed=speed
				if intercepted: fixture.cats[opponent].pos=fixture.cats[keeper].pos+Vector2(distance*0.5*direction,0)
				for frame in range(360):
					fixture.pickup_lock=maxf(0,fixture.pickup_lock-1.0/60)
					fixture.update_ball(1.0/60)
					if fixture.owner>=0: break
				check(fixture.owner==(opponent if intercepted else recipient),"Distance-scaled pass reaches teammate or is intercepted first by an opponent in its path")

func verify_pass_and_home_pursuit() -> void:
	var fixture = Rules.new(173)
	fixture.state="playing"
	fixture.cats[0].pos=Vector2(0,0)
	fixture.cats[1].pos=Vector2(10,0)
	fixture.pass_ball(0)
	fixture.pickup_lock=0
	fixture.cats[0].pos=Vector2(fixture.ball.x,fixture.ball.z)
	check(not fixture.receive_ball(fixture.ball,fixture.ball),"Passer cannot recapture a moving pass even after initial kick lock")
	fixture.ball_velocity=Vector3.ZERO
	check(fixture.receive_ball(fixture.ball,fixture.ball) and fixture.owner==0,"A stopped unclaimed pass remains recoverable")
	fixture=Rules.new(174)
	fixture.state="playing"
	fixture.owner=3
	fixture.controlled=0
	fixture.cats[1].pos=Vector2(0,0)
	fixture.cats[3].pos=Vector2(1.5,0)
	fixture.cats[1].think=0
	fixture.ai_tackle_grace=0
	for attempt in range(20):
		fixture.cats[1].think=0
		fixture.ai_action(1)
		if fixture.owner==1: break
	check(fixture.owner==1,"Home AI can tackle even when controlled cat is designated presser")
	fixture.owner=-1
	fixture.ball=Vector3(7,0.4,0)
	fixture.ball_velocity=Vector3.ZERO
	check(fixture.ai_target(1).is_equal_approx(Vector2(7,0)),"Home AI pursues unclaimed ball directly")

func verify_exhaustion_and_tackles() -> void:
	var fixture = Rules.new(70)
	fixture.training=true
	fixture.state="playing"
	fixture.cats[0].stamina=0
	for frame in range(30): fixture.step(1.0/60,Vector2.RIGHT,true)
	check(fixture.cats[0].sprint_exhausted and fixture.cats[0].stamina>8,"Exhausted sprinter recovers instead of toggling sprint every frame")
	check(fixture.cats[0].velocity.length()<5.7,"Exhausted cat keeps a stable walking speed")
	for frame in range(36): fixture.step(1.0/60,Vector2.RIGHT,true)
	check(not fixture.cats[0].sprint_exhausted,"Sprint unlocks after sufficient stamina returns")
	var wins := 0
	for seed_value in range(500):
		fixture=Rules.new(seed_value)
		fixture.state="playing"
		fixture.owner=0
		fixture.cats[0].pos=Vector2(0,0)
		fixture.cats[3].pos=Vector2(1,0)
		fixture.cats[3].think=0
		fixture.ai_tackle_grace=0
		fixture.ai_action(3)
		if fixture.owner==3: wins+=1
	check(wins>200 and wins<300,"AI possession steals succeed about half as often across seeds")

func verify_stamina_reset() -> void:
	var fixture = Rules.new(98)
	for cat in fixture.cats:
		cat.stamina=3
		cat.sprint_exhausted=true
	fixture.reset_positions(1)
	for cat in fixture.cats: check(cat.stamina==100 and not cat.sprint_exhausted,"New kickoff restores every cat to full stamina")
