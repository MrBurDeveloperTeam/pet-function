extends Control
## Live content inside the detailed stadium pixel frame, never baked-in text.
const FRAME = preload("res://art/football-results-frame-v2.png")
const FONT = preload("res://art/Quadrit.ttf")

const GOLD = Color("f6c858")
const CREAM = Color("fff1c4")
var game: Node3D
var age := 0.0

func _ready() -> void:
	size=Vector2(900,675)
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	button("REMATCH",Vector2(232,394),Vector2(210,36),GOLD,game.start_match)
	button("BACK TO STADIUM",Vector2(460,394),Vector2(210,36),Color("a3d2d6"),func():game.bridge({"type":"FOOTBALL_CLOSE"}))
	fit_viewport()
	get_viewport().size_changed.connect(fit_viewport)

func fit_viewport() -> void:
	var available := get_viewport_rect().size
	var factor := minf(available.x/960.0,available.y/710.0)
	scale=Vector2.ONE*factor
	position=(available-size*factor)*0.5

func button(caption: String, at: Vector2, minimum: Vector2, color: Color, action: Callable) -> Button:
	var control := Button.new()
	control.text=caption
	control.position=at
	control.custom_minimum_size=minimum
	var skin: StyleBoxFlat=game.style_box(Color("214970"))
	skin.border_color=color
	skin.content_margin_left=12
	skin.content_margin_right=12
	skin.content_margin_top=7
	skin.content_margin_bottom=7
	control.add_theme_stylebox_override("normal",skin)
	control.add_theme_font_override("font",FONT)
	control.add_theme_font_size_override("font_size",15)
	control.add_theme_color_override("font_color",CREAM)
	control.add_theme_color_override("font_hover_color",CREAM)
	control.add_theme_stylebox_override("hover",game.style_box(Color("326589")))
	control.focus_mode=Control.FOCUS_NONE
	control.pressed.connect(action)
	add_child(control)
	return control

func reveal() -> void:
	age=0
	show()

func _process(delta: float) -> void:
	if not visible: return
	age=minf(1,age+delta*5)
	var easing := 1-pow(1-age,3)
	fit_viewport()
	modulate.a=easing
	queue_redraw()

func text_center(value: String, y: float, font_size: int, color: Color=CREAM, center_x: float=450) -> void:
	var width := FONT.get_string_size(value,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x
	draw_string(FONT,Vector2(center_x-width*0.5,y),value,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size,color)

func coin_outline(center: Vector2, radius: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	# Stepped silhouette gives a round coin without smooth vector edges.
	for offset in [Vector2(-0.4,-1),Vector2(0.4,-1),Vector2(0.4,-0.85),Vector2(0.7,-0.85),Vector2(0.7,-0.6),Vector2(0.9,-0.6),Vector2(0.9,-0.3),Vector2(1,-0.3),Vector2(1,0.3),Vector2(0.9,0.3),Vector2(0.9,0.6),Vector2(0.7,0.6),Vector2(0.7,0.85),Vector2(0.4,0.85),Vector2(0.4,1),Vector2(-0.4,1),Vector2(-0.4,0.85),Vector2(-0.7,0.85),Vector2(-0.7,0.6),Vector2(-0.9,0.6),Vector2(-0.9,0.3),Vector2(-1,0.3),Vector2(-1,-0.3),Vector2(-0.9,-0.3),Vector2(-0.9,-0.6),Vector2(-0.7,-0.6),Vector2(-0.7,-0.85),Vector2(-0.4,-0.85)]:
		points.append(center+(offset*radius).round())
	return points

func draw_coin(center: Vector2) -> void:
	draw_colored_polygon(coin_outline(center+Vector2(4,3),22),Color("6c3b20"))
	draw_colored_polygon(coin_outline(center+Vector2(3,1),21),Color("bd792a"))
	draw_colored_polygon(coin_outline(center,22),Color("77411d"))
	draw_colored_polygon(coin_outline(center,20),Color("fff1af"))
	draw_colored_polygon(coin_outline(center+Vector2(0,2),18),Color("d48b28"))
	draw_colored_polygon(coin_outline(center,16),Color("8d501d"))
	draw_colored_polygon(coin_outline(center+Vector2(0,1),14),Color("ffce53"))
	draw_rect(Rect2(center+Vector2(-8,-17),Vector2(15,2)),Color("fff7cc"))
	draw_rect(Rect2(center+Vector2(-18,-8),Vector2(2,13)),Color("fff7cc"))
	# Embossed paw, with a one-pixel shadow and four toe pads.
	for offset in [Vector2(-7,-7),Vector2(-2,-10),Vector2(3,-10),Vector2(8,-7)]:
		draw_rect(Rect2(center+offset+Vector2(0,1),Vector2(3,4)),Color("ad6420"))
		draw_rect(Rect2(center+offset,Vector2(3,3)),Color("fff0a0"))
	draw_rect(Rect2(center+Vector2(-4,-1),Vector2(11,7)),Color("ad6420"))
	draw_rect(Rect2(center+Vector2(-5,-2),Vector2(10,6)),Color("ffe993"))
	draw_rect(Rect2(center+Vector2(-2,-4),Vector2(4,2)),Color("ffe993"))

func _draw() -> void:
	draw_texture_rect(FRAME,Rect2(Vector2.ZERO,size),false)
	draw_set_transform(Vector2(0,-30))
	text_center("PAW LEAGUE",236,27,GOLD)
	var outcome := "VICTORY" if game.game.score[0]>game.game.score[1] else ("DRAW" if game.game.score[0]==game.game.score[1] else "FULL TIME / DEFEAT")
	text_center(outcome,265,17,Color("b9dce0"))
	# Football medallions flank the championship title.
	for x in [285,582]: draw_texture_rect(game.ball_textures[0],Rect2(x,217,32,32),false)
	for team in range(2):
		var x := 276.0 if team==0 else 558.0
		draw_texture_rect_region(game.TEAM_SHEETS[team],Rect2(x,270,66,62),Rect2(0,208 if team==0 else 416,192,208))
		text_center("MALLOW" if team==0 else "SILVERBELT",345,11,CREAM,x+33)
	text_center("%d : %d" % [game.game.score[0],game.game.score[1]],316,36)
	text_center("%d PASSES   %d SHOTS   %d TACKLES" % [game.game.passes,game.game.shots,game.game.tackles],365,12,Color("b9dce0"))
	var coins := 50+(30 if game.game.score[0]>game.game.score[1] else 10 if game.game.score[0]==game.game.score[1] else 0)+mini(game.game.score[0],10)*5
	for x in [355,550]: draw_rect(Rect2(x-80,376,160,42),Color(0.04,0.12,0.22,0.48))
	draw_coin(Vector2(310,397))
	text_center("+%d" % coins,405,23,GOLD,380)
	var star := PackedVector2Array()
	for i in range(10):
		var a := -PI/2+i*PI/5
		star.append(Vector2(505,397)+Vector2(cos(a),sin(a))*(19 if i%2==0 else 10))
	draw_colored_polygon(star,Color("b9dfbe"))
	text_center("XP",401,9,Color("19394c"),505)
	text_center("+%d" % (40 if game.game.score[0]>game.game.score[1] else 25),405,23,Color("b9dfbe"),574)
