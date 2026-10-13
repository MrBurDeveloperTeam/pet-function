extends Control
var football
var stick_id := -1
var held: Dictionary = {}
var stick_axis := Vector2.ZERO
var shoot_origin := Vector2.ZERO
var shoot_axis := Vector2.ZERO
var css_height := 0.0
var button_feedback: Dictionary = {}
var button_flash: Dictionary = {}
func refresh_metrics():
	if OS.has_feature("web"): css_height = float(JavaScriptBridge.eval("window.innerHeight"))
func _ready():
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 80
	self_modulate = Color(1,1,1,0.62)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	refresh_metrics()
	get_viewport().size_changed.connect(refresh_metrics)
func layout() -> Dictionary:
	var view := get_viewport_rect().size
	var logical_height := css_height if css_height>0 else view.y
	var pixel_ratio := view.y/logical_height
	var s := clampf(logical_height/440.0,1.0,1.2)*pixel_ratio*1.275
	return {"scale":s,"pixel_ratio":pixel_ratio,"stick":Vector2(82*s,view.y-82*s),"radius":56*s,"buttons":{
		"sprint":view-Vector2(48,44)*s,
		"shoot":view-Vector2(48,118)*s,"switch":view-Vector2(122,44)*s,"pass":view-Vector2(100,96)*s}}
func action_scale(action: String, scale_factor: float) -> float:
	return scale_factor if action == "sprint" else scale_factor*0.8
func available() -> bool:
	return football.started and football.game.state == "playing" and not get_tree().paused
func pass_mode() -> String:
	var owner: int = football.game.owner
	return "pass" if owner>=0 and football.game.cats[owner].team == football.game.cats[football.game.controlled].team else "steal"
func update_stick(pos: Vector2):
	var p := layout()
	var offset: Vector2 = (pos-p.stick).limit_length(p.radius)
	stick_axis = Vector2.ZERO if offset.length()<8*p.scale else offset/p.radius
	football.touch_move = stick_axis
func press_action(action: String, id: int):
	if held.values().has(action): return
	if action == "shoot" and football.game.owner != football.game.controlled: return
	held[id] = action
	button_flash[action] = 1.0
	match action:
		"shoot":
			shoot_axis = Vector2.ZERO
			football.touch_shot_aim = Vector2.RIGHT if football.game.cats[football.game.controlled].team == 0 else Vector2.LEFT
			football.touch_shoot = true
			football.begin_shot_or_tackle()
		"sprint": football.touch_sprint = true
		"switch":
			football.tutorial_touch_actions["switch"] = true
			football.try_switch_control()
		"pass":
			football.tutorial_touch_actions[pass_mode()] = true
			football.mobile_pass_or_steal()
func release_pointer(id: int):
	if id == stick_id:
		stick_id = -1
		stick_axis = Vector2.ZERO
		football.touch_move = Vector2.ZERO
	if not held.has(id): return
	var action: String = held[id]
	held.erase(id)
	if action == "shoot":
		football.release_shot()
		football.touch_shoot = false
		shoot_axis = Vector2.ZERO
	if action == "sprint": football.touch_sprint = false
func cancel_all():
	stick_id = -1
	held.clear()
	stick_axis = Vector2.ZERO
	shoot_axis = Vector2.ZERO
	football.touch_shot_aim = Vector2.RIGHT
	football.touch_move = Vector2.ZERO
	football.touch_shoot = false
	football.touch_sprint = false
	football.charging_cat = -1
	football.game.shot_charge = 0
func _input(event: InputEvent):
	if event is InputEventScreenTouch:
		if not event.pressed:
			if event.index == stick_id or held.has(event.index):
				if event.canceled: cancel_all()
				else: release_pointer(event.index)
				get_viewport().set_input_as_handled()
			return
		if not available(): return
		var p := layout()
		for action in p.buttons:
			if event.position.distance_to(p.buttons[action]) <= 34*action_scale(action,p.scale):
				if action == "shoot": shoot_origin = event.position
				press_action(action,event.index)
				get_viewport().set_input_as_handled()
				return
		if stick_id == -1 and event.position.distance_to(p.stick) <= p.radius*1.3:
			stick_id = event.index
			update_stick(event.position)
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and event.index == stick_id:
		if available(): update_stick(event.position)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and held.get(event.index,"") == "shoot":
		if available() and football.charging_cat>=0:
			var delta: Vector2 = event.position-shoot_origin
			if delta.length()>8*layout().scale:
				shoot_axis = delta.normalized()
				football.touch_shot_aim = football.mobile_shot_direction(delta)
				football.tutorial_aimed = true
		get_viewport().set_input_as_handled()
func _process(delta: float):
	for action in layout().buttons:
		button_feedback[action] = move_toward(float(button_feedback.get(action,0)),1.0 if held.values().has(action) else 0.0,delta*12)
		button_flash[action] = move_toward(float(button_flash.get(action,0)),0.0,delta*4)
	visible = available()
	if not visible and (stick_id != -1 or not held.is_empty()): cancel_all()
	queue_redraw()
func _draw():
	if not available(): return
	var p := layout()
	var s: float = p.scale
	var center: Vector2 = p.stick
	draw_circle(center,p.radius,Color(0.06,0.20,0.25,0.65))
	draw_arc(center,p.radius,0,TAU,48,Color("e8af45"),3)
	var knob: Vector2 = center+stick_axis*p.radius
	draw_circle(knob,22.4*s,Color("28617b"))
	draw_arc(knob,22.4*s,0,TAU,32,Color("fff1cb"),2)
	for action in p.buttons:
		draw_action_button(action,p.buttons[action],action_scale(action,s))
	if football.touch_shoot and football.charging_cat>=0 and shoot_axis!=Vector2.ZERO:
		var at: Vector2 = p.buttons.shoot
		draw_circle(at+shoot_axis*32*action_scale("shoot",s),5*s,Color("fff1cb"))

func draw_action_button(action: String, center: Vector2, scale_factor: float):
	var down := float(button_feedback.get(action,0))
	var flash := float(button_flash.get(action,0))
	var s := scale_factor*(1.0-down*0.055)
	var at := center+Vector2(0,down*2*scale_factor)
	var accent := Color("ffd270") if action=="shoot" else Color("8eddd7")
	draw_circle(center+Vector2(0,3*scale_factor),34*scale_factor,Color(0.015,0.03,0.04,0.45))
	# Layered bevels keep the stadium's warm brass and dark enamel palette.
	draw_circle(at,34*s,Color("172d35"))
	draw_arc(at,33*s,0,TAU,64,Color("96723d"),2*s,true)
	draw_arc(at,32*s,PI,TAU,32,Color("ffe2a0"),1.6*s,true)
	draw_arc(at,31*s,0,PI,32,Color("53432f"),2*s,true)
	draw_circle(at,29*s,Color(0.055,0.14+down*0.10,0.18+down*0.12,0.86))
	draw_arc(at,27*s,PI+0.2,TAU-0.2,32,Color(0.5,0.78,0.78,0.3),s,true)
	for angle in [-PI*0.75,-PI*0.25,PI*0.25,PI*0.75]:
		var rivet := at+Vector2.from_angle(angle)*31*s
		draw_circle(rivet,1.2*s,Color("fff0bd"))
	if flash>0:
		draw_arc(at,26*s,0,TAU,48,Color(accent,flash*0.65),2*s,true)
	var progress := float(football.game.shot_charge) if action=="shoot" and football.charging_cat>=0 else down if action=="sprint" else 0.0
	if progress>0:
		draw_arc(at,29*s,-PI/2,-PI/2+TAU*progress,64,accent,3*s,true)
	var icon := pass_mode() if action=="pass" else action
	draw_action_icon(icon,at+Vector2(0,-8*s),s,accent)
	var titles := {"shoot":"SHOOT","steal":"STEAL","sprint":"SPRINT","switch":"SWITCH","pass":"PASS"}
	var title: String = titles[icon]
	var font := ThemeDB.fallback_font
	var size := maxi(roundi(10*s),roundi(8*layout().pixel_ratio))
	draw_string(font,at+Vector2(-font.get_string_size(title,HORIZONTAL_ALIGNMENT_LEFT,-1,size).x/2,15*s),title,HORIZONTAL_ALIGNMENT_LEFT,-1,size,Color("fff1cb"))
	var mode := "DRAG" if icon == "shoot" else "HOLD" if icon == "sprint" else "TAP"
	var small := maxi(roundi(8*s),roundi(6*layout().pixel_ratio))
	draw_string(font,at+Vector2(-font.get_string_size(mode,HORIZONTAL_ALIGNMENT_LEFT,-1,small).x/2,24*s),mode,HORIZONTAL_ALIGNMENT_LEFT,-1,small,Color("93b9b7"))

func icon_line(at: Vector2, points: Array, s: float, color: Color, width: float = 2.0):
	var vertices := PackedVector2Array()
	for point in points: vertices.append(at+point*s)
	draw_polyline(vertices,color,width*s,true)

func draw_action_icon(action: String, at: Vector2, s: float, color: Color):
	match action:
		"sprint":
			var points := PackedVector2Array()
			for point in [Vector2(3,-12),Vector2(-9,2),Vector2(-1,2),Vector2(-4,13),Vector2(10,-3),Vector2(2,-3)]: points.append(at+point*s)
			draw_colored_polygon(points,color)
		"shoot","steal":
			draw_circle(at,10*s,color)
			draw_arc(at,10*s,0,TAU,32,Color("fff3ce"),s,true)
			var pentagon := PackedVector2Array()
			for i in range(5): pentagon.append(at+Vector2.from_angle(-PI/2+i*TAU/5)*4*s)
			draw_colored_polygon(pentagon,Color("163a46"))
			for i in range(5):
				var direction := Vector2.from_angle(-PI/2+i*TAU/5)
				draw_line(at+direction*4*s,at+direction*9*s,Color("163a46"),1.5*s,true)
			if action=="shoot": icon_line(at,[Vector2(-17,5),Vector2(-13,5)],s,color)
			else: icon_line(at,[Vector2(6,12),Vector2(13,5),Vector2(13,10)],s,Color("fff1cb"),2.5)
		"pass":
			icon_line(at,[Vector2(-12,5),Vector2(10,-5),Vector2(3,-8)],s,color,3)
			icon_line(at,[Vector2(10,-5),Vector2(7,2)],s,color,3)
			draw_circle(at+Vector2(-11,5)*s,3*s,color)
		"switch":
			icon_line(at,[Vector2(-10,-5),Vector2(11,-5),Vector2(6,-10)],s,color,2.5)
			icon_line(at,[Vector2(10,5),Vector2(-11,5),Vector2(-6,10)],s,color,2.5)
