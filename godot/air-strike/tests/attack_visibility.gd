extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
 var g=load("res://main.tscn").instantiate()
 root.add_child(g)
 g.set_physics_process(false)
 g.allow_skill_choices=false
 g.reset_run()
 g.mobile_skill_cards=true
 g.enemies.clear()
 g.shots.clear()
 g.spawn_enemy("fighter",g.player+Vector2(0,-20))
 g.shots.append(g.progression.projectile(g.player,Vector2(0,-690),100))
 g.update_shots(0.033)
 assert(g.pending_shot_visuals.size()==1,"An instant hit retains a visible attack snapshot")
 g.update_shots(0.1)
 assert(g.pending_shot_visuals.size()==1,"Snapshot survives until it has actually rendered")
 g.pending_shot_visuals[0].rendered=true
 g.update_shots(0.1)
 assert(g.pending_shot_visuals.is_empty(),"Feedback expires after display and never re-enters collision logic")
 g.reset_run()
 assert(g.pending_shot_visuals.is_empty(),"Replay clears old visuals")
 g.free()
 print("MOBILE ATTACK VISIBILITY: PASS")
 quit()
