extends RefCounted

const LABELS = ["TRIPLE FAN","SAFE LANE","HOMING x2","SAFE LANE","FLANK VOLLEY","SPLIT CURTAIN","LOCKED BURST / MOVE","STAGGERED ROW","TWIN HELIX","DOUBLE GATE","TRIDENT BURST","DIAGONAL RAIN","CROSS FIRE","CHECKERBOARD","ROTATING FANS","OPEN RING","COMET SWARM","ZIPPER WALL"]
const CORRIDORS = [1,3,4,5,7,8,9,11,13,17]
const AIMED = [6,10,12,16]
const SAFE_HALF_WIDTH = 60.0
const SAFE_MARKER_HALF_WIDTH = 45.0
const RING_OPENING_HALF_ANGLE = 0.35

func extra_volleys(pattern: int) -> int:
	return 2 if pattern in [0,6,10,14] else (1 if pattern in [9,17] else 0)

func bullet(game, pos: Vector2, velocity: Vector2, extras: Dictionary = {}):
	var shot = {"pos":pos,"vel":velocity,"radius":5.0,"boss":true}
	shot.merge(extras)
	game.enemy_shots.append(shot)

func fire(game, e: Dictionary):
	var origin: Vector2 = e.pos+Vector2(0,80)
	var aim: Vector2 = e.get("aim_point",game.player)
	var phase: int = e.get("volley",0)
	match int(e.attack):
		8: # Twin oscillating columns stay outside the safe corridor.
			for side in [-1,1]:
				for i in range(5):
					var x: float = e.gap_x+side*(SAFE_HALF_WIDTH+25+i*45)
					if x < 30 or x > game.arena_size.x-30: continue
					bullet(game,Vector2(x,origin.y-i*24),Vector2(0,165),{"wave_x":x,"wave_phase":i*0.9,"wave_age":0.0})
		9,11,13,17:
			var count = clampi(int(game.arena_size.x/85),8,16)
			for i in range(count):
				var x = lerpf(35,game.arena_size.x-35,float(i)/(count-1))
				if absf(x-e.gap_x) < SAFE_HALF_WIDTH: continue
				var offset = 0.0
				var drift = 0.0
				var speed = 175.0
				if e.attack == 9: offset = (i%2)*40.0+phase*20
				if e.attack == 11: drift = 65.0 if x > e.gap_x else -65.0
				if e.attack == 13: offset = (i%3)*65.0; speed = 145+i%3*15
				if e.attack == 17: offset = i*12.0 if phase == 0 else (count-1-i)*12.0
				bullet(game,Vector2(x,origin.y-offset),Vector2(drift,speed))
			# Pin both borders so grid spacing cannot accidentally widen the opening.
			for side in [-1,1]:
				bullet(game,Vector2(e.gap_x+side*SAFE_HALF_WIDTH,origin.y),Vector2(0,175))
		10:
			var direction = (aim-origin).normalized()
			for i in range(3): bullet(game,origin,direction.rotated((i-1)*0.20)*195)
		12:
			for side in [-1,1]:
				var launch = Vector2(35 if side < 0 else game.arena_size.x-35,origin.y)
				var direction = (aim-launch).normalized()
				for i in range(3): bullet(game,launch,direction.rotated((i-1)*0.13)*180)
		14:
			for side in [-1,1]:
				for i in range(4):
					var angle = PI/2+(i-1.5)*0.27+side*0.32+(phase-1)*0.10
					bullet(game,origin+Vector2(side*70,0),Vector2.from_angle(angle)*165)
		15:
			# Keep a narrow downward opening for the player's collision core.
			for i in range(18):
				var angle = i*TAU/18
				if absf(wrapf(angle-PI/2,-PI,PI)) < RING_OPENING_HALF_ANGLE: continue
				bullet(game,origin,Vector2.from_angle(angle)*155)
		16:
			for i in range(3):
				var launch = origin+Vector2((i-1)*65,-abs(i-1)*20)
				bullet(game,launch,(aim-launch).normalized().rotated((i-1)*0.18)*155,{"radius":6.0,"homing_time":0.45})
