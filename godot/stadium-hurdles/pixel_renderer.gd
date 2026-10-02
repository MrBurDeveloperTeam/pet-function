extends Node2D
## Ground, quiet park verges and obstacles share one moving perspective.
const BACKDROP = preload("res://art/stadium-runner.png")
const OBJECTS = preload("res://art/obstacles-teeth.png")
const EQUIPMENT = preload("res://art/equipment-hazard.png")
const CAT = preload("res://art/cat-run-cycle.png")
const CAT_FLIP = preload("res://art/cat-somersault.png")
const NPC = preload("res://art/npc-high-five.png")
const VIEW = preload("res://runner_view.gd")
const FONT = preload("res://art/Quadrit.ttf")
const OBJECT_INDICES = {"closed":0,"open":1,"tooth":2,"cone":3,"bench":4,"equipment":5}
var ordered_entities: Array = []
var ordered_revision := -1
var game: Node2D
var object_regions: Array[Rect2] = []
var equipment_region: Rect2
var road_texture: ImageTexture
var paving_texture: ImageTexture
var cat_regions: Array[Rect2] = []
var somersault_regions: Array[Rect2] = []
var cat_baseline := 0.0
var npc_regions: Array[Rect2] = []

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	texture_repeat=CanvasItem.TEXTURE_REPEAT_ENABLED
	var image := OBJECTS.get_image()
	for index in range(6):
		var cell := Rect2i((index%3)*512,(index/3)*512,512,512)
		# The authored bench starts at x=500, crossing the nominal atlas grid.
		if index==3: cell=Rect2i(0,512,480,512)
		if index==4: cell=Rect2i(480,512,544,512)
		object_regions.append(trim(image,cell))
	equipment_region=trim(EQUIPMENT.get_image(),Rect2i(0,0,EQUIPMENT.get_width(),EQUIPMENT.get_height()))
	var cat_image := CAT.get_image()
	var npc_image := NPC.get_image()
	for i in range(2): npc_regions.append(trim(npc_image,Rect2i(i*NPC.get_width()/2,0,NPC.get_width()/2,NPC.get_height())))
	var cell := Vector2i(CAT.get_width()/4,CAT.get_height()/2)
	for i in range(8):
		cat_regions.append(trim(cat_image,Rect2i(Vector2i(i%4,i/4)*cell,cell)))
		if i<4: cat_baseline=maxf(cat_baseline,cat_regions[i].end.y)
	var flip_image := CAT_FLIP.get_image()
	var flip_cell := Vector2i(CAT_FLIP.get_width()/4,CAT_FLIP.get_height()/2)
	for i in range(8): somersault_regions.append(trim(flip_image,Rect2i(Vector2i(i%4,i/4)*flip_cell,flip_cell)))
	var sky := Sprite2D.new()
	var sky_texture := AtlasTexture.new()
	sky_texture.atlas=BACKDROP
	sky_texture.region=Rect2(450,0,760,120)
	sky.texture=sky_texture
	sky.centered=false
	sky.scale=Vector2(1280.0/760.0,(VIEW.HORIZON+2)/120.0)
	sky.z_index=-4
	add_child(sky)
	var backdrop := BACKDROP.get_image()
	road_texture=ImageTexture.create_from_image(backdrop.get_region(Rect2i(745,650,110,170)))
	var paving := Image.create(64,64,false,Image.FORMAT_RGBA8)
	for y in range(64):
		for x in range(64):
			var seam := y%16<2 or (x+(16 if (y/16)%2==0 else 0))%32<2
			var shade := float((x*17+y*23)%7)/160.0
			paving.set_pixel(x,y,Color("ac8b63") if seam else Color(0.84+shade,0.72+shade,0.54+shade))
	paving_texture=ImageTexture.create_from_image(paving)
	var ground = load("res://ground_renderer.gd").new()
	ground.game=game
	ground.road=road_texture
	ground.paving=paving_texture
	add_child(ground)
	var stands = load("res://stand_renderer.gd").new()
	stands.game=game
	add_child(stands)

func trim(image: Image, cell: Rect2i) -> Rect2:
	var minimum := cell.end
	var maximum := cell.position
	for y in range(cell.position.y,cell.end.y):
		for x in range(cell.position.x,cell.end.x):
			if image.get_pixel(x,y).a>0.5:
				minimum=minimum.min(Vector2i(x,y))
				maximum=maximum.max(Vector2i(x,y))
	return Rect2(minimum,maximum-minimum+Vector2i.ONE)

func project(world_x: float, z: float, height: float = 0.0) -> Vector3:
	return VIEW.project(world_x,z,height)

func _draw() -> void:
	if not game or not road_texture: return
	# Only the sky is at infinity. Everything below it scrolls in world space.
	# All entities advance by the same distance, so their depth order only changes
	# when an entity is spawned/recycled. Keep the order between those changes.
	if ordered_revision!=game.entity_revision:
		ordered_entities=game.entities.duplicate()
		ordered_entities.sort_custom(func(a,b): return a.node.position.y<b.node.position.y)
		ordered_revision=game.entity_revision
	var cat_drawn := false
	for entity in ordered_entities:
		if entity.node.position.y>0 and not cat_drawn and game.state!="crashed":
			draw_cat()
			cat_drawn=true
		if entity.node.visible: draw_entity(entity)
	if not cat_drawn: draw_cat()
	for spark in game.sparks:
		var p := project(spark.pos.x,spark.pos.y,spark.height)
		var size := maxf(2,6*spark.life/0.45)
		if spark.get("star",false):
			var points := PackedVector2Array()
			for i in range(10):
				var angle := -PI/2+i*PI/5
				points.append(Vector2(p.x,p.y)+Vector2(cos(angle),sin(angle))*(size*2 if i%2==0 else size*0.8))
			draw_colored_polygon(points,Color("ffe786"))
		else: draw_rect(Rect2(Vector2(p.x,p.y),Vector2.ONE*size),Color("fff3b0"))
	if game.tutorial and game.tutorial_waiting: draw_tutorial_arrow()

func draw_shadow(center: Vector2, width: float, alpha: float = 0.3) -> void:
	for i in range(3):
		var inset := float(abs(i-1))*width*0.1
		draw_rect(Rect2(center.x-width*0.5+inset,center.y-4+i*4,width-inset*2,4),Color(0.25,0.13,0.13,alpha))

func draw_entity(entity: Dictionary) -> void:
	var node: Node2D=entity.node
	var ground := project(node.position.x,node.position.y)
	if entity.kind=="npc":
		var region := npc_regions[1 if entity.checked else 0]
		var width := 170*ground.z
		var height := width*region.size.y/region.size.x
		draw_shadow(Vector2(ground.x,ground.y),width*0.65,0.32)
		draw_texture_rect_region(NPC,Rect2(ground.x-width*0.5,ground.y-height,width,height),region)
		if not entity.checked and ground.z>0.3:
			draw_string(FONT,Vector2(ground.x-42*ground.z,ground.y-height-9),"+30",HORIZONTAL_ALIGNMENT_LEFT,-1,int(22*ground.z),Color("fff0ba"))
		return
	var index: int=OBJECT_INDICES[entity.kind]
	var region := equipment_region if entity.kind=="equipment" else object_regions[index]
	var texture: Texture2D=EQUIPMENT if entity.kind=="equipment" else OBJECTS
	var width := 270.0*ground.z
	if entity.kind in ["closed","open"]: width=275.0*ground.z
	if entity.kind=="cone": width=175*ground.z
	if entity.kind=="tooth": width=54*ground.z
	var height := width*region.size.y/region.size.x
	var p := project(node.position.x,node.position.y,entity.height if entity.kind=="tooth" else 0.0)
	var rect := Rect2(p.x-width*0.5,p.y-height,width,height)
	# Cull the complete sprite rectangle, never its ground point or its lane.
	if not rect.intersects(Rect2(-32,-32,1344,784)): return
	if entity.kind=="tooth": draw_rect(Rect2(ground.x-width*0.25,ground.y-1,width*0.5,maxf(1,3*ground.z)),Color(0.25,0.13,0.13,0.12))
	else:
		if entity.kind in ["bench","equipment"]:
			# A contact footprint joins every leg/wheel to the floor, rather than
			# drawing a detached flat shadow below an isometric object.
			var footprint := PackedVector2Array()
			for point in [Vector2(0.06,0.80),Vector2(0.28,0.74),Vector2(0.98,0.83),Vector2(0.80,1.01)]:
				footprint.append(rect.position+point*rect.size)
			draw_colored_polygon(footprint,Color(0.16,0.08,0.06,0.42))
			var feet := [Vector2(0.12,0.79),Vector2(0.78,1),Vector2(0.95,0.82)] if entity.kind=="bench" else [Vector2(0.065,0.81),Vector2(0.645,1),Vector2(0.95,0.81)]
			for foot in feet:
				var contact: Vector2=rect.position+foot*rect.size
				draw_rect(Rect2(contact-Vector2(10,1)*ground.z,Vector2(20,4)*ground.z),Color(0.19,0.1,0.09,0.38))
		else: draw_shadow(Vector2(ground.x,ground.y),width*0.83,0.3)
	draw_texture_rect_region(texture,rect,region)

func draw_cat() -> void:
	var ground := project(game.runner.position.x,0)
	var p := project(game.runner.position.x,0,game.runner.position.y)
	draw_shadow(Vector2(ground.x,ground.y),110-game.runner.position.y*9,0.28)
	if game.state=="crashed":
		draw_hurt_cat(Vector2(ground.x,ground.y))
		return
	if game.celebration_time>0:
		var phase: float=1-game.celebration_time/game.CELEBRATION_DURATION
		draw_texture_rect_region(CAT_FLIP,somersault_rect(Vector2(p.x,p.y),phase),somersault_regions[somersault_frame(phase)])
		return
	if game.slide_time>0:
		var phase: float=game.roll_phase()
		draw_texture_rect_region(CAT_FLIP,roll_rect(Vector2(ground.x,ground.y),phase),somersault_regions[roll_frame(phase)])
		draw_motion_dust(Vector2(ground.x,ground.y))
		return
	var frame := int(game.animation_time*16)%4
	if game.state=="menu": frame=0
	if game.jump_time>0: frame=4 if game.jump_time>0.7 else 5
	var region := cat_regions[frame]
	var cell := Vector2(CAT.get_width()/4.0,CAT.get_height()/2.0)
	var sprite_scale := 192.0/cell.x
	var bob := 2.0*sin(game.animation_time*32) if frame<4 and game.state=="running" else 0.0
	var cell_origin := Vector2(int(frame%4)*cell.x,int(frame/4)*cell.y)
	var baseline := cat_baseline if frame<4 else region.end.y-cell_origin.y
	var rect := Rect2(Vector2(p.x-96,p.y-baseline*sprite_scale+bob)+(region.position-cell_origin)*sprite_scale,region.size*sprite_scale)
	draw_texture_rect_region(CAT,rect,region)
	draw_motion_dust(Vector2(ground.x,ground.y))

func draw_motion_dust(ground: Vector2) -> void:
	if game.state=="running" and not game.tutorial_waiting:
		for i in range(3):
			var phase := fmod(game.animation_time*4+i*0.3,1.0)
			draw_rect(Rect2(ground.x-22+i*18,ground.y+phase*18,5,4),Color(1,0.88,0.66,(1-phase)*0.55))

func somersault_frame(phase: float) -> int:
	return clampi(int(clampf(phase,0,1)*8),0,7)

func somersault_rect(ground: Vector2, phase: float) -> Rect2:
	# Hand-drawn pitch poses keep body volume at quarter turns. All cells use
	# one uniform scale and anchor; no cosine squash or screen-plane rotation.
	var frame := somersault_frame(phase)
	var region := somersault_regions[frame]
	var cell := Vector2(CAT_FLIP.get_width()/4.0,CAT_FLIP.get_height()/2.0)
	var sprite_scale := 192.0/cell.x
	var cell_origin := Vector2(frame%4,frame/4)*cell
	var body_center := ground+Vector2(0,-cat_baseline*(192.0/(CAT.get_width()/4.0))*0.5-sin(clampf(phase,0,1)*PI)*90)
	return Rect2(body_center+(region.position-cell_origin-cell*0.5)*sprite_scale,region.size*sprite_scale)

func roll_frame(phase: float) -> int:
	# Reverse the back-somersault poses for a head-first forward ground roll.
	return 7-somersault_frame(phase)

func roll_rect(ground: Vector2, phase: float) -> Rect2:
	var frame := roll_frame(phase)
	var region := somersault_regions[frame]
	var cell := Vector2(CAT_FLIP.get_width()/4.0,CAT_FLIP.get_height()/2.0)
	var cell_origin := Vector2(frame%4,frame/4)*cell
	var sprite_scale := 192.0/cell.x
	var size := region.size*sprite_scale
	# Every pose stays on the road. The small bounce is visual, not a jump;
	# the uniform scale preserves the cat's full silhouette and low-roll rules.
	var contact := ground-Vector2(0,sin(clampf(phase,0,1)*PI)*6)
	return Rect2(Vector2(contact.x+(region.position.x-cell_origin.x-cell.x*0.5)*sprite_scale,contact.y-size.y),size)

func draw_hurt_cat(ground: Vector2) -> void:
	var age: float=game.CRASH_DURATION-game.crash_time
	# Preserve the original cat's identity: stumble, fall into a curled pose, then dazed rest.
	var frame := 5 if age<0.16 else (6 if age<0.36 else 7)
	var region := cat_regions[frame]
	var width := 162.0
	var height := width*region.size.y/region.size.x
	var recoil := minf(age/0.25,1)*18
	var bounce := sin(minf(age/0.36,1)*PI)*12
	var center := ground+Vector2(sin(age*55)*maxf(0,1-age/0.25)*7,recoil-height*0.5-bounce)
	var tint := Color(1,0.65,0.65) if age<0.12 else Color.WHITE
	draw_set_transform(center,0.16*sin(minf(age/0.36,1)*PI),Vector2.ONE)
	draw_texture_rect_region(CAT,Rect2(-Vector2(width,height)*0.5,Vector2(width,height)),region,tint)
	draw_set_transform(Vector2.ZERO)
	# Orbiting, stepped pixel stars remain visible above the fallen cat.
	for i in range(3):
		var phase := age*5+i*TAU/3
		var at := ground+Vector2(cos(phase)*48,-height-14+sin(phase)*8)
		var star := PackedVector2Array()
		for offset in [Vector2(0,-8),Vector2(3,-3),Vector2(8,0),Vector2(3,3),Vector2(0,8),Vector2(-3,3),Vector2(-8,0),Vector2(-3,-3)]: star.append(at+offset)
		draw_colored_polygon(star,Color("60482b"))
		for j in range(star.size()): star[j]=at+(star[j]-at)*0.75
		draw_colored_polygon(star,Color("ffe786"))
	if age<0.2:
		for i in range(5):
			var angle := -PI+i*PI/4
			var at := ground+Vector2(cos(angle)*70,sin(angle)*70-60)
			draw_rect(Rect2(at,Vector2(5,12)),Color("fff0ba"))

func draw_tutorial_arrow() -> void:
	var key: int=game.LESSONS[game.tutorial_step][0]
	var angle := 0.0
	if key==KEY_DOWN: angle=PI
	elif key==KEY_LEFT: angle=-PI/2
	elif key==KEY_RIGHT: angle=PI/2
	var pulse := sin(Time.get_ticks_msec()*0.007)*7
	draw_set_transform(Vector2(640,380+pulse),angle,Vector2.ONE)
	var arrow := PackedVector2Array([Vector2(-13,50),Vector2(13,50),Vector2(13,0),Vector2(36,0),Vector2(0,-38),Vector2(-36,0),Vector2(-13,0)])
	draw_colored_polygon(arrow,Color("ffe786"))
	var outline := arrow.duplicate()
	outline.append(arrow[0])
	draw_polyline(outline,Color("224269"),5)
	draw_set_transform(Vector2.ZERO,0,Vector2.ONE)


