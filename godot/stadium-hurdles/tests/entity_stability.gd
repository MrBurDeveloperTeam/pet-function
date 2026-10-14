extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
 var game=load("res://main.gd").new()
 root.add_child(game)
 game.set_process(false)
 for mobile in [false,true]:
  game.mobile_portrait=mobile
  game.start_run()
  for entity in game.entities: game.recycle_entity(entity.node)
  game.entities.clear()
  game.make_obstacle("open",0,-64)
  var original=game.entities[0]
  var node=original.node
  game.spawn_powerup("magnet",0,-64)
  assert(game.entities.has(original) and original.kind=="open" and original.node==node,"Pickup generation cannot replace an existing denture")
  assert(game.entities.back().kind=="magnet" and game.entities.back().lane!=0,"Pickup chooses a free lane")
  game.spawn_npc(0,-64)
  assert(game.entities.has(original) and node.visible,"NPC cannot erase an existing approaching hazard")
  for lane in [1,2]: game.make_obstacle("cone",lane,-40)
  game.make_obstacle("closed",0,-40)
  var count=game.entities.size()
  game.spawn_powerup("phase",0,-40)
  assert(game.entities.size()==count,"Occupied rows are preserved, not overwritten by a pickup")
 game.free()
 print("ENTITY STABILITY: PASS desktop/mobile")
 quit()
