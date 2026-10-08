extends RefCounted
var game: Node3D
var atlas: Texture2D
var materials: Dictionary = {}

func clear_of_roads(pos: Vector3, radius: float) -> bool:
	# Test the entire building footprint against both branches, not just its own road.
	for route in 2:
		for i in game.SEGMENTS:
			var q=float(i)/game.SEGMENTS
			if route==1 and not game.track.in_fork(q):continue
			var c: Vector3=game.track.point(q,route)
			if Vector2(c.x-pos.x,c.z-pos.z).length()<game.track.width(q,route)+radius+1.5:return false
	return true

func junction_open(pos: Vector3, route: int) -> bool:
	# Remove inward barriers wherever the other branch joins this carriageway.
	for i in game.SEGMENTS:
		var q=float(i)/game.SEGMENTS
		if not game.track.in_fork(q):continue
		var c: Vector3=game.track.point(q,1-route)
		if Vector2(c.x-pos.x,c.z-pos.z).length()<game.track.width(q,1-route)+2.5:return true
	return false

func _init(owner: Node3D, texture: Texture2D) -> void:
	game = owner
	atlas = texture

func tile(index: int) -> StandardMaterial3D:
	if materials.has(index):
		return materials[index]
	var palette = [Color("d9c5a5"),Color("b86652"),Color("80b7b0"),Color("bdbab0"),Color("586878"),Color("976a50"),Color("739a71"),Color("dbaa97")]
	var m = game.material(palette[index])
	materials[index] = m
	return m
func block(parent: Node3D, pos: Vector3, size: Vector3, index: int, color := Color.WHITE) -> MeshInstance3D:
	var node = game.cube(parent, pos, size, color)
	var mat = tile(index).duplicate()
	mat.albedo_color *= color
	node.material_override = mat
	if index in [0,2,7]:
		var wall=ShaderMaterial.new()
		wall.shader=load("res://plaster.gdshader")
		wall.set_shader_parameter("plaster",mat.albedo_color)
		node.material_override=wall
	return node

func road(route: int) -> void:
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sides = SurfaceTool.new()
	sides.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in game.SEGMENTS:
		var q0 = float(i) / game.SEGMENTS
		var q1 = float(i + 1) / game.SEGMENTS
		if route == 1 and not game.track.in_fork((q0 + q1) / 2):
			continue
		var t0: Vector3 = game.track.direction(q0, route).cross(Vector3.UP).normalized()
		var t1: Vector3 = game.track.direction(q1, route).cross(Vector3.UP).normalized()
		var w0: float = game.track.width(q0, route)
		var w1: float = game.track.width(q1, route)
		var c0: Vector3 = game.track.point(q0, route) + Vector3.UP * 0.18
		var c1: Vector3 = game.track.point(q1, route) + Vector3.UP * 0.18
		var vertices = [c0-t0*w0,c0+t0*w0,c1-t1*w1,c0+t0*w0,c1+t1*w1,c1-t1*w1]
		var uv = [Vector2(0,0),Vector2(1,0),Vector2(0,1),Vector2(1,0),Vector2(1,1),Vector2(0,1)]
		for v in 6:
			st.set_normal(Vector3.UP)
			st.set_uv(uv[v])
			st.add_vertex(vertices[v])
		# Paint arrows into both directed branches, especially around split/merge mouths.
		if i%(6 if game.track.in_fork(q0) else 16)==0:
			for lane in [-3.0,3.0]:road_arrow(q0,route,lane)
		for edge in [-1, 1]:
			var a: Vector3 = c0+t0*w0*edge
			var b: Vector3 = c1+t1*w1*edge
			var lower_a = Vector3(a.x,-2,a.z)
			var lower_b = Vector3(b.x,-2,b.z)
			for vertex in [a,lower_a,b,b,lower_a,lower_b]:
				sides.add_vertex(vertex)
			var kerb = game.cube(game, c0 + t0 * w0 * edge, Vector3(0.6, 0.4, c0.distance_to(c1) + 0.3), Color("fff1ca") if i % 4 < 2 else Color("d66851"))
			kerb.rotation.y = atan2(-game.track.direction(q0, route).x, -game.track.direction(q0, route).z)
			var barrier_pos=c0+t0*(w0+1.9)*edge
			if not game.track.in_fork(q0) or not junction_open(barrier_pos,route):
				game.solid_box(game,barrier_pos+Vector3.UP*3.5,Vector3(.4,8,c0.distance_to(c1)+.45),kerb.rotation.y)
				var rail=game.cube(game,barrier_pos+Vector3.UP*.65,Vector3(.18,.45,c0.distance_to(c1)+.45),Color("687a7d"))
				rail.rotation.y=kerb.rotation.y
	var surface = MeshInstance3D.new()
	surface.mesh = st.commit()
	var road_material = ShaderMaterial.new()
	road_material.shader = load("res://pavers.gdshader")
	surface.material_override = road_material
	game.add_child(surface)
	sides.generate_normals()
	var foundation = MeshInstance3D.new()
	foundation.mesh = sides.commit()
	foundation.material_override = game.material(Color("667b68"))
	foundation.material_override.cull_mode = BaseMaterial3D.CULL_DISABLED
	game.add_child(foundation)
	if route==1:
		one_way_sign(game.track.FORK_START+.012,route)
		one_way_sign(game.track.FORK_END-.012,route)

func road_arrow(q: float, route: int, lane: float) -> void:
	var forward:Vector3=game.track.direction(q,route)
	var across=forward.cross(Vector3.UP).normalized()
	var origin:Vector3=game.track.point(q,route)+across*lane+Vector3.UP*.215
	var outline=PackedVector2Array([Vector2(0,1.8),Vector2(-1.2,.15),Vector2(-.4,.15),Vector2(-.4,-1.3),Vector2(.4,-1.3),Vector2(.4,.15),Vector2(1.2,.15)])
	var indices=Geometry2D.triangulate_polygon(outline)
	var surface=SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in indices:
		surface.set_normal(Vector3.UP)
		surface.add_vertex(across*outline[index].x+forward*outline[index].y)
	var paint=MeshInstance3D.new()
	paint.mesh=surface.commit()
	paint.position=origin
	paint.material_override=game.material(Color("e8dcb5"))
	paint.material_override.cull_mode=BaseMaterial3D.CULL_DISABLED
	game.add_child(paint)

func one_way_sign(q: float, route: int) -> void:
	var forward:Vector3=game.track.direction(q,route)
	var n=Node3D.new()
	game.add_child(n)
	n.position=game.track.point(q,route)+forward.cross(Vector3.UP).normalized()*(game.track.width(q,route)+2.5)
	n.rotation.y=atan2(-forward.x,-forward.z)
	game.cube(n,Vector3(0,1.4,0),Vector3(.12,2.8,.12),Color("59666b"))
	game.cube(n,Vector3(0,2.8,0),Vector3(3.4,1.2,.16),Color("244f5a"))
	var sign=Label3D.new()
	sign.text="ONE WAY"
	sign.font=load("res://art/Quadrit.ttf")
	sign.font_size=30
	sign.pixel_size=.018
	sign.position=Vector3(0,2.8,.095)
	n.add_child(sign)
	var back=Label3D.new()
	back.text="NO ENTRY"
	back.font=sign.font
	back.font_size=30
	back.pixel_size=.018
	back.modulate=Color("ffbe90")
	back.position=Vector3(0,2.8,-.095)
	back.rotation.y=PI
	n.add_child(back)

func building(pos: Vector3, angle: float, number: int) -> void:
	if not clear_of_roads(pos,6.3):return
	var n = Node3D.new()
	game.add_child(n)
	n.position = pos
	n.rotation.y = angle
	var height = 6.5 + (number % 3) * 1.25
	game.solid_box(n,Vector3(0,height/2,0),Vector3(8.5,height,7.8))
	block(n, Vector3(0,height/2,0), Vector3(8,height,7), 2 if number % 3 == 0 else (7 if number % 3 == 1 else 0))
	block(n, Vector3(0,0.45,0),Vector3(8.5,0.9,7.5),0)
	block(n, Vector3(0,height+0.35,0),Vector3(9,0.5,8),0)
	var roof = PrismMesh.new()
	roof.size = Vector3(9,3,8)
	var roof_node = game.mesh(n,roof,Color.WHITE,Vector3(0,height+1.9,0))
	roof_node.material_override = tile(1)
	# Individual raised courses and ridge caps give the roof a geometric silhouette.
	for edge in [-1,1]:
		for course in 5:
			var x = edge*(0.5+course*0.85)
			var trim = game.cube(n,Vector3(x,height+3.47-absf(x)*0.6667,0),Vector3(0.17,0.12,8.15),Color("d38a67") if course%2==0 else Color("a9564c"))
			trim.rotation.z = -edge*0.588
	for cap in 7:
		game.cube(n,Vector3(0,height+3.5,-3.5+cap*1.15),Vector3(0.4,0.2,1.08),Color("cf8662"))
	block(n, Vector3(2,height+2.5,0),Vector3(1,3,1),0)
	for floor in 2:
		for x in [-2.4,0,2.4]:
			var y = 2.5 + floor * 3.1
			block(n,Vector3(x,y,3.6),Vector3(1.9,2.5,0.3),0)
			game.cube(n,Vector3(x,y,3.79),Vector3(1.4,1.9,0.1),[Color("3c4244"),Color("675e50"),Color("465755"),Color("746b58")][(number+floor+int(x))%4])
			game.cube(n,Vector3(x,y,3.87),Vector3(0.12,1.9,0.12),Color("eedfbc"))
			game.cube(n,Vector3(x,y,3.88),Vector3(1.4,0.12,0.12),Color("eedfbc"))
			for sx in [-1,1]:
				block(n,Vector3(x+sx*1.05,y,3.78),Vector3(0.4,2.1,0.15),5,Color("679c91"))
			if floor == 1:
				game.cube(n,Vector3(x,y-1.2,4),Vector3(2.2,0.15,0.9),Color("ead0a2"))
				for bar in 6:
					game.cube(n,Vector3(x-1+bar*0.4,y-0.8,4.4),Vector3(0.06,0.8,0.06),Color("3d4b50"))
	block(n,Vector3(0,1.5,3.9),Vector3(1.4,3,0.12),5)
	game.cube(n,Vector3(0.45,1.3,4.02),Vector3(0.08,0.24,0.05),Color("cba663"))
	for edge in [-1,1]:
		for slat in 7:
			game.cube(n,Vector3(edge*3.46,1.5+slat*0.23,3.92),Vector3(0.38,0.045,0.09),Color("425d5e"))
		game.cube(n,Vector3(edge*3.75,height/2,-3.6),Vector3(0.13,height,0.13),Color("657170"))
	for step in 2:
		game.cube(n,Vector3(0,0.12+step*0.12,4.1-step*0.2),Vector3(1.8,0.15,0.5),Color("b1aa98"))
	for brick in 18:
		game.cube(n,Vector3(-3.7+(brick%9)*0.9,0.2+(brick/9)*0.27,3.79),Vector3(0.82,0.22,0.04),Color("ad9a83"))
	var ac=game.cube(n,Vector3(2.7,4.1,3.99),Vector3(1.1,0.55,0.42),Color("a3aea9"))
	for slot in 5:
		game.cube(n,Vector3(2.3+slot*0.18,4.1,4.22),Vector3(0.055,0.37,0.03),Color("536066"))
	for stripe in 8:
		var awning = game.cube(n,Vector3(-3.5+stripe,3.9,4.5),Vector3(1,0.18,2),Color("fff4d1") if stripe%2==0 else Color("d87559"))
		awning.rotation.x = -0.2
	var sign = Label3D.new()
	sign.text = ["FISH & CHIPS","PAW MARKET","CAT CAFE","TOWN GARAGE"][number%4]
	sign.font = load("res://art/Quadrit.ttf")
	sign.font_size = 28
	sign.pixel_size = 0.014
	sign.position = Vector3(0,4.8,3.98)
	sign.modulate = Color("fff1bc")
	game.cube(n,Vector3(0,4.8,3.82),Vector3(5.4,0.8,0.2),Color("314954"))
	n.add_child(sign)
	for edge in [-1,1]:
		game.cube(n,Vector3(edge*3.92,height/2,3.6),Vector3(0.32,height,0.25),Color("e7d4b3"))
	for level in [0.8,3.95]:
		game.cube(n,Vector3(0,level,3.6),Vector3(8.2,0.16,0.28),Color("e7d4b3"))
	for x in [-3.6,3.6]:
		block(n,Vector3(x,0.45,4.5),Vector3(0.8,0.8,0.8),5)
		game.ball(n,Vector3(x,1.1,4.5),Vector3(0.9,0.9,0.9),Color("4c8754"))
		for i in 3:
			game.ball(n,Vector3(x+(i-1)*0.22,1.4,4.5),Vector3(0.25,0.25,0.25),Color("e6a9bd"))

func lamp(pos: Vector3) -> void:
	game.cube(game,pos+Vector3(0,2.5,0),Vector3(0.16,5,0.16),Color("345864"))
	game.cube(game,pos+Vector3(0,0.3,0),Vector3(0.45,0.6,0.45),Color("45636c"))
	game.cube(game,pos+Vector3(0,5,0),Vector3(0.8,0.8,0.8),Color("ffe5a0"))
	for x in [-0.36,0.36]:
		for z in [-0.36,0.36]:
			game.cube(game,pos+Vector3(x,5,z),Vector3(0.08,0.85,0.08),Color("345864"))
	game.cube(game,pos+Vector3(0,5.5,0),Vector3(1,0.2,1),Color("345864"))

func bench(pos: Vector3, angle: float) -> void:
	var root = Node3D.new()
	game.add_child(root)
	root.position = pos
	root.rotation.y = angle
	for plank in 3:
		game.cube(root,Vector3(0,0.7,-0.3+plank*0.3),Vector3(2.4,0.12,0.22),Color("9d7252"))
	for plank in 2:
		game.cube(root,Vector3(0,1.15+plank*0.25,0.4),Vector3(2.4,0.17,0.12),Color("aa8060"))
	for x in [-0.95,0.95]:
		game.cube(root,Vector3(x,0.35,0),Vector3(0.13,0.7,0.65),Color("3b5361"))
		game.cube(root,Vector3(x,1,0.42),Vector3(0.13,1.25,0.13),Color("3b5361"))

func street() -> void:
	# Continuous pavements follow both roads, including elevation and the fork.
	for route in 2:
		var last=game.track.point(0,route)
		var spacing=99.0
		for i in game.SEGMENTS:
			var q=float(i)/game.SEGMENTS
			if route==1 and not game.track.in_fork(q):continue
			var p: Vector3=game.track.point(q,route)
			var next: Vector3=game.track.point(q+1.0/game.SEGMENTS,route)
			var direction: Vector3=game.track.direction(q,route)
			var side: Vector3=direction.cross(Vector3.UP).normalized()
			var width: float=game.track.width(q,route)
			var angle=atan2(-direction.x,-direction.z)
			spacing+=p.distance_to(last)
			last=p
			for edge in [-1,1]:
				# Raised streets sit on continuous masonry, never on floating slabs.
				if not game.track.in_fork(q):
					var street_base=block(game,Vector3(p.x,(p.y-2.0)/2.0,p.z)+side*(width+15)*edge,Vector3(30,p.y+2.0,p.distance_to(next)+.5),3)
					street_base.rotation.y=angle
				var pavement=block(game,p+side*(width+7)*edge+Vector3.UP*.13,Vector3(14,.30,p.distance_to(next)+.3),3)
				pavement.rotation.y=angle
				if q>.55 and q<.84 or route==1 or game.track.in_fork(q):
					var railing=game.cube(game,p+side*(width+3.1)*edge+Vector3.UP*.9,Vector3(.12,.14,p.distance_to(next)+.3),Color("899796"))
					railing.rotation.y=angle
					if i%3==0:
						game.cube(game,p+side*(width+3.1)*edge+Vector3.UP*.5,Vector3(.15,1,.15),Color("465762"))
			if spacing<8.3:continue
			spacing-=8.3
			for edge in [-1,1]:
				var setback=8.0 if route==0 and (q<.55 or q>.84) else 10.0
				var spot=p+side*(width+setback)*edge-Vector3.UP*.4
				var face_angle=atan2(-side.x*edge,-side.z*edge)
				if q<.55 or q>.84:
					if route==0:
						building(spot,face_angle,i%21)
						if i%3==0:building(spot+side*edge*10.5,face_angle,(i+2)%21)
					else:warehouse(spot,face_angle,i,true)
				elif q<.69:
					warehouse(spot,face_angle,i,false)
				else:
					dock(spot,face_angle,i)
				if i%3==0:lamp(p+side*(width+2.4)*edge)
				if i%7==0:bench(p+side*(width+2.1)*edge,face_angle)
				if i%5==0:tree(p+side*(width+4.2)*edge,i)
	# A real second city layer closes sight lines beyond the racing street.
	for i in 72:
		var a=TAU*i/72.0
		var p=Vector3(cos(a)*265,0,sin(a)*205)
		var height=14+(i%5)*4
		var n=Node3D.new()
		game.add_child(n)
		n.position=p
		n.rotation.y=-a
		block(n,Vector3(0,height/2,0),Vector3(17,height,17),[0,2,3,7][i%4])
		block(n,Vector3(0,height+.4,0),Vector3(18,.8,18),3)
		for level in range(2,int(height),3):
			for x in [-6,-3,0,3,6]:
				for z in [-8.55,8.55]:
					game.cube(n,Vector3(x,level,z),Vector3(1.5,1.6,.1),Color("455459") if (i+level)%3 else Color("b7ab85"))

func tree(pos: Vector3, number: int) -> void:
	game.cube(game,pos+Vector3(0,1.5,0),Vector3(.4,3,.4),Color("7d6653"))
	for k in 3:
		game.ball(game,pos+Vector3(sin(k*2.1)*.9,3.2+k*.55,cos(k*2.1)*.9),Vector3(2.7,2.5,2.8),Color("687c58") if number%2 else Color("597966"))
	game.cube(game,pos+Vector3(0,.15,0),Vector3(2,.3,2),Color("aaa997"))

func warehouse(pos: Vector3, angle: float, number: int, branch: bool) -> void:
	if not clear_of_roads(pos,7.0):return
	var n=Node3D.new()
	game.add_child(n)
	n.position=pos
	n.rotation.y=angle
	game.solid_box(n,Vector3(0,3.8,0),Vector3(8.7,7.6,10.5))
	var tint=Color("b9b1a0") if number%2 else Color("927d68")
	game.cube(n,Vector3(0,3.8,0),Vector3(8.1,7.6,10),tint)
	game.cube(n,Vector3(0,7.8,0),Vector3(8.7,.35,10.5),Color("53666b"))
	for x in [-3.7,0,3.7]:game.cube(n,Vector3(x,3.8,5.06),Vector3(.22,7.6,.22),Color("526168"))
	game.cube(n,Vector3(0,2.0,5.08),Vector3(3.5,4,.15),Color("58676b"))
	for slat in 13:game.cube(n,Vector3(0,.2+slat*.3,5.2),Vector3(3.45,.05,.07),Color("899393"))
	for x in [-2.8,2.8]:
		game.cube(n,Vector3(x,5.8,5.09),Vector3(1.7,1.5,.15),Color("aebdb6"))
		for bar in 3:game.cube(n,Vector3(x-.6+bar*.6,5.8,5.22),Vector3(.06,1.55,.05),Color("4b565b"))
	for vent in 3:
		game.cube(n,Vector3(-2+vent*2,8.1,1),Vector3(1.3,.6,1.6),Color("a4a8a1"))
	for x in [-2.2,2.2]:
		game.cube(n,Vector3(x,.45,5.8),Vector3(.22,.9,.22),Color("d3ad59"))
		game.cube(n,Vector3(x,.55,5.8),Vector3(.23,.11,.23),Color("313a3e"))
	if number%3==0:
		for i in 3:container(n,Vector3(0,1.2+i*2.4,-9),number+i)
	var sign=Label3D.new()
	sign.text="CANAL WORKS" if branch else ["ENGINE WORKS","CAT MOTOR CO.","DEPOT 06"][number%3]
	sign.font=load("res://art/Quadrit.ttf")
	sign.font_size=24
	sign.pixel_size=.012
	sign.position=Vector3(0,4.7,5.2)
	n.add_child(sign)
	if number%5==0:
		game.cube(n,Vector3(-2.8,10,-2),Vector3(1.4,5,1.4),Color("625f58"))
		game.cube(n,Vector3(-2.8,12.5,-2),Vector3(1.7,.4,1.7),Color("a5a194"))

func container(n: Node3D, p: Vector3, number: int) -> void:
	var color=[Color("aa5b48"),Color("3f7178"),Color("b39b5c"),Color("6c7984")][number%4]
	game.cube(n,p,Vector3(7.7,2.3,3),color)
	for i in 20:game.cube(n,p+Vector3(-3.65+i*.38,0,1.52),Vector3(.07,2.17,.06),color.lightened(.10))
	for x in [-3.65,3.65]:game.cube(n,p+Vector3(x,0,0),Vector3(.1,2.35,3.08),Color("b5b3a2"))

func dock(pos: Vector3, angle: float, number: int) -> void:
	if not clear_of_roads(pos,7.5):return
	var n=Node3D.new()
	game.add_child(n)
	n.position=pos
	n.rotation.y=angle
	game.solid_box(n,Vector3(0,2.5,-2),Vector3(8,5,3.3))
	game.cube(n,Vector3(0,-.55,0),Vector3(8.4,1.1,12),Color("8f948b"))
	container(n,Vector3(0,1.2,-2),number)
	if number%3==0:container(n,Vector3(0,3.55,-2),number+1)
	if number%4==0:
		for edge in [-1,1]:game.cube(n,Vector3(edge*3,7,-8),Vector3(.5,14,.5),Color("d2a754"))
		game.cube(n,Vector3(0,14,-8),Vector3(7,.7,.7),Color("d2a754"))
		game.cube(n,Vector3(0,14.2,-2),Vector3(.8,.5,14),Color("d2a754"))
		game.cube(n,Vector3(0,9.5,3),Vector3(.08,9,.08),Color("303f4c"))
		game.cube(n,Vector3(0,5,3),Vector3(1.3,.2,1.3),Color("687579"))
	var water=game.cube(n,Vector3(0,-1.3,-21),Vector3(8.5,.2,30),Color("426f78"))
	var m=ShaderMaterial.new()
	m.shader=load("res://water.gdshader")
	water.material_override=m
	for i in 4:game.cube(n,Vector3(-3+i*2,.35,5.8),Vector3(.24,.7,.24),Color("b7ab87"))
