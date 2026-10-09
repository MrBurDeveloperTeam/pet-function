extends SceneTree
var failures := 0
func check(value: bool, message: String) -> void:
	if not value:
		push_error(message)
		failures += 1
func _initialize() -> void:
	call_deferred("verify")
func verify() -> void:
	root.size=Vector2i(1280,720)
	var game=load("res://scripts/main.gd").new()
	root.add_child(game)
	game.set_process(false)
	for kind in ["mole","boss","kitten","bomb"]:
		for hole_index in range(game.HOLES.size()):
			game.target_hole=hole_index
			game.target_kind=kind
			game.target_variant="normal" if kind!="kitten" else "healthy"
			game.target_age=0.22
			var texture: Texture2D=game.get_target_texture(kind,game.target_variant)
			var image: Image=texture.get_image()
			var sample:=Vector2(-1,-1)
			for y in range(int(image.get_height()*0.4)):
				for x in range(int(image.get_width()*0.3),int(image.get_width()*0.7)):
					if image.get_pixel(x,y).a>0.5:
						sample=Vector2(x+0.5,y+0.5)
						break
				if sample.x>=0: break
			check(sample.x>=0,"Head artwork has visible pixels")
			var hole: Dictionary=game.HOLES[hole_index]
			var rect: Rect2=game.target_sprite_rect(Vector2(0,16*hole.s+sin(game.target_age*16)*3),hole.s,kind,game.target_variant,1)
			var point: Vector2=Vector2(hole.p)+(rect.position+sample/Vector2(image.get_size())*rect.size).rotated(hole.r)
			check(game.target_contains_point(point),"Head can be hit in every scaled and rotated hole")
			check(not game.target_contains_point(Vector2(hole.p)+Vector2(400,-400)),"Background is not part of the target")
	game.target_hole=4
	game.target_kind="mole"
	game.target_variant="normal"
	game.target_age=0.22
	game.target_hits_left=1
	game.tutorial_paused=false
	game.playing=true
	var hole: Dictionary=game.HOLES[4]
	var rect: Rect2=game.target_sprite_rect(Vector2(0,16*hole.s+sin(game.target_age*16)*3),hole.s,"mole","normal",1)
	var event:=InputEventMouseButton.new()
	event.button_index=MOUSE_BUTTON_LEFT
	event.pressed=true
	event.position=game.position+Vector2(hole.p)+(rect.position+rect.size*Vector2(0.5,0.3)).rotated(hole.r)
	var old_score: int=game.score
	game._unhandled_input(event)
	check(game.score>old_score,"Clicking the head goes through gameplay hit and scoring")
	game.queue_free()
	print("Mole target hit tests: failures=",failures)
	quit(1 if failures else 0)
