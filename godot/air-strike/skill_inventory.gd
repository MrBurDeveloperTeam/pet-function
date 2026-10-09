extends RefCounted
## A read-only view of this run's selected cards; opening it freezes combat.
var opened = false
var page = 0
var selected = -1

func reset():
	opened = false
	page = 0
	selected = -1

func entries(g) -> Array:
	return g.progression.LIBRARY.filter(func(entry): return g.progression.skills.has(entry[0]))

func button_rect(g) -> Rect2:
	return Rect2(g.arena_size.x-64,g.arena_size.y*0.5-26,48,52)

func panel_rect(g) -> Rect2:
	var size = Vector2(minf(760,g.arena_size.x-180),minf(440,g.arena_size.y-80))
	return Rect2((g.arena_size-size)*0.5,size)

func close_rect(g) -> Rect2:
	var panel = panel_rect(g)
	return Rect2(panel.end.x-46,panel.position.y+12,32,32)

func columns(g) -> int:
	return clampi(int((panel_rect(g).size.x-40)/112),2,6)

func capacity(g) -> int:
	return columns(g)*2

func cell_rect(g, index: int) -> Rect2:
	var panel = panel_rect(g)
	var count = columns(g)
	var width = (panel.size.x-40)/count
	return Rect2(panel.position+Vector2(20+(index%count)*width,66+int(index/count)*116),Vector2(width-8,108))

func page_rect(g, next: bool) -> Rect2:
	var panel = panel_rect(g)
	return Rect2(panel.end.x-(62 if next else 104),panel.end.y-34,32,24)

func toggle(g):
	opened = not opened
	g.dragging = false
	g.pointer_id = -1
	g.play_cue("pause" if opened else "resume")
	g.redraw_layers()

func pointer_press(g, pos: Vector2):
	var cards = entries(g)
	if close_rect(g).has_point(pos) or not panel_rect(g).has_point(pos):
		toggle(g)
		return
	var pages = maxi(1,ceili(float(cards.size())/capacity(g)))
	for next in [false,true]:
		if page_rect(g,next).has_point(pos):
			page = clampi(page+(1 if next else -1),0,pages-1)
			g.redraw_layers()
			return
	for i in range(mini(capacity(g),cards.size()-page*capacity(g))):
		if cell_rect(g,i).has_point(pos):
			selected = page*capacity(g)+i
			g.play_cue("skill_choose")
			g.redraw_layers()
			return

func draw_button(g):
	var rect = button_rect(g)
	g.metal_plate(rect,opened)
	var p = rect.position
	# Pixel backpack: shoulder handle, straps and a front pocket.
	g.paint.draw_rect(Rect2(p+Vector2(17,8),Vector2(14,7)),Color("fff0ad"),false,2)
	g.paint.draw_rect(Rect2(p+Vector2(10,16),Vector2(28,27)),Color("183a49"))
	g.paint.draw_rect(Rect2(p+Vector2(10,16),Vector2(28,27)),Color("8fdcd3"),false,2)
	g.paint.draw_rect(Rect2(p+Vector2(15,29),Vector2(18,10)),Color("fff0ad"),false,2)
	for x in [7,39]:
		g.paint.draw_rect(Rect2(p+Vector2(x,20),Vector2(3,18)),Color("d6b779"))

func draw(g):
	var cards = entries(g)
	var panel = panel_rect(g)
	var pages = maxi(1,ceili(float(cards.size())/capacity(g)))
	page = clampi(page,0,pages-1)
	g.paint.draw_rect(Rect2(Vector2.ZERO,g.arena_size),Color(0.01,0.04,0.08,0.88))
	g.metal_plate(panel,true)
	g.paint.draw_style_box(g.make_box(Color("102633"),Color("476b72"),2),panel.grow(-10))
	g.text_at("SKILL BACKPACK",panel.position+Vector2(24,38),22,Color("ffe0a1"))
	g.button(close_rect(g),"X")
	if cards.is_empty():
		g.skill_cards.label(g,"No skills selected yet",panel,panel.get_center().y,18,Color("b6d1d5"))
	for i in range(mini(capacity(g),cards.size()-page*capacity(g))):
		var index = page*capacity(g)+i
		var entry: Array = cards[index]
		var rect = cell_rect(g,i)
		var accent = Color("8fe8da") if entry[3] == 1 else (Color("f5c772") if entry[3] == 2 else Color("d6a0ff"))
		g.paint.draw_style_box(g.make_box(Color("203f4c") if index == selected else Color("152d39"),accent,2 if index == selected else 1),rect)
		var image = Rect2(rect.get_center().x-32,rect.position.y+6,64,64)
		g.skill_cards.draw_icon(g,entry[0],image)
		g.skill_cards.label(g,entry[1],rect,rect.end.y-21,12,Color("eef7ed"))
		g.skill_cards.label(g,"BASIC" if entry[3] == 1 else ("ADVANCED" if entry[3] == 2 else "ULTIMATE"),rect,rect.end.y-7,9,accent)
	var details = "Click a skill to view its effects"
	if selected >= 0 and selected < cards.size():
		var entry: Array = cards[selected]
		details = " / ".join(g.skill_cards.EFFECTS.get(entry[0],[entry[2]]))
	g.skill_cards.label(g,details,panel,panel.end.y-76,16,Color("ffe0a1"))
	g.text_at("%d SKILLS" % cards.size(),Vector2(panel.position.x+24,panel.end.y-17),11,Color("8fdcd3"))
	if pages > 1:
		g.button(page_rect(g,false),"<")
		g.button(page_rect(g,true),">")
		g.text_at("%d / %d" % [page+1,pages],Vector2(panel.end.x-158,panel.end.y-17),11)
	draw_button(g)
