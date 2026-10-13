extends SceneTree
func _initialize(): call_deferred("verify")
func verify():
	var cards = load("res://skill_cards.gd").new()
	for arena in [Vector2(320,568),Vector2(390,844),Vector2(440,956),Vector2(844,390)]:
		var first: Rect2 = cards.card_rect(arena,3,0,true)
		var previous: Rect2 = first
		for i in range(3):
			var card: Rect2 = cards.card_rect(arena,3,i,true)
			assert(is_equal_approx(card.position.y,first.position.y),"All mobile cards share one row")
			assert(Rect2(Vector2.ZERO,arena).encloses(card),"Mobile card stays inside the viewport")
			assert(card.size.x>=80 and card.size.y>100,"Small mobile cards remain tappable")
			if i>0: assert(card.position.x>previous.end.x,"Mobile cards never overlap")
			previous=card
	var portrait := Vector2(390,844)
	assert(cards.card_rect(portrait,3,2).position.y>cards.card_rect(portrait,3,0).position.y,"Desktop portrait layout remains unchanged")
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.mobile_skill_cards=true
	game.arena_size=portrait
	game.allow_skill_choices=true
	game.reset_run()
	game.progression.offer(true)
	game.progression.choice_age=1.0
	game.pointer_press(game.skill_card_rect(2).get_center())
	assert(game.state=="playing" and game.progression.skills.size()==1,"Third mobile card selects through the same rectangle used for rendering")
	game.free()
	print("MOBILE SKILL CARDS: PASS / one row, fit, nonoverlap, selection and desktop isolation")
	quit()
