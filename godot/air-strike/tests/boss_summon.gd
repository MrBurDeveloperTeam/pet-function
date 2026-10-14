extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
 var g=load("res://main.tscn").instantiate()
 root.add_child(g)
 g.set_physics_process(false)
 g.allow_skill_choices=false
 for arena in [Vector2(960,540),Vector2(480,1040)]:
  g.resize_arena(arena)
  for endless in [false,true]:
   g.reset_run()
   g.infinite_mode=endless
   g.spawn_enemy("fighter",Vector2(100,100))
   var normal_hp: float=g.enemies.back().hp
   g.spawn_boss()
   var boss=g.enemies.back()
   boss.pos=Vector2(arena.x/2,160)
   g.campaign.summon(boss,["fighter"])
   var added=g.enemies.filter(func(e):return e.get("boss_summoned",false))
   assert(added.size()==10,"Boss summons ten planes")
   for e in added:
    assert(is_equal_approx(e.hp,normal_hp*1.7) and e.hp==e.max_hp,"Summons gain 70 percent health")
    assert(e.pos.distance_to(g.player)>=180,"Summons never spawn on the player")
   for e in added:
    assert(absf(e.pos.y-boss.pos.y)<=35 or e.pos.y<g.combat_rect.position.y,"Summons stay at boss height or enter from above the screen")
   assert(added[0].pos!=added[1].pos,"Summons have independent random positions")
 g.free()
 print("BOSS SUMMON: PASS desktop/portrait and campaign/endless")
 quit()
