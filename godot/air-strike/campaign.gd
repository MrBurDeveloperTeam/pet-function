extends RefCounted
## Stage rules are independent of pet/aircraft level and permanent talents.
var game
var active = false
var waiting = 1.0
var boss_phase = false
var alert_age = 0.0
var alert_pulse = -1
var bosses_defeated = 0
var infinite_wave = 0
var super_offer = false
var hazards: Array = []
var hazard_timer = 10.0
const CHAPTERS = ["CORAL PATROL","IRON ARMADA","AMBUSH","SHIELD FRONT","SUPPORT SQUADRON","ELITE STRIKE","LASER SECTOR","BULLET STORM","COMBINED ARMS","FINAL OPERATION"]
const ROLES = ["fighter","fast","armored","tank","sniper","spread","dash","suicide","shielded","shield_support","healer","missile","summoner"]
const AFFIXES = ["fast","armored","shield","berserk","double_shot","regeneration"]
const MUTATIONS = ["shield","regeneration","summon","missile","laser","clone","teleport","berserk","double_projectile","armor"]
func reset():
	active = false
	waiting = 1
	boss_phase = false
	alert_age = 0.0
	alert_pulse = -1
	bosses_defeated = 0
	infinite_wave = 0
	super_offer = false
	hazards.clear()
	hazard_timer = 10
func chapter() -> int:
	return 9 if game.infinite_mode else mini(9,int((game.stage_level-1)/10))
func wave_limit() -> int:
	return 5 if game.stage_level <= 20 else (6 if game.stage_level <= 50 else (7 if game.stage_level <= 80 else 8))
func threat() -> int:
	return 1+int(infinite_wave/10)
func scaling() -> Dictionary:
	var t = (game.stage_level-1)/99.0
	if not game.infinite_mode:
		return {"hp":1+2.2*t,"damage":1+1.2*t,"count":1+1.6*t,"speed":1+0.33*t,"bullet":1+0.42*t}
	var w = maxi(0,infinite_wave-1)
	var health = 1+mini(w,100)*0.02+clampi(w-100,0,200)*0.01+maxi(0,w-300)*0.005
	var builds = game.progression.routes(true).size()
	return {"hp":health*(1+builds*0.06),"damage":1+minf(w*0.002,1.5),"count":minf(3.0,1+w*0.005)*(1+builds*0.04),"speed":minf(1.4,1+w*0.001),"bullet":minf(1.45,1+w*0.001)}
func roles_for_stage() -> Array:
	if game.infinite_mode: return ROLES.duplicate()
	var c = chapter()
	var pool = ["fighter","fast"]
	if c >= 1: pool.append_array(["armored","tank"])
	if c >= 2: pool.append_array(["sniper","spread","dash","suicide"])
	if c >= 3: pool.append_array(["shielded","shield_support"])
	if c >= 4: pool.append_array(["healer","missile"])
	if c >= 5: pool.append("summoner")
	if game.stage_level == 91: return ["fast","dash","fighter"]
	if game.stage_level == 92: return ["shielded","shield_support","tank"]
	if game.stage_level == 93: return ["summoner","fighter","healer"]
	if game.stage_level == 94: return ["missile","sniper","fast"]
	if game.stage_level == 95: return ["tank","sniper","shielded"]
	if game.stage_level == 96: return ["tank","healer","armored"]
	if game.stage_level == 97: return ["spread","missile","sniper"]
	return pool
func decorate(e: Dictionary, role: String, elite: bool):
	var scale = scaling()
	e.role = role
	e.elite = elite
	e.affixes = []
	e.shield = 1 if role == "shielded" else 0
	e.ability = 3.0
	e.pattern = 0
	e.damage = scale.damage
	e.speed_scale = scale.speed*(1.6 if role == "fast" else 1.0)
	e.bullet_scale = scale.bullet
	e.hp = float(e.hp)*scale.hp*(1.6 if role == "armored" else 1.0)*(1.8 if elite else 1.0)
	e.armor = 0.75 if role == "armored" else 1.0
	if elite:
		var pool = AFFIXES.duplicate()
		var affix_count = (2 if threat() >= 20 else (1 if threat() >= 15 else 0)) if game.infinite_mode else (1 if chapter() >= 5 else 0)
		for i in range(affix_count):
			var index = game.rng.randi_range(0,pool.size()-1)
			e.affixes.append(pool.pop_at(index))
		if e.affixes.has("shield"): e.shield = 1
		if e.affixes.has("fast"): e.speed_scale *= 1.3
		if e.affixes.has("armored"): e.hp *= 1.4; e.armor = 0.7
	e.max_hp = e.hp
func update(delta: float):
	update_hazards(delta)
	if boss_phase: return
	if active:
		if not game.enemies.is_empty(): return
		active = false
		waiting = 1.5
		game.enemy_shots.clear()
		return
	waiting -= delta
	if waiting > 0: return
	if not game.infinite_mode and game.wave >= wave_limit() and not game.progression.routes(true).is_empty():
		begin_boss_alert()
		return
	game.wave += 1
	infinite_wave = game.wave if game.infinite_mode else 0
	if game.infinite_mode and game.wave%10 == 0 and not game.progression.routes(true).is_empty():
		begin_boss_alert()
		return
	active = true
	var scale = scaling()
	var count = clampi(ceili((2+(mini(game.wave,8)-1)*0.7)*scale.count),2,24)
	var pool = roles_for_stage()
	for i in range(count):
		var role: String = pool[(i+game.wave)%pool.size()]
		# Support formations arrive with a tank screen from chapter seven.
		if chapter() >= 6 and i == 0: role = "shield_support" if game.wave%2 else "healer"
		if chapter() >= 6 and i == 1: role = "tank"
		var kind = "ship" if role in ["tank","healer","shield_support","summoner"] else ("bomber" if role in ["armored","spread","missile"] else "fighter")
		var x = lerpf(0.15,0.85,(i%6)/5.0)
		var elite = (not game.infinite_mode and game.stage_level >= 5 and game.wave%3 == 0 and i == count-1) or (game.infinite_mode and (game.wave%5 == 0 or threat() >= 5) and i >= count-(2 if threat() >= 10 else 1))
		game.spawn_enemy(kind,Vector2(game.arena_size.x*x,-40-int(i/6)*70),i,role,elite)
	game.notice = "WAVE %d / %s" % [game.wave,"THREAT %d" % threat() if game.infinite_mode else str(wave_limit())]
	game.notice_time = 2
func begin_boss_alert():
	boss_phase = true
	alert_age = 0.0
	alert_pulse = -1
	game.enemy_shots.clear()
	hazards.clear()
	game.dragging = false
	game.state = "boss_alert"
func update_alert(delta: float):
	alert_age += delta
	var pulse = int(alert_age / 0.55)
	if pulse != alert_pulse:
		alert_pulse = pulse
		game.play_cue("boss_warning")
	game.impact_shake = 4.0 + 2.0 * sin(alert_age * 18.0)
	if alert_age >= 3.0:
		game.impact_shake = 0.0
		game.state = "playing"
		game.spawn_boss()
		prepare_boss(game.enemies.back())
func prepare_boss(e: Dictionary):
	decorate(e,"boss",false)
	# Vary the opening pair so shorter boss fights also expose the new attacks.
	e.attack = game.rng.randi_range(0,8)*2
	e.mutations = []
	e.stage_phase = 1
	e.boss_ability = 7.0
	e.summon_timer = 5.0
	e.max_hp *= 1.5 if game.infinite_mode and infinite_wave%50 == 0 else 1.0
	e.hp = e.max_hp
	if not game.infinite_mode:
		if chapter() >= 3: e.mutations.append("shield")
		if chapter() >= 4: e.mutations.append("missile")
		if chapter() >= 5: e.mutations.append("summon")
		if chapter() >= 6: e.mutations.append("laser")
		if game.stage_level == 98: e.mutations.append("berserk")
		var final_focus = {91:["berserk"],92:["shield"],93:["summon"],94:["missile"],95:["laser"],96:["regeneration","armor"],97:["double_projectile"],98:["laser","summon","berserk"]}
		if final_focus.has(game.stage_level): e.mutations = final_focus[game.stage_level].duplicate()
	else:
		var pool = MUTATIONS.duplicate()
		var count = 2 if threat() >= 30 else (1 if threat() >= 25 else 0)
		if infinite_wave%50 == 0: count = maxi(2,count)
		for i in range(count): e.mutations.append(pool.pop_at(game.rng.randi_range(0,pool.size()-1)))
	if e.mutations.has("armor"): e.armor = 0.7
	if e.mutations.has("shield"): e.shield = 3
	game.notice = "SUPER BOSS" if game.infinite_mode and infinite_wave%50 == 0 else "BOSS / STAGE %03d" % game.stage_level
	game.notice_time = 3
func boss_defeated():
	bosses_defeated += 1
	game.enemy_shots.clear()
	hazards.clear()
	game.enemies.clear()
	if not game.infinite_mode and game.stage_level == 99 and bosses_defeated < 3:
		begin_boss_alert()
		return
	if not game.infinite_mode:
		game.finish_run("victory")
		return
	boss_phase = false
	game.boss_spawned = false
	waiting = 2
	super_offer = infinite_wave%50 == 0
	game.send_checkpoint()
func damage_enemy(e: Dictionary, damage: float, critical: bool = false) -> float:
	if not game.boss_can_take_damage(e): return 0
	if e.get("shield",0) > 0:
		e.shield -= 1
		game.add_effect(e.pos,"shield_hit",0.3,e.radius+12)
		return 0
	var weak_point = 1.15 if critical and e.kind == "boss" and not e.get("warning",false) and e.get("volley",0) == 0 and e.get("fire",0.0) > 0 else 1.0
	var actual = minf(maxf(0,e.hp),damage*e.get("armor",1.0)*weak_point)
	e.hp -= actual
	return actual
func update_enemy(e: Dictionary, delta: float):
	e.ability = e.get("ability",3.0)-delta
	if e.kind == "boss":
		update_boss(e,delta)
		return
	if e.get("role","") == "sniper" and e.fire < 0.7 and not e.has("sniper_aim"):
		e.sniper_aim = (game.player-e.pos).normalized()
	if e.get("role","") == "dash" and e.age > 2 and e.age < 2.7:
		e.pos += (game.player-e.pos).normalized()*180*delta*game.ENEMY_FLIGHT_SPEED_SCALE
	if e.get("role","") == "suicide":
		e.pos.x = move_toward(e.pos.x,game.player.x,70*delta*game.ENEMY_FLIGHT_SPEED_SCALE)
	if e.ability > 0: return
	e.ability = 3
	if e.role == "healer" or e.affixes.has("regeneration"):
		for other in game.enemies:
			if other.pos.distance_to(e.pos) < 180: other.hp = minf(other.max_hp,other.hp+other.max_hp*0.08)
		game.add_effect(e.pos,"shield_hit",0.6,160)
	if e.role == "shield_support":
		for other in game.enemies:
			if other != e and other.kind != "boss" and other.pos.distance_to(e.pos) < 170: other.shield = maxi(1,other.get("shield",0))
	if e.role == "summoner": summon(e)
func summon(e: Dictionary, roles: Array = ["fighter","fast"]):
	if game.enemies.size() >= 30: return
	for i in range(roles.size()):
		var role: String = roles[i]
		game.spawn_enemy("ship" if role in ["healer","shield_support"] else "fighter",e.pos+Vector2((i-1)*65,55),i,role)
func fire(e: Dictionary) -> bool:
	if e.kind == "boss": return false
	if game.enemy_shots.size() >= 90: return true
	var role: String = e.get("role","fighter")
	var origin: Vector2 = e.pos+Vector2(0,20)
	var aim: Vector2 = e.get("sniper_aim",(game.player-origin).normalized())
	e.erase("sniper_aim")
	var count = 3 if role in ["spread","tank"] else 1
	if e.get("affixes",[]).has("double_shot"): count += 1
	if chapter() >= 7 and role == "spread":
		if game.enemy_shots.any(func(b): return b.get("pattern",false)): return true
		e.pattern = (e.pattern+1)%4
		count = 8 if e.pattern%2 == 0 else 5
	for i in range(count):
		var direction = aim.rotated((i-(count-1)/2.0)*0.22)
		if chapter() >= 7 and role == "spread" and e.pattern == 0: direction = Vector2.from_angle(i*TAU/count+e.age)
		if chapter() >= 7 and role == "spread" and e.pattern == 2: direction = Vector2.from_angle(i*TAU/count+PI/4)
		var speed = (230 if role == "sniper" else 155)*e.get("bullet_scale",1.0)
		game.enemy_shots.append({"pos":origin,"vel":direction*speed,"radius":5.0,"damage":e.get("damage",1.0),"homing_time":0.65 if role == "missile" else 0.0,"pattern":role == "spread" and chapter() >= 7})
	return true
func update_boss(e: Dictionary, delta: float):
	if not game.boss_can_take_damage(e): return
	e.summon_timer = e.get("summon_timer",5.0)-delta
	if e.summon_timer <= 0:
		e.summon_timer += 5.0
		summon(e,["fighter","fighter","fighter"])
	if not e.has("mutations"): return
	if game.stage_level in [98,100] and not game.infinite_mode:
		var phase = 1 if e.hp/e.max_hp > 0.75 else (2 if e.hp/e.max_hp > 0.5 else (3 if e.hp/e.max_hp > 0.25 else 4))
		if phase > e.stage_phase:
			e.stage_phase = phase
			game.notice = "FINAL BOSS / PHASE %d" % phase
			game.notice_time = 2
			if phase >= 3: hazard_timer = 0
			if phase == 4 and not e.mutations.has("berserk"): e.mutations.append("berserk")
	e.boss_ability -= delta
	if e.boss_ability > 0 or e.get("warning",false) or e.get("volley",0) > 0: return
	# Mutations use the recovery window, never stack another curtain over an active pattern.
	if game.enemy_shots.any(func(b): return b.get("boss",false)): return
	e.boss_ability = 9
	if e.mutations.has("shield"): e.shield = maxi(e.get("shield",0),1)
	if e.mutations.has("regeneration"): e.hp = minf(e.max_hp,e.hp+e.max_hp*0.03)
	if e.mutations.has("teleport"): e.age += PI
	if e.mutations.has("laser"): hazard_timer = 0
	if e.mutations.has("missile"):
		game.enemy_shots.append({"pos":e.pos+Vector2(0,80),"vel":Vector2(0,150),"radius":6.0,"boss":true,"damage":e.damage,"homing_time":0.65})
func hazard_age(h: Dictionary) -> float:
	return h.get("age",0.0)
func hazard_firing(h: Dictionary) -> bool:
	return hazard_age(h) >= 2.0 and hazard_age(h) < 3.0
func hazard_station(h: Dictionary) -> Vector2:
	var size: Vector2 = game.sprites["laser_strike"].get_size()*1.5
	return Vector2(h.line*game.arena_size.x,size.y/2+8) if h.vertical else Vector2(size.y/2+8,h.line*game.arena_size.y)
func hazard_position(h: Dictionary) -> Vector2:
	var station = hazard_station(h)
	var direction = Vector2.DOWN if h.vertical else Vector2.RIGHT
	var age = hazard_age(h)
	if age < 0.5:
		return station-direction*220*pow(1-age/0.5,2)
	if age >= 3.0:
		return station+(direction.orthogonal()*500-direction*180)*pow((age-3.0)/0.5,2)
	return station
func hazard_origin(h: Dictionary) -> Vector2:
	var direction = Vector2.DOWN if h.vertical else Vector2.RIGHT
	return hazard_station(h)+direction*(game.sprites["laser_strike"].get_height()*0.75-4)
func hazard_area(h: Dictionary) -> Rect2:
	var origin = hazard_origin(h)
	if h.vertical:
		var width: float = h.width*game.arena_size.x
		return Rect2(Vector2(origin.x-width,origin.y),Vector2(width*2,maxf(0,game.arena_size.y-origin.y)))
	var width: float = h.width*game.arena_size.y
	return Rect2(Vector2(origin.x,origin.y-width),Vector2(maxf(0,game.arena_size.x-origin.x),width*2))
func update_hazards(delta: float):
	for i in range(hazards.size()-1,-1,-1):
		var h = hazards[i]
		h.age = hazard_age(h)+delta
		h.life = 3.5-h.age
		if h.life <= 0: hazards.remove_at(i); continue
		if h.age >= 0.5 and h.age < 2.0 and not h.get("charging",false):
			h.charging = true
			game.play_cue("field_charge")
		if hazard_firing(h) and not h.get("fired",false):
			h.fired = true
			game.play_cue("field_laser")
			game.impact_shake = maxf(game.impact_shake,3.0)
		if hazard_firing(h) and hazard_area(h).has_point(game.player):
			game.hit_player(false,scaling().damage)
	if chapter() < 6 and not game.infinite_mode: return
	hazard_timer -= delta
	if hazard_timer > 0 or not hazards.is_empty() or game.enemy_shots.size() > 12: return
	if boss_phase and game.enemies.any(func(e): return e.kind == "boss" and (e.get("warning",false) or e.get("volley",0) > 0)): return
	hazard_timer = 12
	# These invulnerable strike aircraft are scenery hazards, never enemy targets.
	hazards.append({"vertical":game.wave%2 == 0,"line":game.rng.randf_range(0.25,0.75),"width":0.045,"age":0.0,"life":3.5})
func draw_hazards():
	for h in hazards:
		var age = hazard_age(h)
		if age < 0.5 or age >= 3.0: continue
		var area = hazard_area(h)
		var active = hazard_firing(h)
		var pulse = 0.5+0.5*sin(game.elapsed*18)
		var start = hazard_origin(h)
		var finish = Vector2(start.x,game.arena_size.y) if h.vertical else Vector2(game.arena_size.x,start.y)
		var width: float = area.size.x if h.vertical else area.size.y
		game.paint.draw_rect(area,Color(1,0.08,0.18,0.85 if active else 0.22+pulse*0.22))
		game.paint.draw_rect(area,Color("ffffff") if active else Color("ffba53"),false,4)
		if active:
			var fade = minf(1.0,(3.0-age)/0.18)
			game.paint.draw_line(start,finish,Color(1,0.38,0.05,0.8*fade),width*0.82*fade,false)
			game.paint.draw_line(start,finish,Color(1,0.94,0.5,fade),width*0.65*fade,false)
			game.paint.draw_line(start,finish,Color(1,1,1,fade),width*(0.32+pulse*0.08)*fade,false)
			var previous = start
			for i in range(1,25):
				var point = start.lerp(finish,i/24.0)
				var offset = sin(i*2.3+game.elapsed*32)*width*0.30*fade
				point += Vector2(offset,0) if h.vertical else Vector2(0,offset)
				game.paint.draw_line(previous,point,Color(1,0.96,0.82,fade),3,false)
				previous = point
		else:
			for i in range(18):
				var point = start.lerp(finish,i/18.0)
				var tangent = Vector2(0,12) if h.vertical else Vector2(12,0)
				game.paint.draw_line(point,point+tangent,Color(1,0.85,0.45,0.7+pulse*0.3),3,false)
		var warning_pos = start+(Vector2(0,30) if h.vertical else Vector2(30,0))
		game.paint.draw_circle(warning_pos,16,Color("32151b"))
		game.paint.draw_arc(warning_pos,16,0,TAU,24,Color("fff0b5"),2,false)
		game.paint.draw_rect(Rect2(warning_pos+Vector2(-2,-9),Vector2(4,11)),Color("fff0b5"))
		game.paint.draw_rect(Rect2(warning_pos+Vector2(-2,6),Vector2(4,4)),Color("fff0b5"))
func draw_hazard_aircraft():
	for h in hazards:
		var pos = hazard_position(h)
		var direction = Vector2.DOWN if h.vertical else Vector2.RIGHT
		var size: Vector2 = game.sprites["laser_strike"].get_size()*1.5
		var rotation = PI if h.vertical else PI/2
		game.paint.draw_set_transform(pos+Vector2(5,8),rotation)
		game.paint.draw_texture_rect(game.sprites["laser_strike"],Rect2(-size/2,size),false,Color(0,0.03,0.05,0.5))
		game.paint.draw_set_transform(pos,rotation)
		game.paint.draw_texture_rect(game.sprites["laser_strike"],Rect2(-size/2,size),false)
		game.paint.draw_set_transform(Vector2.ZERO)
		var age = hazard_age(h)
		var exhaust = pos-direction*size.y*0.4
		game.glow(exhaust,28,Color("ffac53"),1.4,1.38)
		game.paint.draw_line(exhaust,exhaust-direction*(50 if age < 0.5 or age >= 3 else 15),Color("fff0aa"),5,false)
		if age >= 0.5 and age < 3.0:
			var nose = hazard_origin(h)
			var charge = clampf((age-0.5)/1.5,0,1)
			game.glow(nose,25+charge*35,Color("ffbb63"),1.0+charge*2,1.38)
			game.paint.draw_circle(nose,4+charge*8,Color("ffffff"))
			if not hazard_firing(h):
				game.paint.draw_arc(nose,28-charge*10,game.elapsed*5,game.elapsed*5+PI*1.6,24,Color("ffeb8a"),3)
func draw_enemy(e: Dictionary):
	if e.kind == "boss" and not game.boss_can_take_damage(e):
		var dimensions: Vector2 = game.aircraft_dimensions("boss")
		var radius = maxf(dimensions.x,dimensions.y)*0.5+18
		var pulse = 0.5+0.5*sin(game.elapsed*7)
		game.glow(e.pos,radius*1.2,Color("53cfff"),0.35,1.38)
		game.paint.draw_circle(e.pos,radius,Color(0.15,0.62,1,0.12+pulse*0.05))
		game.paint.draw_arc(e.pos,radius,0,TAU,64,Color("8eeeff"),4,false)
		game.paint.draw_arc(e.pos,radius-7,0,TAU,64,Color(0.3,0.75,1,0.55),2,false)
		for i in range(4):
			var angle = game.elapsed*1.7+i*TAU/4
			game.paint.draw_arc(e.pos,radius+5,angle,angle+0.6,12,Color("e2ffff"),5,false)
		# The same visibility predicate controls both the shield and damage immunity.
	if e.get("shield",0) > 0:
		game.paint.draw_arc(e.pos,e.radius+9,0,TAU,32,Color("8acbff"),3)
	if e.get("elite",false):
		game.paint.draw_arc(e.pos,e.radius+4,0,TAU,24,Color("ffbe70"),2)
	if e.get("role","") in ["healer","shield_support","summoner","missile","armored","tank"]:
		var label = {"healer":"+","shield_support":"S","summoner":"M","missile":"!","armored":"A","tank":"T"}[e.role]
		game.text_at(label,e.pos+Vector2(-5,-5),14,Color("96ffd2") if e.role == "healer" else Color("ffdb92"))
	if e.has("sniper_aim"):
		game.paint.draw_line(e.pos,e.pos+e.sniper_aim*game.arena_size.y,Color(1,0.4,0.2,0.3),2)
	if e.get("role","") == "dash" and e.age > 1.3 and e.age < 2:
		game.paint.draw_line(e.pos,game.player,Color(1,0.8,0.2,0.35),2)
