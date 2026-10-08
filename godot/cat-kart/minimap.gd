extends Control
var race: Node3D
var paths: Array[PackedVector2Array]=[]
var cached_size=Vector2.ZERO
var background: StyleBoxFlat
var update_clock=0.0

func prepare_paths() -> void:
	paths.clear()
	cached_size=size
	background=style()
	for route in 2:
		var points=PackedVector2Array()
		for i in range(193):
			var q=float(i)/192
			if route==1 and not race.track.in_fork(q):continue
			points.append(map_point(race.track.point(q,route)))
		paths.append(points)

func _draw() -> void:
	if race==null:
		return
	if paths.is_empty() or cached_size!=size:prepare_paths()
	draw_style_box(background,Rect2(Vector2.ZERO,size))
	for route in 2:
		draw_polyline(paths[route],Color("efbd77") if route==0 else Color("73d4d0"),3,true)
	for i in race.racers.size():
		draw_circle(map_point(race.racers[i].node.position),4 if i==0 else 2.5,Color("fff1bd") if i==0 else Color("de8061"))

func map_point(p: Vector3) -> Vector2:
	var scale_factor=minf((size.x-24)/430.0,(size.y-24)/300.0)
	return Vector2(size.x/2+p.x*scale_factor,size.y/2+p.z*scale_factor)

func style() -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = Color(0.08,0.17,0.20,0.9)
	s.border_color = Color("d2ad71")
	s.set_border_width_all(2)
	s.set_corner_radius_all(10)
	return s

func _process(delta: float) -> void:
	update_clock+=delta
	if update_clock>=.05:
		update_clock=0
		queue_redraw()
