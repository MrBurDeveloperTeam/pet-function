extends Control
## A standalone stadium records board, separate from the trophy results frame.
const FONT = preload("res://art/Quadrit.ttf")
const STADIUM = preload("res://art/stadium-runner.png")
const TEETH = preload("res://art/obstacles-teeth.png")
var game: Node2D
var page := 0
var age := 0.0

func _ready() -> void:
	position=Vector2(270,62)
	size=Vector2(740,590)
	pivot_offset=size*0.5
	add_button("X",Vector2(668,28),Vector2(42,38),game.close_rankings)
	add_button("<",Vector2(246,516),Vector2(48,36),func(): page=maxi(0,page-1))
	add_button(">",Vector2(446,516),Vector2(48,36),func(): page=mini(maxi(0,int(ceil(game.leaderboard.size()/5.0))-1),page+1))

func add_button(caption: String, at: Vector2, minimum: Vector2, action: Callable) -> void:
	var button := Button.new()
	button.text=caption
	button.position=at
	button.custom_minimum_size=minimum
	game.pixel_button(button)
	var skin: StyleBoxFlat=game.style(Color("f6c858"))
	skin.content_margin_left=8
	skin.content_margin_right=8
	skin.content_margin_top=6
	skin.content_margin_bottom=6
	button.add_theme_stylebox_override("normal",skin)
	button.focus_mode=Control.FOCUS_NONE
	button.pressed.connect(action)
	add_child(button)

func reveal() -> void:
	page=0
	age=0
	show()

func _process(delta: float) -> void:
	if not visible: return
	age=minf(1,age+delta*5)
	scale=Vector2.ONE*(0.94+0.06*(1-pow(1-age,3)))
	modulate.a=age
	queue_redraw()

func center(value: String, y: float, font_size: int, color: Color=Color("fff1c4")) -> void:
	draw_string(FONT,Vector2((size.x-FONT.get_string_size(value,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x)/2,y),value,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size,color)

func _draw() -> void:
	# Sandstone masonry, brass bevels and blue/gold seats form a noticeboard.
	draw_rect(Rect2(12,12,740,590),Color(0.02,0.07,0.12,0.7))
	draw_rect(Rect2(0,0,740,590),Color("785b3c"))
	draw_rect(Rect2(5,5,730,580),Color("ecd5a5"))
	draw_rect(Rect2(14,14,712,562),Color("c19b5e"))
	draw_rect(Rect2(20,20,700,550),Color("173b59"))
	for y in range(20,566,28):
		for x in [5,726]:
			draw_rect(Rect2(x,y,9,2),Color("97744b"))
	for x in range(35,706,45):
		var flag := PackedVector2Array([Vector2(x,24),Vector2(x+28,24),Vector2(x+14,43)])
		draw_colored_polygon(flag,Color("f6c858") if x%2 else Color("3e9cce"))
	center("STADIUM RECORDS",93,27,Color("f6c858"))
	center("CAT DASH",122,16,Color("a7d1df"))
	draw_rect(Rect2(54,144,632,2),Color("e5b354"))
	center(game.leaderboard_status,173,12,Color("a7d1df"))
	draw_string(FONT,Vector2(72,207),"RANK",HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color("f6c858"))
	draw_string(FONT,Vector2(162,207),"RUNNER",HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color("f6c858"))
	draw_texture_rect_region(TEETH,Rect2(585,181,24,28),game.world.object_regions[2])
	var pages := maxi(1,int(ceil(game.leaderboard.size()/5.0)))
	page=mini(page,pages-1)
	if game.leaderboard.is_empty(): center("Your next run could set the record!",324,17)
	for i in range(mini(5,game.leaderboard.size()-page*5)):
		var entry: Dictionary=game.leaderboard[page*5+i]
		var y := 222+i*52
		var own: bool=entry.get("isYou",false)
		draw_rect(Rect2(54,y,632,44),Color("315b72") if own else Color("21475e"))
		draw_rect(Rect2(54,y,4,44),Color("f6c858") if own else Color("56879b"))
		var rank := int(entry.get("rank",0))
		var medal := Color("f6c858") if rank==1 else Color("b7d2d8") if rank==2 else Color("d79961") if rank==3 else Color("5b8395")
		draw_circle(Vector2(102,y+22),16,medal)
		draw_string(FONT,Vector2(95,y+28),str(rank),HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("173b59"))
		draw_string(FONT,Vector2(162,y+28),str(entry.get("name","Runner")).substr(0,22),HORIZONTAL_ALIGNMENT_LEFT,-1,18,Color("fff1c4"))
		draw_string(FONT,Vector2(585,y+28),str(int(entry.get("teeth",0))),HORIZONTAL_ALIGNMENT_LEFT,-1,18,Color("f6c858"))
	center("%d / %d" % [page+1,pages],541,16)
	for x in range(30,706,32):
		draw_rect(Rect2(x,561,28,7),Color("268bd0"))
		draw_rect(Rect2(x,570,28,7),Color("f6c858"))
