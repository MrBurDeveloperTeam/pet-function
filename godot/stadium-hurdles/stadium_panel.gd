extends Control
## Sandstone, stadium pennants, lanterns and a miniature running-track trim.
var panel: PanelContainer
const BLUE = Color("224269")
const GOLD = Color("f5c45a")

func _ready() -> void:
	mouse_filter=Control.MOUSE_FILTER_IGNORE

func _process(_delta: float) -> void:
	visible=panel.visible
	if visible: queue_redraw()

func _draw() -> void:
	var r := Rect2(panel.position,panel.size)
	draw_rect(r.grow(9),BLUE,false,6)
	draw_rect(r.grow(4),GOLD,false,3)
	for side in [r.position.x-12,r.end.x+4]:
		for y in range(int(r.position.y),int(r.end.y),18):
			draw_rect(Rect2(side,y,8,16),Color("dbc49a"))
			draw_rect(Rect2(side,y+13,8,3),Color("aa8b65"))
	draw_rect(Rect2(r.position.x,r.position.y-11,r.size.x,3),BLUE)
	for i in range(int(r.size.x/26)):
		var x := r.position.x+i*26+2
		draw_colored_polygon(PackedVector2Array([Vector2(x,r.position.y-8),Vector2(x+22,r.position.y-8),Vector2(x+11,r.position.y+9)]),GOLD if i%2==0 else Color("238dcc"))
	draw_rect(Rect2(r.position.x-4,r.end.y+1,r.size.x+8,13),Color("c85a3d"))
	for y in [4,9]: draw_rect(Rect2(r.position.x-4,r.end.y+y,r.size.x+8,1),Color("ffedc3"))
	for x in [r.position.x-17,r.end.x+17]:
		lantern(Vector2(x,r.position.y+62))
		planter(Vector2(x,r.end.y-14))

func lantern(p: Vector2) -> void:
	draw_rect(Rect2(p+Vector2(-2,0),Vector2(4,35)),BLUE)
	draw_rect(Rect2(p+Vector2(-11,-27),Vector2(22,26)),BLUE)
	draw_rect(Rect2(p+Vector2(-7,-22),Vector2(14,17)),GOLD)
	draw_rect(Rect2(p+Vector2(-3,-20),Vector2(6,12)),Color("fff2ad"))
	draw_rect(Rect2(p+Vector2(-13,-30),Vector2(26,4)),BLUE)
	draw_rect(Rect2(p+Vector2(-7,-34),Vector2(14,4)),BLUE)

func planter(p: Vector2) -> void:
	draw_rect(Rect2(p+Vector2(-15,0),Vector2(30,23)),Color("71472f"))
	draw_rect(Rect2(p+Vector2(-12,3),Vector2(24,17)),Color("ba7f36"))
	for x in [-9,0,9]:
		draw_rect(Rect2(p+Vector2(x-6,-11),Vector2(12,14)),Color("43853c"))
		draw_rect(Rect2(p+Vector2(x-4,-12),Vector2(8,3)),Color("fff7d4"))
		draw_rect(Rect2(p+Vector2(x-2,-14),Vector2(3,8)),Color("fff7d4"))
		draw_rect(Rect2(p+Vector2(x-1,-11),Vector2(2,2)),GOLD)
