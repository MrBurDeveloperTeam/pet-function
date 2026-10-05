extends RefCounted
## Deterministic match rules, separate from rendering and the browser bridge.
const HALF_LENGTH := 22.0
const HALF_WIDTH := 13.0
const GOAL_HALF_WIDTH := 5.0
const GOAL_HEIGHT := 4.0
const BALL_RADIUS := 0.4
const RECEIVE_RADIUS := 1.8
const RECEIVE_HEIGHT := 1.0
const TACKLE_RANGE := 2.5
const TACKLE_COOLDOWN := 0.3
const PASS_SPEED := 10.0
const KEEPER_PASS_MAX_SPEED := 26.0
const AI_TACKLE_SUCCESS := 0.5
const AWAY_DIFFICULTY := 0.8
const KEEPER_HOLD_SECONDS := 2.5
const KEEPER_KEEP_OUT := 2.4
const REGULATION := 180.0
const EXTRA_TIME := 30.0
var cats: Array[Dictionary] = []
var ball := Vector3(0, BALL_RADIUS, 0)
var ball_velocity := Vector3.ZERO
var owner := -1
var pickup_lock := 0.0
var last_kicker := -1
var controlled := 0
var defender_selected := false
var pass_sequence := 0
var selected_sequence := -1
var selected_carrier := -1
var ai_tackle_grace := 0.0
var possession_serial := 0
var possession_feedback := ""
var pass_body_contact := Callable()
var previous_cat_positions: Array[Vector2] = []
var keeper_hold_owner := -1
var keeper_hold_time := 0.0
var scatter_targets := {}
var pass_in_flight := false
var pass_target := -1
var flight_is_shot := false
var pressing_cats := [0, 3]
var role_owner := -2
var score := [0, 0]
var elapsed := 0.0
var overtime := false
var state := "countdown"
var phase_time := 3.0
var goal_team := -1
var kickoff_team := 0
var shot_charge := 0.0
var passes := 0
var shots := 0
var tackles := 0
var training := false
var rng := RandomNumberGenerator.new()

func _init(seed_value: int = 42) -> void:
	rng.seed = seed_value
	for i in range(6):
		var team: int = i / 3
		cats.append({"team": team, "keeper": i % 3 == 2, "pos": Vector2.ZERO,
			"velocity": Vector2.ZERO, "heading": Vector2(1 if team == 0 else -1, 0),
			"sprint_exhausted": false, "stamina": 100.0, "cooldown": 0.0, "stun": 0.0, "kick": 0.0, "think": 0.0})
	reset_positions(0)

func reset_positions(team: int) -> void:
	kickoff_team = team
	for i in range(6):
		var sign_x := -1.0 if cats[i].team == 0 else 1.0
		cats[i].pos = Vector2(sign_x * (20.0 if cats[i].keeper else 7.0), 0 if cats[i].keeper else (-5.0 if i % 3 == 0 else 5.0))
		cats[i].velocity = Vector2.ZERO
		cats[i].stamina = 100.0
		cats[i].sprint_exhausted = false
		cats[i].cooldown = 0.0
		cats[i].stun = 0.0
		cats[i].think = 0.25 / AWAY_DIFFICULTY if cats[i].team == 1 else 0.0
		cats[i].heading = Vector2(-sign_x, 0)
	owner = team * 3
	cats[owner].pos = Vector2(-0.8 if team == 0 else 0.8, 0)
	controlled = 0
	defender_selected = false
	pass_sequence = 0
	selected_sequence = -1
	selected_carrier = -1
	ai_tackle_grace = 0.0
	possession_serial = 0
	possession_feedback = ""
	pass_in_flight = false
	pass_target = -1
	role_owner = -2
	previous_cat_positions.clear()
	ball = Vector3(0, BALL_RADIUS, 0)
	ball_velocity = Vector3.ZERO
	pickup_lock = 0.0
	last_kicker = -1
	keeper_hold_owner = -1
	keeper_hold_time = 0
	scatter_targets.clear()
	flight_is_shot = false
	shot_charge = 0.0

func step(delta: float, movement := Vector2.ZERO, sprint := false) -> void:
	if state == "finished" or state == "paused": return
	if state == "countdown" or state == "goal":
		phase_time -= delta
		if phase_time <= 0:
			if state == "goal":
				reset_positions(1 - goal_team)
				state = "countdown"
				phase_time = 3.0
			else: state = "playing"
		return
	if not training: elapsed += delta
	ensure_keeper_hold()
	keeper_hold_time = maxf(0,keeper_hold_time-delta)
	select_initial_defender()
	pickup_lock = maxf(0, pickup_lock - delta)
	ai_tackle_grace = maxf(0, ai_tackle_grace - delta)
	previous_cat_positions.clear()
	for cat in cats: previous_cat_positions.append(cat.pos)
	for i in range(6):
		var cat := cats[i]
		cat.cooldown = maxf(0, cat.cooldown - delta)
		cat.stun = maxf(0, cat.stun - delta)
		cat.kick = maxf(0, cat.kick - delta)
		cat.think = maxf(0, cat.think - delta)
		var direction := movement.limit_length() if i == controlled else (Vector2.ZERO if training else ai_direction(i))
		if keeper_hold_time>0 and not cat.keeper:
			var retreat: Vector2 = scatter_target(i)-cat.pos
			direction = retreat.normalized() if retreat.length()>0.35 else Vector2.ZERO
		var chasing: bool = not training and i!=controlled and cat.team==0 and not cat.keeper and (owner<0 or cats[owner].team!=0)
		if cat.stamina<=1: cat.sprint_exhausted=true
		elif cat.stamina>=20: cat.sprint_exhausted=false
		var boosting: bool = ((i == controlled and sprint) or chasing) and not cat.sprint_exhausted and cat.stamina > 1 and direction.length() > 0.1
		cat.stamina = clampf(cat.stamina + (-32 if boosting else 19) * delta, 0, 100)
		var speed := 8.2 if boosting else 5.6
		if cat.keeper: speed = 6.2
		if cat.team == 1: speed *= AWAY_DIFFICULTY
		if i == owner: speed *= 0.92
		if cat.stun > 0: direction = Vector2.ZERO
		cat.velocity = cat.velocity.move_toward(direction * speed, 28 * delta * (AWAY_DIFFICULTY if cat.team == 1 else 1.0))
		cat.pos += cat.velocity * delta
		cat.pos.x = clampf(cat.pos.x, -21.1, 21.1)
		cat.pos.y = clampf(cat.pos.y, -12.1, 12.1)
		if direction.length() > 0.1: cat.heading = direction.normalized()
		if i != controlled and not training: ai_action(i)
	# Soft body separation: cats cannot occupy exactly the same spot.
	for i in range(6):
		for j in range(i + 1, 6):
			var gap: Vector2 = cats[i].pos - cats[j].pos
			var distance := gap.length()
			if distance < 1.15 and distance > 0.01:
				var push := gap / distance * (1.15 - distance) * 0.5
				cats[i].pos += push
				cats[j].pos -= push
	for cat in cats:
		cat.pos.x = clampf(cat.pos.x, -21.1, 21.1)
		cat.pos.y = clampf(cat.pos.y, -12.1, 12.1)
	enforce_keeper_space()
	update_ball(delta)
	select_initial_defender()
	if state != "playing": return
	if not overtime and elapsed >= REGULATION:
		if score[0] == score[1]: overtime = true
		else: state = "finished"
	elif overtime and elapsed >= REGULATION + EXTRA_TIME: state = "finished"

func ai_direction(i: int) -> Vector2:
	refresh_roles()
	var offset: Vector2 = ai_target(i) - cats[i].pos
	return offset.normalized() if offset.length() > 0.35 else Vector2.ZERO

func ensure_keeper_hold() -> void:
	if owner<0 or not cats[owner].keeper:
		keeper_hold_owner = -1
		keeper_hold_time = 0
	elif keeper_hold_owner != owner:
		keeper_hold_owner = owner
		keeper_hold_time = KEEPER_HOLD_SECONDS
		choose_scatter_targets()

func choose_scatter_targets() -> void:
	# Sample once per catch, so cats follow stable routes throughout the hold.
	scatter_targets.clear()
	for i in [0,1,3,4]:
		while true:
			var target := Vector2(rng.randf_range(-20.5,20.5),rng.randf_range(-11.5,11.5))
			var clear := true
			for keeper in [2,5]:
				if target.distance_to(cats[keeper].pos)<KEEPER_KEEP_OUT+1.5: clear=false
			for other in scatter_targets.values():
				if target.distance_to(other)<5.0: clear=false
			if clear:
				scatter_targets[i]=target
				break

func scatter_target(i: int) -> Vector2:
	return scatter_targets.get(i,cats[i].pos)

func enforce_keeper_space() -> void:
	for i in range(cats.size()):
		if cats[i].keeper: continue
		for keeper in [2,5]:
			var gap: Vector2 = cats[i].pos-cats[keeper].pos
			if gap.length()>=KEEPER_KEEP_OUT: continue
			var inward := 1.0 if cats[keeper].team==0 else -1.0
			gap.x = inward*maxf(absf(gap.x),0.5)
			var normal := gap.normalized()
			cats[i].pos = cats[keeper].pos+normal*KEEPER_KEEP_OUT
			var velocity: Vector2 = cats[i].velocity
			if velocity.dot(normal)<0: cats[i].velocity=velocity-normal*velocity.dot(normal)

func refresh_roles() -> void:
	if role_owner == owner:
		if owner >= 0 and cats[owner].team == 1: pressing_cats[0] = controlled
		return
	role_owner = owner
	var target := Vector2(ball.x, ball.z) if owner < 0 else Vector2(cats[owner].pos)
	for team in range(2):
		var nearest := team * 3
		var distance := INF
		for i in range(team * 3, team * 3 + 2):
			var gap: float = cats[i].pos.distance_squared_to(target)
			if gap < distance:
				distance = gap
				nearest = i
		if team == 0 and owner >= 0 and cats[owner].team == 1: nearest = controlled
		if owner < 0 and pass_target >= 0 and cats[pass_target].team == team: nearest = pass_target
		pressing_cats[team] = nearest

func ai_target(i: int) -> Vector2:
	var cat := cats[i]
	var attack := 1.0 if cat.team == 0 else -1.0
	var target := Vector2(ball.x, ball.z) if owner < 0 else Vector2(cats[owner].pos)
	if cat.keeper:
		target = Vector2(-attack * 19.8, clampf(ball.z * 0.65, -GOAL_HALF_WIDTH + 0.8, GOAL_HALF_WIDTH - 0.8))
	elif owner == i:
		target = Vector2(attack * 21, clampf(cat.pos.y * 0.5, -2.5, 2.5))
	elif owner >= 0 and cats[owner].team == cat.team:
		target = Vector2(clampf(cats[owner].pos.x + attack * 5, -18, 18), -6 if cats[owner].pos.y > 0 else 6)
	elif cat.team==0:
		# The home AI actively pursues loose balls and opposing possession.
		if owner<0: target += Vector2(ball_velocity.x,ball_velocity.z)*0.15
	elif i != pressing_cats[cat.team]:
		# Cover the central passing lane between the ball and our goal.
		target = Vector2(clampf(target.x - attack * 6, -17, 17), clampf(target.y * 0.45, -5, 5))
	return target

func ai_action(i: int) -> void:
	refresh_roles()
	var cat := cats[i]
	if owner==i and cat.keeper:
		ensure_keeper_hold()
		if keeper_hold_time>0: return
		pass_ball(i,safest_keeper_recipient(i))
		cat.think = ai_interval(i,1.3)
		return
	if cat.think > 0 or cat.stun > 0: return
	if owner == i:
		if absf(cat.pos.x - (22 if cat.team == 0 else -22)) < 13:
			shoot_ai(i)
			cat.think = ai_interval(i, 1.6)
		else:
			var threatened := false
			for rival in cats:
				if rival.team != cat.team and rival.pos.distance_to(cat.pos) < 3: threatened = true
			if threatened:
				pass_ball(i)
				cat.think = ai_interval(i, 1.2)
	elif ai_tackle_grace <= 0 and owner >= 0 and cats[owner].team != cat.team and (i == pressing_cats[cat.team] or cat.keeper or cat.team==0) and cat.pos.distance_to(cats[owner].pos) < 1.9:
		if rng.randf()<AI_TACKLE_SUCCESS: tackle(i)
		cat.think = ai_interval(i, 0.7)

func keeper_pass_speed(distance: float) -> float:
	return clampf(PASS_SPEED+maxf(0,distance-6.0)*0.45,PASS_SPEED,KEEPER_PASS_MAX_SPEED)

func keeper_pass_risk(keeper: int, recipient: int) -> float:
	var start: Vector2 = cats[keeper].pos
	var finish: Vector2 = cats[recipient].pos+cats[recipient].velocity*0.2
	var distance := start.distance_to(finish)
	var speed := keeper_pass_speed(cats[keeper].pos.distance_to(cats[recipient].pos))
	var worst := 0.0
	# Compare interception windows along the full pass, including near the receiver.
	for opponent in cats:
		if opponent.team==cats[keeper].team or opponent.stun>0: continue
		var mobility := (6.2 if opponent.keeper else 8.2)*(AWAY_DIFFICULTY if opponent.team==1 else 1.0)
		for sample in range(1,13):
			var fraction := sample/12.0
			var point := start.lerp(finish,fraction)
			var time := distance*fraction/maxf(speed-1.75*distance*fraction/speed,3.0)
			var predicted: Vector2 = opponent.pos+opponent.velocity*minf(time,0.2)
			var reach := RECEIVE_RADIUS+mobility*maxf(0,time-0.2)
			var danger := reach-predicted.distance_to(point)
			worst=maxf(worst,maxf(0,danger))
	return worst*10.0+distance*0.04

func safest_keeper_recipient(keeper: int) -> int:
	var first: int = cats[keeper].team*3
	var risk_a := keeper_pass_risk(keeper,first)
	var risk_b := keeper_pass_risk(keeper,first+1)
	if absf(risk_a-risk_b)<0.05: return first+rng.randi_range(0,1)
	return first if risk_a<risk_b else first+1

func ai_interval(i: int, seconds: float) -> float:
	return seconds / (AWAY_DIFFICULTY if cats[i].team == 1 else 1.0)

func shoot_ai(i: int) -> void:
	var attack := 1.0 if cats[i].team == 0 else -1.0
	var keeper := 5 if cats[i].team == 0 else 2
	# Friendly attackers aim for the space beside the keeper, rather than its centre.
	var wing := -1.0 if cats[keeper].pos.y >= 0 else 1.0
	var target := Vector2(attack * (HALF_LENGTH + 1), wing * (GOAL_HALF_WIDTH - 1.2))
	if cats[i].team == 1:
		var spread := 3.8 + (1.0 - AWAY_DIFFICULTY) * 3.4
		target.y = rng.randf_range(-spread, spread)
	var direction: Vector2 = (target - cats[i].pos).normalized()
	kick(i, direction, 22.0 if cats[i].team == 0 else lerpf(10.0,22.0,AWAY_DIFFICULTY), 1.5)
	if cats[i].team == 0: shots += 1

func update_ball(delta: float) -> void:
	if owner >= 0:
		var cat := cats[owner]
		var target: Vector2 = cat.pos + cat.heading * 1.05
		ball = Vector3(target.x, BALL_RADIUS, target.y)
		ball_velocity = Vector3.ZERO
	else:
		var previous := ball
		ball_velocity.y -= 15 * delta
		ball += ball_velocity * delta
		if ball.y < BALL_RADIUS:
			ball.y = BALL_RADIUS
			ball_velocity.y = absf(ball_velocity.y) * 0.42 if absf(ball_velocity.y) > 1.1 else 0.0
			ball_velocity.x = move_toward(ball_velocity.x, 0, 3.5 * delta)
			ball_velocity.z = move_toward(ball_velocity.z, 0, 3.5 * delta)
		# Resolve the first contact along the flight, before a later goal crossing.
		var goal_fraction := 1.0
		var scoring_team := -1
		for side in [-1, 1]:
			var plane: float = side * (HALF_LENGTH + BALL_RADIUS)
			if side * previous.x <= side * plane and side * ball.x > side * plane:
				var fraction := (plane - previous.x) / (ball.x - previous.x)
				var crossing := previous.lerp(ball, fraction)
				if absf(crossing.z) < GOAL_HALF_WIDTH - BALL_RADIUS and crossing.y < GOAL_HEIGHT - BALL_RADIUS:
					goal_fraction = fraction
					scoring_team = 0 if side == 1 else 1
		if receive_ball(previous, ball, goal_fraction): return
		if scoring_team >= 0:
			goal(scoring_team)
			return
	if absf(ball.z) > HALF_WIDTH - BALL_RADIUS:
		ball.z = clampf(ball.z, -HALF_WIDTH + BALL_RADIUS, HALF_WIDTH - BALL_RADIUS)
		ball_velocity.z *= -0.7
		if owner < 0: flight_is_shot = false
	if absf(ball.x) > HALF_LENGTH - BALL_RADIUS and (absf(ball.z) >= GOAL_HALF_WIDTH - BALL_RADIUS or ball.y >= GOAL_HEIGHT - BALL_RADIUS):
		ball.x = clampf(ball.x, -HALF_LENGTH + BALL_RADIUS, HALF_LENGTH - BALL_RADIUS)
		ball_velocity.x *= -0.7
		if owner < 0: flight_is_shot = false
	if owner < 0: receive_ball(ball, ball)

func receive_ball(from: Vector3, to: Vector3, limit := 1.0) -> bool:
	# A spent shot is a loose ball: use the visible body contact rules again.
	if flight_is_shot and to.y < RECEIVE_HEIGHT and Vector2(ball_velocity.x,ball_velocity.z).length() <= 6.0:
		flight_is_shot = false
	var start := Vector2(from.x, from.z)
	var travel := Vector2(to.x, to.z) - start
	var length_squared := travel.length_squared()
	var first := limit
	var receiver := -1
	for i in range(cats.size()):
		if cats[i].stun > 0 or (i == last_kicker and pickup_lock > 0): continue
		if i==last_kicker and pass_target>=0 and Vector2(ball_velocity.x,ball_velocity.z).length()>3.0: continue
		var receive_radius := (1.15 * (AWAY_DIFFICULTY if cats[i].team == 1 and cats[i].keeper else 1.0)) if flight_is_shot else RECEIVE_RADIUS
		var offset: Vector2 = start - cats[i].pos
		var entry := 0.0
		var leave := limit
		if not flight_is_shot and pass_body_contact.is_valid():
			var interval: Vector2 = pass_body_contact.call(i,from,to,limit)
			entry = interval.x
			leave = interval.y
		elif length_squared < 0.000001:
			if offset.length_squared() > receive_radius * receive_radius: continue
		else:
			var projection := offset.dot(travel)
			var discriminant := projection * projection - length_squared * (offset.length_squared() - receive_radius * receive_radius)
			if discriminant < 0: continue
			entry = maxf(0, (-projection - sqrt(discriminant)) / length_squared)
			leave = minf(limit, (-projection + sqrt(discriminant)) / length_squared)
		# Intersect the horizontal contact interval with catchable ball height.
		var rise := to.y - from.y
		if absf(rise) < 0.000001:
			if from.y >= RECEIVE_HEIGHT: continue
		elif rise > 0:
			leave = minf(leave, (RECEIVE_HEIGHT - from.y) / rise)
		else:
			entry = maxf(entry, (RECEIVE_HEIGHT - from.y) / rise)
		if entry > leave or entry < 0 or entry > first: continue
		if receiver >= 0 and is_equal_approx(entry, first): continue
		first = entry
		receiver = i
	if receiver < 0: return false
	owner = receiver
	flight_is_shot = false
	ensure_keeper_hold()
	if cats[owner].team == 0:
		possession_serial += 1
		possession_feedback = "INTERCEPTED!" if last_kicker >= 0 and cats[last_kicker].team == 1 else "BALL RECEIVED!"
	ai_tackle_grace = 0.65
	cats[owner].think = ai_interval(owner, 0.2)
	ball = from.lerp(to, first)
	ball_velocity = Vector3.ZERO
	if cats[owner].keeper: cats[owner].kick = 0.4
	if pass_in_flight and cats[owner].team == 0 and not cats[owner].keeper:
		controlled = owner
	pass_in_flight = false
	pass_target = -1
	select_initial_defender()
	return true

func switch_control() -> bool:
	if state!="playing": return false
	controlled = 1 if controlled==0 else 0
	# Keep this explicit choice for the current opponent possession/pass cycle.
	if owner>=0 and cats[owner].team==1:
		defender_selected=true
		selected_sequence=pass_sequence
		selected_carrier=owner
	role_owner=-2
	return true

func select_initial_defender() -> void:
	if owner < 0 or cats[owner].team != 1: return
	if defender_selected and selected_sequence == pass_sequence and selected_carrier == owner: return
	var nearest := controlled
	var distance := INF
	var target: Vector2 = cats[owner].pos
	for i in range(cats.size()):
		if cats[i].team != 0 or cats[i].keeper: continue
		var gap: float = cats[i].pos.distance_squared_to(target)
		if gap < distance:
			distance = gap
			nearest = i
	controlled = nearest
	defender_selected = true
	selected_sequence = pass_sequence
	selected_carrier = owner
	shot_charge = 0

func goal(team: int) -> void:
	score[team] += 1
	goal_team = team
	owner = -1
	shot_charge = 0
	ball_velocity = Vector3.ZERO
	state = "finished" if overtime else "goal"
	phase_time = 2.8

func pass_ball(i: int, requested_recipient := -1) -> bool:
	if state != "playing" or owner != i: return false
	if cats[i].keeper:
		ensure_keeper_hold()
		if keeper_hold_time>0: return false
	var recipient := -1
	var best := INF
	for j in range(6):
		if j == i or cats[j].team != cats[i].team or cats[j].keeper: continue
		var cost: float = cats[j].pos.distance_to(cats[i].pos)
		if cost < best:
			best = cost
			recipient = j
	if requested_recipient >= 0 and requested_recipient < cats.size() and requested_recipient != i and cats[requested_recipient].team == cats[i].team and not cats[requested_recipient].keeper:
		recipient = requested_recipient
	if recipient < 0: return false
	var aim: Vector2 = cats[recipient].pos + cats[recipient].velocity * 0.2 - cats[i].pos
	var distance: float = cats[i].pos.distance_to(cats[recipient].pos)
	var speed := keeper_pass_speed(distance) if cats[i].keeper else PASS_SPEED
	# Keep the low trajectory and swept reception, even for long distributions.
	kick(i, aim.normalized(), speed, 1.1)
	# Each pass starts a fresh selection cycle; movement alone never unlocks it.
	defender_selected = false
	pass_sequence += 1
	pass_in_flight = cats[i].team == 0 and (i == controlled or recipient == controlled)
	pass_target = recipient
	flight_is_shot = false
	if cats[i].team == 0:
		passes += 1
	return true

func shot_direction(i: int, aim: Vector2) -> Vector2:
	if aim.length() > 0.1: return aim.normalized()
	return cats[i].heading.normalized()

func shoot(i: int, charge: float, aim: Vector2) -> bool:
	if state != "playing" or owner != i: return false
	var direction := shot_direction(i, aim)
	kick(i, direction, lerpf(16, 27, clampf(charge, 0, 1)), lerpf(1.5, 5, clampf(charge, 0, 1)))
	if cats[i].team == 0: shots += 1
	return true

func kick(i: int, direction: Vector2, power: float, loft: float) -> void:
	cats[i].heading = direction
	cats[i].kick = 0.28
	# Launch from the current carrier, not the previous frame's ball position.
	var launch: Vector2 = cats[i].pos + direction * 1.05
	ball = Vector3(launch.x, BALL_RADIUS, launch.y)
	owner = -1
	keeper_hold_owner = -1
	keeper_hold_time = 0
	pickup_lock = 0.22
	last_kicker = i
	flight_is_shot = true
	role_owner = -2
	pass_in_flight = false
	pass_target = -1
	ball_velocity = Vector3(direction.x * power, loft, direction.y * power)
	shot_charge = 0

func tackle_status(i: int) -> String:
	if state != "playing": return "inactive"
	if owner == i: return "possession"
	if owner < 0: return "loose"
	if cats[owner].keeper: return "keeper"
	if cats[owner].team == cats[i].team: return "teammate"
	if cats[i].cooldown > 0: return "cooldown"
	var offset: Vector2 = cats[owner].pos - cats[i].pos
	if offset.length() >= TACKLE_RANGE: return "approach"
	return "ready"

func tackle(i: int) -> bool:
	if owner>=0 and cats[owner].keeper: return false
	if state == "playing" and owner >= 0 and owner != i and cats[owner].team == cats[i].team:
		return pass_ball(owner, i)
	if state != "playing" or cats[i].cooldown > 0: return false
	var ready := tackle_status(i) == "ready"
	cats[i].cooldown = TACKLE_COOLDOWN
	cats[i].kick = 0.25
	if ready:
		cats[owner].stun = 0.45
		owner = i
		if cats[i].team == 0:
			possession_serial += 1
			possession_feedback = "BALL WON!"
		ai_tackle_grace = 0.65
		cats[i].think = ai_interval(i, 0.2)
		select_initial_defender()
		if cats[i].team == 0: tackles += 1
		return true
	cats[i].stun = 0.22
	return false
