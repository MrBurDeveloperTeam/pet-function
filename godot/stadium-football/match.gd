extends RefCounted
## Deterministic match rules, separate from rendering and the browser bridge.
const HALF_LENGTH := 22.0
const HALF_WIDTH := 13.0
const GOAL_HALF_WIDTH := 3.4
const BALL_RADIUS := 0.4
const REGULATION := 180.0
const EXTRA_TIME := 30.0
var cats: Array[Dictionary] = []
var ball := Vector3(0, BALL_RADIUS, 0)
var ball_velocity := Vector3.ZERO
var owner := -1
var pickup_lock := 0.0
var controlled := 0
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
var rng := RandomNumberGenerator.new()

func _init(seed_value: int = 42) -> void:
	rng.seed = seed_value
	for i in range(6):
		var team: int = i / 3
		cats.append({"team": team, "keeper": i % 3 == 2, "pos": Vector2.ZERO,
			"velocity": Vector2.ZERO, "heading": Vector2(1 if team == 0 else -1, 0),
			"stamina": 100.0, "cooldown": 0.0, "stun": 0.0, "kick": 0.0, "think": 0.0})
	reset_positions(0)

func reset_positions(team: int) -> void:
	kickoff_team = team
	for i in range(6):
		var sign_x := -1.0 if cats[i].team == 0 else 1.0
		cats[i].pos = Vector2(sign_x * (20.0 if cats[i].keeper else 7.0), 0 if cats[i].keeper else (-5.0 if i % 3 == 0 else 5.0))
		cats[i].velocity = Vector2.ZERO
		cats[i].cooldown = 0.0
		cats[i].stun = 0.0
		cats[i].heading = Vector2(-sign_x, 0)
	owner = team * 3
	cats[owner].pos = Vector2(-0.8 if team == 0 else 0.8, 0)
	controlled = 0
	ball = Vector3(0, BALL_RADIUS, 0)
	ball_velocity = Vector3.ZERO
	pickup_lock = 0.0
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
	elapsed += delta
	pickup_lock = maxf(0, pickup_lock - delta)
	for i in range(6):
		var cat := cats[i]
		cat.cooldown = maxf(0, cat.cooldown - delta)
		cat.stun = maxf(0, cat.stun - delta)
		cat.kick = maxf(0, cat.kick - delta)
		cat.think = maxf(0, cat.think - delta)
		var direction := movement.limit_length() if i == controlled else ai_direction(i)
		var boosting: bool = i == controlled and sprint and cat.stamina > 1 and direction.length() > 0.1
		cat.stamina = clampf(cat.stamina + (-32 if boosting else 19) * delta, 0, 100)
		var speed := 8.2 if boosting else 5.6
		if cat.keeper: speed = 6.2
		if i == owner: speed *= 0.92
		if cat.stun > 0: direction = Vector2.ZERO
		cat.velocity = cat.velocity.move_toward(direction * speed, 28 * delta)
		cat.pos += cat.velocity * delta
		cat.pos.x = clampf(cat.pos.x, -21.1, 21.1)
		cat.pos.y = clampf(cat.pos.y, -12.1, 12.1)
		if direction.length() > 0.1: cat.heading = direction.normalized()
		if i != controlled: ai_action(i)
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
	update_ball(delta)
	if state != "playing": return
	if not overtime and elapsed >= REGULATION:
		if score[0] == score[1]: overtime = true
		else: state = "finished"
	elif overtime and elapsed >= REGULATION + EXTRA_TIME: state = "finished"

func ai_direction(i: int) -> Vector2:
	var cat := cats[i]
	var attack := 1.0 if cat.team == 0 else -1.0
	var target := Vector2(ball.x, ball.z)
	if cat.keeper:
		target = Vector2(-attack * 19.8, clampf(ball.z * 0.65, -3.0, 3.0))
		if absf(ball.x + attack * 20) < 5 and absf(ball.z) < 5: target = Vector2(ball.x, ball.z)
	elif owner == i:
		target = Vector2(attack * 21, clampf(cat.pos.y * 0.5, -2.5, 2.5))
	elif owner >= 0 and cats[owner].team == cat.team:
		target = Vector2(clampf(cats[owner].pos.x + attack * 5, -18, 18), -6 if cats[owner].pos.y > 0 else 6)
	else:
		var partner: int = cat.team * 3 + (1 if i % 3 == 0 else 0)
		if cats[partner].pos.distance_to(target) < cat.pos.distance_to(target):
			target = Vector2(target.x - attack * 5, -4 if target.y > 0 else 4)
	var offset: Vector2 = target - cat.pos
	return offset.normalized() if offset.length() > 0.35 else Vector2.ZERO

func ai_action(i: int) -> void:
	var cat := cats[i]
	if cat.think > 0 or cat.stun > 0: return
	if owner == i:
		if cat.keeper:
			pass_ball(i)
			cat.think = 1.3
		elif absf(cat.pos.x - (22 if cat.team == 0 else -22)) < 13:
			shoot(i, 0.65, Vector2.ZERO)
			cat.think = 1.6
		else:
			var threatened := false
			for rival in cats:
				if rival.team != cat.team and rival.pos.distance_to(cat.pos) < 3: threatened = true
			if threatened:
				pass_ball(i)
				cat.think = 1.2
	elif owner >= 0 and cats[owner].team != cat.team and cat.pos.distance_to(cats[owner].pos) < 1.9:
		tackle(i)
		cat.think = 0.7

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
		# Swept goal crossing prevents fast shots tunnelling past the goal mouth.
		for side in [-1, 1]:
			var plane: float = side * (HALF_LENGTH + BALL_RADIUS)
			if side * previous.x <= side * plane and side * ball.x > side * plane:
				var fraction := (plane - previous.x) / (ball.x - previous.x)
				var crossing := previous.lerp(ball, fraction)
				if absf(crossing.z) < GOAL_HALF_WIDTH - BALL_RADIUS and crossing.y < 2.8 - BALL_RADIUS:
					goal(0 if side == 1 else 1)
					return
	if absf(ball.z) > HALF_WIDTH - BALL_RADIUS:
		ball.z = clampf(ball.z, -HALF_WIDTH + BALL_RADIUS, HALF_WIDTH - BALL_RADIUS)
		ball_velocity.z *= -0.7
	if absf(ball.x) > HALF_LENGTH - BALL_RADIUS and (absf(ball.z) >= GOAL_HALF_WIDTH - BALL_RADIUS or ball.y >= 2.4):
		ball.x = clampf(ball.x, -HALF_LENGTH + BALL_RADIUS, HALF_LENGTH - BALL_RADIUS)
		ball_velocity.x *= -0.7
	if owner < 0 and pickup_lock <= 0 and ball.y < 1.0:
		var nearest := -1
		var distance := 1.15
		for i in range(6):
			var gap: float = cats[i].pos.distance_to(Vector2(ball.x, ball.z))
			if gap < distance and cats[i].stun <= 0:
				distance = gap
				nearest = i
		if nearest >= 0:
			owner = nearest
			if cats[owner].keeper: cats[owner].kick = 0.4
			if cats[owner].team == 0 and not cats[owner].keeper: controlled = owner

func goal(team: int) -> void:
	score[team] += 1
	goal_team = team
	owner = -1
	shot_charge = 0
	ball_velocity = Vector3.ZERO
	state = "finished" if overtime else "goal"
	phase_time = 2.8

func pass_ball(i: int) -> bool:
	if state != "playing" or owner != i: return false
	var recipient := -1
	var best := INF
	for j in range(6):
		if j == i or cats[j].team != cats[i].team or cats[j].keeper: continue
		var cost: float = cats[j].pos.distance_to(cats[i].pos)
		if cost < best:
			best = cost
			recipient = j
	if recipient < 0: return false
	var aim: Vector2 = cats[recipient].pos + cats[recipient].velocity * 0.2 - Vector2(ball.x, ball.z)
	kick(i, aim.normalized(), 14.0, 1.1)
	if cats[i].team == 0:
		passes += 1
		controlled = recipient
	return true

func shoot(i: int, charge: float, aim: Vector2) -> bool:
	if state != "playing" or owner != i: return false
	var target := Vector2(22 if cats[i].team == 0 else -22, 0)
	var assisted: Vector2 = (target - cats[i].pos).normalized()
	if aim.length() > 0.1: assisted = (assisted + aim.normalized() * 0.32).normalized()
	var spread := rng.randf_range(-0.16, 0.16) * clampf(charge, 0, 1)
	kick(i, assisted.rotated(spread), lerpf(16, 27, clampf(charge, 0, 1)), lerpf(1.5, 5, clampf(charge, 0, 1)))
	if cats[i].team == 0: shots += 1
	return true

func kick(i: int, direction: Vector2, power: float, loft: float) -> void:
	cats[i].heading = direction
	cats[i].kick = 0.28
	owner = -1
	pickup_lock = 0.22
	ball_velocity = Vector3(direction.x * power, loft, direction.y * power)
	shot_charge = 0

func tackle(i: int) -> bool:
	if state != "playing" or cats[i].cooldown > 0: return false
	cats[i].cooldown = 1.15
	cats[i].kick = 0.25
	if owner >= 0 and cats[owner].team != cats[i].team:
		var offset: Vector2 = cats[owner].pos - cats[i].pos
		if offset.length() < 1.85 and cats[i].heading.dot(offset.normalized()) > 0.15:
			cats[owner].stun = 0.45
			owner = i
			if cats[i].team == 0: tackles += 1
			return true
	cats[i].stun = 0.22
	return false

func switch_player() -> void:
	var target := Vector2(ball.x, ball.z)
	var candidate := 0 if controlled == 1 else 1
	if owner >= 0 and cats[owner].team == 0 and not cats[owner].keeper: candidate = owner
	elif cats[candidate].pos.distance_to(target) > cats[controlled].pos.distance_to(target) + 4: return
	controlled = candidate
	shot_charge = 0
