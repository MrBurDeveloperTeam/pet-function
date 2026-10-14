extends SceneTree
var failures := 0
var g
var p
func check(ok: bool, message: String):
 if not ok:
  failures+=1
  push_error(message)
func fresh():
 g.reset_run()
 p.talents=[]
 p.skills=[]
 g.infinite_mode=false
 g.player_tier=1
func _initialize(): call_deferred("run")
func run():
 g=load("res://main.tscn").instantiate()
 root.add_child(g)
 g.set_physics_process(false)
 g.allow_skill_choices=false
 p=g.progression
 for mobile in [false,true]:
  g.mobile_skill_cards=mobile
  fresh()
  g.allow_skill_choices=true
  p.talents=[3]
  p.offer(true)
  p.choose(0)
  check(g.state=="skill_choice" and p.opening_choices==1,"starting talent grants a second choice")
  p.choose(0)
  check(g.state=="playing","second opening choice resumes combat")
  g.allow_skill_choices=false
  fresh()
  for id in ["damage","crit_damage","crit_chance","life","supercrit","dimension","laser","ring_laser"]:
   p.skills=[]
   var before=[p.current_damage(),p.crit_scale(),p.crit_chance(),p.max_health()]
   p.skills=[id]
   check(before!=[p.current_damage(),p.crit_scale(),p.crit_chance(),p.max_health()],id+" changes combat stats")
  for ids in [["laser","bullet"],["ring_laser","bullet"]]:
   p.skills=ids
   g.shots.clear()
   g.fire_player()
   check(g.shots.size()==(13 if ids[0]=="ring_laser" else 2),"extra bullet affects both laser types")
   g.update_shots(0.01)
   check(g.shots[0].pos!=g.shots[1].pos or g.shots[0].vel!=g.shots[1].vel,"laser lanes remain distinct after update")
  fresh()
  p.talents=[10]
  check(not p.eligible(p.LIBRARY.filter(func(s):return s[0]=="drone")[0]),"owned drone is not offered as a useless duplicate")
  check(p.eligible(p.LIBRARY.filter(func(s):return s[0]=="drone_boost")[0]),"talent drone unlocks drone upgrade")
  for skill_id in ["shield","nuclear_shield"]:
   fresh()
   p.choices=p.LIBRARY.filter(func(s):return s[0]==skill_id)
   p.choose(0)
   check(p.shield_layers==(3 if skill_id=="nuclear_shield" else 1),"shield immediately grants layers")
   p.shield_layers=0
   p.update(21)
   check(p.shield_layers>0,"shield recharges")
  for skill_id in ["life_evolve","dimension"]:
   fresh()
   p.skills=[skill_id]
   var saves=2 if skill_id=="dimension" else 1
   for n in range(saves): check(p.survive(),"life skill provides fatal save")
   check(not p.survive(),"life saves are bounded")
  for skill_id in ["leech","vampire","vamp_drone"]:
   fresh()
   p.skills=[skill_id]
   g.hp=0.5
   g.spawn_enemy("bomber",Vector2(200,200))
   var b={"crit":false,"source":"drone" if skill_id=="vamp_drone" else "player"}
   for n in range(100): p.on_hit(b,g.enemies[0],0.1)
   check(g.hp>0.5,"life drain actually restores health")
  for skill_id in ["counter","double_counter"]:
   fresh()
   p.skills=["evade",skill_id]
   g.spawn_enemy("bomber",Vector2(200,200))
   for n in range(100):
    if p.prevent_hit(): break
   check(g.shots.size()==(6 if skill_id=="double_counter" else 3),"dodge launches counter missiles")
  fresh()
  p.skills=["double_damage","crit_bomb"]
  g.spawn_enemy("bomber",Vector2(200,200))
  g.spawn_enemy("bomber",Vector2(220,200))
  var hp=g.enemies[0].hp
  p.on_hit({"crit":true,"source":"player","base_damage":1.0},g.enemies[0],1.0)
  check(g.enemies[0].hp<hp and g.enemies[1].hp<hp,"critical bonuses hit direct and nearby targets")
  for id in ["reflect","reflect2"]:
   p.skills=["ring_laser",id]
   var b=p.projectile(Vector2.ZERO,Vector2.UP,1)
   check(b.bounces==(3 if id=="reflect2" else 1),"ring laser retains bounce payload")
  fresh()
  g.infinite_mode=true
  g.allow_skill_choices=true
  p.skills=["ring_laser","reflect2","supercrit","double_counter","vamp_drone","dimension"]
  p.offer()
  check(p.choices.size()==3 and p.choices[0][0]=="ascend_laser","endless ascensions are reachable")
  p.choose(0)
  check(p.ascensions.laser==1,"ascension updates damage level")
  g.allow_skill_choices=false
 print("SKILL AUDIT desktop/mobile: %d failures" % failures)
 g.free()
 quit(failures)
