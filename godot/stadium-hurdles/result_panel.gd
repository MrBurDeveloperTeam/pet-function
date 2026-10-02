extends Control
## Live content inside the detailed stadium pixel frame, never baked-in text.
const FRAME = preload("res://art/stadium-results-frame.png")
const FONT = preload("res://art/Quadrit.ttf")
const ATLAS = preload("res://art/obstacles-teeth.png")
const GOLD = Color("f6c858")
const CREAM = Color("fff1c4")
var game: Node2D
var age := 0.0

func _ready() -> void:
	position=Vector2(190,20)
	size=Vector2(900,675)
	pivot_offset=size*0.5
	button("RUN AGAIN",Vector2(232,430),Vector2(210,48),GOLD,game.start_run)
	button("BACK TO SPORTS",Vector2(460,430),Vector2(210,48),Color("a3d2d6"),game.quit_run)

func button(caption: String, at: Vector2, minimum: Vector2, color: Color, action: Callable) -> Button:
	var control := Button.new()
	control.text=caption
	control.position=at
	control.custom_minimum_size=minimum
	var skin: StyleBoxFlat=game.style(Color("214970"))
	skin.border_color=color
	skin.content_margin_left=12
	skin.content_margin_right=12
	skin.content_margin_top=7
	skin.content_margin_bottom=7
	control.add_theme_stylebox_override("normal",skin)
	game.pixel_button(control)
	control.add_theme_font_size_override("font_size",15)
	control.add_theme_color_override("font_color",CREAM)
	control.add_theme_color_override("font_hover_color",CREAM)
	control.add_theme_stylebox_override("hover",game.style(Color("326589")))
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
	scale=Vector2.ONE*(0.94+0.06*easing)
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
	text_center("CAT DASH",244,28,GOLD)
	text_center("RUN COMPLETE",281,18,Color("b9dce0"))
	draw_texture_rect_region(ATLAS,Rect2(298,300,34,39),game.world.object_regions[2])
	text_center(str(game.teeth),330,26,CREAM,376)
	text_center("%d m" % int(game.distance),330,20,Color("b9dce0"),558)
	for x in [355,550]:
		draw_rect(Rect2(x-80,346,160,67),Color(0.04,0.12,0.22,0.48))
		draw_rect(Rect2(x-80,346,160,2),Color("407799"))
	draw_coin(Vector2(317,379))
	text_center("+%d" % int(game.teeth/10),391,25,GOLD,381)
	var star := PackedVector2Array()
	for i in range(10):
		var a := -PI/2+i*PI/5
		star.append(Vector2(514,379)+Vector2(cos(a),sin(a))*(20 if i%2==0 else 10))
	draw_colored_polygon(star,Color("b9dfbe"))
	text_center("XP",384,10,Color("19394c"),514)
	text_center("+%d" % (int(game.elapsed)/60*2),391,25,Color("b9dfbe"),582)
