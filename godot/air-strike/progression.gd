extends RefCounted
var game
var talents: Array = []
var skills: Array = []
var drone_timer = 0.0
var missile_timer = 5.0
var drone_missile_timer = 5.0
var shield_timer = 20.0
var shield_layers = 0
var saves_used = 0
var unyielding_used = false
var revive_used = false
var kills = 0
var airstrike_pending = false
var airstriking = false
var energy = 0
var skill_level = 0
var choices: Array = []
var choice_age = 0.0
const CHOICE_ANIMATION_DURATION = 0.2
var opening_choices = 0
var missile_side = -1
var ascensions = {"laser":0,"crit":0,"shield":0}
const LIBRARY = [
 ["bullet","Extra bullet","One extra starting bullet",1,"",[]],
 ["damage","Damage +25%","All player damage +25%",1,"",[]],
 ["crit_damage","Critical power","Critical damage +10%",1,"critical",[]],
 ["crit_chance","Critical chance","Critical chance +10%",1,"critical",[]],
 ["evade","Dodge","Bullet dodge chance +10%",1,"counter",[]],
 ["leech","Leech","40%: heal 15% of actual damage",1,"vampire",[]],
 ["shield","Energy shield","One shield every 20 seconds",1,"life",[]],
 ["defense","Defense","Incoming damage -8%",1,"",[]],
 ["life","Vitality","Maximum HP +15%",1,"life",[]],
 ["drone","Combat drone","One following drone, 50% aircraft base damage",1,"",[]],
 ["laser","Laser weapon","Piercing laser, damage +10%",2,"laser",[]],
 ["reflect","Ricochet","Bounce once to another enemy",2,"reflect",[]],
 ["double_damage","Double damage","Critical hit adds normal damage",2,"critical",["crit_damage"]],
 ["crit_bomb","Critical bombs","Critical hits bomb other enemies",2,"critical",["crit_chance"]],
 ["counter","Counterattack","Dodge launches 3 homing missiles",2,"counter",["evade"]],
 ["vampire","Vampire","40%: heal 25% of actual damage",2,"vampire",["leech"]],
 ["nuclear_shield","Nuclear shield","Three shield layers every 20s",2,"life",["shield"]],
 ["drone_boost","Drone upgrade","Twice as many drone bullets",2,"",["drone"]],
 ["life_evolve","Life evolution","HP +30%, survive fatal hit once",2,"life",["life"]],
 ["ring_laser","Ring laser","Radial laser, laser damage +20%",3,"laser",["laser"]],
 ["reflect2","Ricochet II","Three bounces, third target 50%",3,"reflect",["reflect"]],
 ["supercrit","Super critical","Crit +50%, damage +50%, HP -15%",3,"critical",["double_damage","crit_bomb"]],
 ["double_counter","Double counter","Dodge +20%, six 85% missiles",3,"counter",["counter","drone_boost"]],
 ["vamp_drone","Vampire drone","Drone damage +10%, drain enabled",3,"vampire",["drone_boost","vampire"]],
 ["dimension","Higher dimension","HP +60%, two saves, damage -20%",3,"life",["life","nuclear_shield"]],
]

func has(id: int) -> bool:
	return talents.has(id)
func skill(id: String) -> bool:
	return skills.has(id)
func reset():
	skills.clear()
	drone_timer = 0
	missile_timer = 5
	drone_missile_timer = 5
	shield_timer = 20
	shield_layers = 0
	saves_used = 0
	unyielding_used = false
	revive_used = false
	kills = 0
	airstrike_pending = false
	airstriking = false
	energy = 0
	skill_level = 0
	choices.clear()
	choice_age = 0.0
	opening_choices = 0
	missile_side = -1
	ascensions = {"laser":0,"crit":0,"shield":0}

func routes(ultimate_only: bool = false) -> Array:
	var result = []
	for entry in LIBRARY:
		if skill(entry[0]) and entry[4] != "" and (not ultimate_only or entry[3] == 3) and not result.has(entry[4]):
			result.append(entry[4])
	return result
func eligible(entry: Array) -> bool:
	if skill(entry[0]) or (entry[0] == "reflect2" and skill("ring_laser")):
		return false
	for required in entry[5]:
		if not skill(required):
			return false
	var active = routes()
	return game.infinite_mode or entry[4] == "" or active.has(entry[4]) or active.size() < 4
func tier_weights() -> Array:
	var level: int = game.stage_level
	if game.infinite_mode:
		level = mini(100,game.campaign.infinite_wave)
	if level <= 20:
		return [0.75,0.22,0.03]
	if level <= 40:
		return [0.65,0.28,0.07]
	if level <= 60:
		return [0.55,0.33,0.12]
	if level <= 80:
		return [0.50,0.34,0.16]
	return [0.45,0.35,0.20]
func roll_tier() -> int:
	var weights = tier_weights()
	if game.infinite_mode and game.campaign.super_offer:
		weights = [0.20,0.50,0.30]
	var roll = game.rng.randf()
	return 1 if roll < weights[0] else (2 if roll < weights[0]+weights[1] else 3)
func candidate_pool(tier: int) -> Array:
	var result = []
	for entry in LIBRARY:
		if entry[3] != tier or not eligible(entry) or choices.has(entry):
			continue
		if tier == 1 or entry[5].is_empty() or game.rng.randf() < (0.5 if tier == 2 else 0.25):
			result.append(entry)
	return result
func offer(initial: bool = false):
	if not game.allow_skill_choices or routes(true).size() >= 4:
		return
	if initial and opening_choices == 0:
		opening_choices = 2 if has(3) else 1
	choices.clear()
	if game.infinite_mode and routes(true).size() >= 6:
		choices = [["ascend_laser","Ring laser II","Laser damage +5%",0,"",[]],["ascend_crit","Super critical II","Critical damage +5%",0,"",[]],["ascend_shield","Shield II","Shield cooldown -5%",0,"",[]]]
	else:
		for slot in range(3):
			var tier = 1 if initial else roll_tier()
			var pool = candidate_pool(tier)
			while pool.is_empty() and tier > 1:
				tier -= 1
				pool = candidate_pool(tier)
			if pool.is_empty() and not initial:
				for fallback_tier in [2,3]:
					pool = candidate_pool(fallback_tier)
					if not pool.is_empty():
						break
			if not pool.is_empty():
				choices.append(pool[game.rng.randi_range(0,pool.size()-1)])
	if choices.is_empty():
		choices = [["repair","Field repair","Recover 15% maximum HP",0,"",[]]]
	game.campaign.super_offer = false
	if not choices.is_empty():
		choice_age = 0.0
		game.play_cue("skill_offer")
		game.state = "skill_choice"
		game.dragging = false
		game.pointer_id = -1
func choose(index: int):
	if index < 0 or index >= choices.size():
		return
	var old_max = max_health()
	var selected: String = choices[index][0]
	game.play_cue("skill_choose")
	if selected.begins_with("ascend_"):
		ascensions[selected.trim_prefix("ascend_")] += 1
	elif selected == "repair":
		game.hp = minf(max_health(),game.hp+max_health()*0.15)
	else:
		skills.append(selected)
	game.hp = clampf(game.hp+max_health()-old_max,0.1,max_health())
	if selected in ["shield","nuclear_shield"]:
		shield_layers = 3 if skill("nuclear_shield") else 1
	choices.clear()
	game.state = "playing"
	if opening_choices > 0:
		opening_choices -= 1
		if opening_choices > 0:
			offer(true)
			return
	if energy >= energy_required():
		collect_energy(0)
func energy_required() -> int:
	return ceili((6+skill_level*3)*1.5)
func collect_energy(amount: int):
	energy += amount
	if game.state == "skill_choice":
		return
	while energy >= energy_required():
		energy -= energy_required()
		skill_level += 1
		if routes(true).size() < 4:
			offer()
			if game.state == "skill_choice": break

func base_damage() -> float:
	return 1.0+(game.player_tier-1)*0.1
func damage_scale() -> float:
	return (1.1 if has(1) else 1.0)*(1.25 if skill("damage") else 1.0)*(1.5 if skill("supercrit") else 1.0)*(0.8 if skill("dimension") else 1.0)
func current_damage() -> float:
	return base_damage()*damage_scale()*(1.1 if skill("laser") else 1.0)*(1.2 if skill("ring_laser") else 1.0)*(1.0+ascensions.laser*0.05 if skill("laser") or skill("ring_laser") else 1.0)
func crit_chance() -> float:
	return 0.1+(0.1 if skill("crit_chance") else 0.0)+(0.5 if skill("supercrit") else 0.0)
func crit_scale() -> float:
	return 2.0*(1.2 if has(8) else 1.0)*(1.1 if skill("crit_damage") else 1.0)*(1.0+ascensions.crit*0.05)
func max_health() -> float:
	return 3.0*(1.15 if skill("life") else 1.0)*(1.3 if skill("life_evolve") else 1.0)*(1.6 if skill("dimension") else 1.0)*(0.85 if skill("supercrit") else 1.0)
func drone_count() -> int:
	return 2 if has(12) else (1 if has(10) or skill("drone") else 0)
func drone_damage() -> float:
	return base_damage()*0.5*(1.1 if skill("vamp_drone") else 1.0)*(0.8 if skill("dimension") else 1.0)
func drone_positions() -> Array:
	var result = []
	for i in range(drone_count()):
		var pos: Vector2 = game.player+Vector2(-78 if i == 0 else 78,24)
		result.append(pos if game.escaping else pos.clamp(Vector2(38,38),game.arena_size-Vector2(38,38)))
	return result
func projectile(pos: Vector2, velocity: Vector2, damage: float, source: String = "player", missile: bool = false) -> Dictionary:
	var crit = game.rng.randf() < crit_chance() if source == "player" else false
	var laser = source == "player" and (skill("laser") or skill("ring_laser")) and not missile
	return {"pos":game.laser_origin() if laser else pos,"vel":velocity,"damage":damage*(crit_scale() if crit else 1.0),"base_damage":damage,"crit":crit,"source":source,"missile":missile,"laser":laser,"life":0.26 if laser else 4.0,"charge":0.1 if laser else 0.0,"hits":[],"pierce":0 if missile else (999 if laser else (2 if has(7) else (1 if has(6) else 0))),"bounces":0 if missile else (3 if skill("reflect2") else (1 if skill("reflect") else 0)),"bounce_count":0}
func nearest(pos: Vector2, excluded: Array = []) -> Dictionary:
	var found: Dictionary = {}
	var distance = INF
	for enemy in game.enemies:
		if excluded.has(enemy) or enemy.hp <= 0 or not game.combat_rect.has_point(enemy.pos):
			continue
		var d: float = pos.distance_squared_to(enemy.pos)
		if d < distance:
			distance = d
			found = enemy
	return found
func missile(pos: Vector2, damage: float, source: String = "player"):
	var target = nearest(pos)
	if target.is_empty():
		return
	var side = missile_side
	missile_side *= -1
	if pos.x < 80: side = 1
	if pos.x > game.arena_size.x-80: side = -1
	var launch = pos+Vector2(side*(24 if source == "drone" else 36),5)
	var rocket = projectile(launch,Vector2(side*260,-160).normalized()*360,damage,source,true)
	rocket.launch_age = 0.0
	rocket.trail = [launch]
	game.shots.append(rocket)
	game.play_cue("missile")
	game.glow_launch(launch)
func update(delta: float):
	missile_timer -= delta
	if has(9) and missile_timer <= 0:
		missile(game.player,current_damage()*0.5)
		missile_timer = 5
	drone_missile_timer -= delta
	drone_timer -= delta
	for pos in drone_positions():
		if drone_timer <= 0:
			game.play_cue("drone")
			for i in range(2 if skill("drone_boost") else 1):
				game.shots.append(projectile(pos+Vector2(i*10-5,-28),Vector2(0,-580),drone_damage(),"drone"))
		if has(11) and drone_missile_timer <= 0:
			missile(pos,current_damage()*0.5,"drone")
	if drone_timer <= 0:
		drone_timer = 0.45
	if drone_missile_timer <= 0:
		drone_missile_timer = 5
	if skill("shield") or skill("nuclear_shield"):
		shield_timer -= delta
		if shield_timer <= 0:
			game.play_cue("shield")
			shield_layers = 3 if skill("nuclear_shield") else 1
			shield_timer = maxf(5,20*pow(0.95,ascensions.shield))
	if airstrike_pending:
		airstrike_pending = false
		airstriking = true
		game.add_effect(game.player,"bomb",0.9,game.arena_size.x*0.9)
		game.bomb_flash = 0.6
		game.play_cue("airstrike")
		for i in range(game.enemies.size()-1,-1,-1):
			if i >= game.enemies.size(): continue
			var e = game.enemies[i]
			if not game.boss_can_take_damage(e): continue
			e.hp -= current_damage()*5 if e.kind == "boss" else e.max_hp*(1.0 if e.kind == "fighter" and not e.get("elite",false) else 0.5)
			e.flash = 0.13
			if e.hp <= 0:
				game.kill_enemy(i)
		airstriking = false
func killed():
	if not airstriking:
		kills += 1
		if has(15) and kills%30 == 0:
			airstrike_pending = true
func on_hit(b: Dictionary, enemy: Dictionary, actual_damage: float):
	var extra = 0.0
	if b.get("crit",false) and skill("double_damage"):
		extra = game.campaign.damage_enemy(enemy,b.base_damage)
	if b.get("crit",false) and skill("crit_bomb"):
		for other in game.enemies:
			if other != enemy:
				game.campaign.damage_enemy(other,b.base_damage*0.5)
				game.add_effect(other.pos,"explosion",0.35,24)
	var drone: bool = b.get("source","player") == "drone"
	var probability = 0.2 if drone else (0.6 if skill("vamp_drone") else 0.4)
	if (drone and skill("vamp_drone")) or (not drone and (skill("leech") or skill("vampire"))):
		if game.rng.randf() < probability:
			var heal = 0.05 if drone else (0.25 if skill("vampire") else 0.15)
			game.hp = minf(max_health(),game.hp+(actual_damage+extra)*heal)
func prevent_hit(allow_evade: bool = true) -> bool:
	if shield_layers > 0:
		game.play_cue("shield")
		shield_layers -= 1
		game.add_effect(game.player,"shield_hit",0.35,55)
		return true
	var evade = ((0.1 if skill("evade") else 0.0)+(0.2 if skill("double_counter") else 0.0)) if allow_evade else 0.0
	if game.rng.randf() < evade:
		game.play_cue("dodge")
		game.add_effect(game.player,"impact",0.25,35)
		if skill("counter") or skill("double_counter"):
			for i in range(6 if skill("double_counter") else 3):
				missile(game.player+Vector2((i-2)*14,0),current_damage()*(0.85 if skill("double_counter") else 0.75))
		return true
	return false
func survive() -> bool:
	var saves = 2 if skill("dimension") else (1 if skill("life_evolve") else 0)
	if saves_used < saves:
		saves_used += 1
	elif has(13) and not unyielding_used:
		unyielding_used = true
	elif has(14) and not revive_used:
		revive_used = true
		game.hp = maxf(1,max_health()*0.3)
		game.invincible = 2
		game.play_cue("revive")
		return true
	else:
		return false
	game.hp = 1
	game.play_cue("revive")
	game.invincible = 2
	return true
