extends SceneTree
var failures = 0
func check(ok: bool, label: String):
	if not ok:
		failures += 1
		push_error(label)
func _initialize():
	call_deferred("run")
func run():
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.reset_run()
	var bag = game.skill_inventory
	var choices = game.progression.choices.duplicate(true)
	game.pointer_press(bag.button_rect(game).get_center())
	check(bag.opened and game.state == "skill_choice","backpack opens during initial skill choice")
	check(bag.entries(game).is_empty(),"unselected offered cards are not owned skills")
	game._physics_process(2)
	check(game.progression.choices == choices and game.progression.skills.is_empty(),"viewing backpack preserves pending choices")
	game.pointer_press(bag.close_rect(game).get_center())
	check(not bag.opened and game.state == "skill_choice","close returns to same skill selection")
	game._physics_process(0.4)
	game.pointer_press(game.skill_card_rect(0).get_center())
	game.progression.skills.append("drone")
	game.pointer_press(bag.button_rect(game).get_center())
	var time = game.elapsed
	var position = game.player
	game._physics_process(10)
	check(game.elapsed == time and game.player == position,"backpack freezes battle and spawn timers")
	check(bag.entries(game).size() == 2 and bag.entries(game).any(func(e): return e[0] == "drone"),"backpack shows chosen cards including drone")
	var skills = game.progression.skills.duplicate()
	game.pointer_press(bag.cell_rect(game,0).get_center())
	check(bag.selected == 0 and game.progression.skills == skills,"inspection never applies another skill")
	game.pointer_press(bag.button_rect(game).get_center())
	check(not bag.opened and game.state == "playing","closing backpack resumes combat")
	game.progression.offer()
	choices = game.progression.choices.duplicate(true)
	game.pointer_press(bag.button_rect(game).get_center())
	game.pointer_press(bag.close_rect(game).get_center())
	check(game.state == "skill_choice" and game.progression.choices == choices,"reviewing owned skills does not reroll offered cards")
	game.progression.skills = game.progression.LIBRARY.map(func(e): return e[0])
	game.pointer_press(bag.button_rect(game).get_center())
	game.pointer_press(bag.page_rect(game,true).get_center())
	check(bag.page == 1,"additional selected skills are reachable by paging")
	game.reset_run()
	check(not bag.opened and bag.entries(game).is_empty() and bag.page == 0,"replay resets backpack with the new run")
	check(game.progression.energy_required() == 9,"energy starts at 1.5x")
	game.progression.skill_level = 1
	check(game.progression.energy_required() == 14,"fractional requirements round up")
	print("SKILL INVENTORY: %d failures" % failures)
	game.queue_free()
	quit(failures)
