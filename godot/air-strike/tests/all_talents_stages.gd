extends SceneTree
var failures:=0
func check(ok: bool,message: String):
 if not ok:
  failures+=1
  push_error(message)
func _initialize(): call_deferred("verify")
func verify():
 var g=load("res://main.tscn").instantiate()
 root.add_child(g)
 g.set_physics_process(false)
 g.allow_skill_choices=false
 var p=g.progression
 var all=[]
 for id in range(1,16): all.append(id)
 p.talents=all.duplicate()
 for mobile in [false,true]:
  g.mobile_skill_cards=mobile
  for stage in range(1,101):
   g.infinite_mode=false
   g.stage_level=stage
   g.reset_run()
   check(p.talents==all,"Purchased talents survive reset at stage %d" % stage)
   check(not p.revive_used and not p.unyielding_used and p.kills==0,"Per-stage abilities are restored")
   check(is_equal_approx(p.damage_scale(),1.1) and is_equal_approx(p.crit_scale(),2.4),"Damage talents apply every stage")
   check(is_equal_approx(g.player_shot_interval(),g.PLAYER_SHOT_INTERVAL/1.1),"Rapid fire applies every stage")
   g.fire_player()
   check(g.shots.size()==3 and g.shots[0].pierce==2,"Bullet and piercing tier II apply every stage")
   check(p.drone_count()==2,"Twin drones apply every stage")
   g.shots.clear()
   g.spawn_enemy("bomber",Vector2(100,100))
   p.update(5.1)
   check(g.shots.filter(func(b):return b.missile).size()==3,"Player and twin drone missiles trigger every stage")
   check(g.shots.filter(func(b):return b.source=="drone" and not b.missile).size()==2,"Drone cannons trigger every stage")
   g.hp=0.1
   g.invincible=0
   g.hit_player(false,100)
   check(g.state=="playing" and p.revive_used and not p.unyielding_used and g.revive_count==0,"Talent revival triggers before paid offers every stage")
   check(g.revival_visual_time==2.4 and g.revival_visual_label=="TALENT REVIVAL","Talent revival starts its visible energy sequence")
   g.invincible=0
   g.hit_player(false,100)
   check(g.state=="playing" and p.unyielding_used and g.hp==1,"Unyielding survives fatal damage every stage")
   check(g.unyielding_visual_time==2.0,"Unyielding starts its independent armour animation")
   g.enemies.clear()
   for n in range(30):
    g.spawn_enemy("fighter",Vector2(100,100))
    g.kill_enemy(g.enemies.size()-1)
   check(p.airstrike_pending,"Actual kill chain triggers ultimate every stage")
   g.spawn_enemy("fighter",Vector2(100,100))
   p.update(.01)
   check(not p.airstrike_pending and g.bomb_flash>0 and g.enemies.is_empty(),"Ultimate bombardment executes every stage")
   check(g.ultimate_visual_time==9.2,"Ultimate launches the extended missile storm sequence")
   g.update_visual_effects(0.2)
   check(is_equal_approx(g.ultimate_visual_time,9.0),"Ability animation advances independently of combat particles")
  g.infinite_mode=true
  g.reset_run()
  check(p.talents==all and not p.revive_used and not p.unyielding_used,"Endless run starts with all purchased talents and fresh saves")
  check(g.ultimate_visual_time==0 and g.revival_visual_time==0 and g.unyielding_visual_time==0,"New run clears ability animations")
 # Verify talent 3 through the real opening offer path.
 g.allow_skill_choices=true
 g.reset_run()
 check(g.state=="skill_choice" and p.opening_choices==2,"Starting skill talent grants two choices")
 p.choose(0)
 check(g.state=="skill_choice" and p.opening_choices==1,"Second starting choice is reachable")
 print("ALL TALENTS / 100 STAGES / DESKTOP+MOBILE: %d failures" % failures)
 g.free()
 quit(failures)
