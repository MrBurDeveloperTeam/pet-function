extends Node2D
## Continuous blue/gold rails share one sandstone pillar at every joint.
const PILLAR = preload("res://art/stadium-fence-pillar.png")
const LAMP = preload("res://art/track-facing-lamp.png")
const LANDSCAPE = preload("res://art/park-tree-goal.png")
const VIEW = preload("res://runner_view.gd")
const FENCE_SPACING := 12.0
const LAMP_SPACING := 72.0
const LAMP_OFFSET := 26.0
const FENCE_OFFSET := 20.0
const FENCE_X := 6.08
const LAMP_X := 5.1
const TREE_SPACING := 54.0
var game: Node2D
var pillar_region: Rect2
var lamp_region: Rect2
var tree_region: Rect2
var last_distance := -1.0

func _ready() -> void:
	z_index=-2
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	pillar_region=game.world.trim(PILLAR.get_image(),Rect2i(0,0,PILLAR.get_width(),PILLAR.get_height()))
	lamp_region=game.world.trim(LAMP.get_image(),Rect2i(0,0,LAMP.get_width(),LAMP.get_height()))
	tree_region=game.world.trim(LANDSCAPE.get_image(),Rect2i(0,0,LANDSCAPE.get_width()/2,LANDSCAPE.get_height()))

func _process(_delta: float) -> void:
	if last_distance==game.distance: return
	last_distance=game.distance
	queue_redraw()

func face(corners: Array, color: Color) -> void:
	var points := PackedVector2Array()
	for corner: Vector3 in corners:
		var p := VIEW.project(corner.x,corner.y,corner.z)
		points.append(Vector2(p.x,p.y))
	draw_colored_polygon(points,color)

func draw_rail(side: float, far_z: float, near_z: float, height: float) -> void:
	var x := side*FENCE_X
	# One world-space beam ends exactly where the next begins. No baked end posts or gaps.
	face([Vector3(x,far_z,height),Vector3(x,near_z,height),Vector3(x,near_z,height-0.18),Vector3(x,far_z,height-0.18)],Color("173e65"))
	face([Vector3(x,far_z,height),Vector3(x,near_z,height),Vector3(x,near_z,height-0.045),Vector3(x,far_z,height-0.045)],Color("efc766"))
	face([Vector3(x,far_z,height-0.13),Vector3(x,near_z,height-0.13),Vector3(x,near_z,height-0.16),Vector3(x,far_z,height-0.16)],Color("397bb3"))
	face([Vector3(x,far_z,height),Vector3(x,near_z,height),Vector3(x+side*0.09,near_z,height+0.04),Vector3(x+side*0.09,far_z,height+0.04)],Color("ffe0a0"))

func draw_pillar(side: float, z: float) -> void:
	var p := VIEW.project(side*FENCE_X,z)
	if p.z<0.1: return
	var height := 110.0*p.z
	var width := height*pillar_region.size.x/pillar_region.size.y
	draw_texture_rect_region(PILLAR,Rect2(p.x-width*0.5,p.y-height,width,height),pillar_region)

func draw_lamp(side: float, z: float) -> void:
	var p := VIEW.project(side*LAMP_X,z)
	if p.z<0.16: return
	var height := 370.0*p.z
	var width := height*lamp_region.size.x/lamp_region.size.y
	var facing := -side
	var rect := Rect2(-width*0.21,-height,width,height)
	if not Rect2(p.x-width,p.y-height,width*2,height).intersects(Rect2(-32,-32,1344,784)): return
	# Ground contact shadow joins the stone plinth to the landscaped verge.
	draw_rect(Rect2(p.x-width*0.18,p.y-2,width*0.36,5*p.z),Color(0.19,0.25,0.1,0.25))
	draw_set_transform(Vector2(p.x,p.y),0,Vector2(facing,1))
	draw_texture_rect_region(LAMP,rect,lamp_region)
	draw_set_transform(Vector2.ZERO)

func draw_tree(side: float, z: float) -> void:
	var p := VIEW.project(side*11.5,z)
	if p.z<0.15: return
	var region := tree_region
	var height := 560.0*p.z
	var width := height*region.size.x/region.size.y
	var rect := Rect2(p.x-width*0.5,p.y-height,width,height)
	if not rect.intersects(Rect2(-48,-48,1376,816)): return
	# A restrained stepped contact shadow keeps every trunk grounded.
	for row in range(3):
		var shadow_width := width*(0.72 if row==1 else 0.55)
		draw_rect(Rect2(p.x-shadow_width*0.5,p.y-3+row*3*p.z,shadow_width,3*p.z),Color(0.19,0.31,0.09,0.13))
	draw_set_transform(Vector2(p.x,p.y),0,Vector2(-side,1))
	draw_texture_rect_region(LANDSCAPE,Rect2(-width*0.5,-height,width,height),region)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	if not game or pillar_region.size==Vector2.ZERO: return
	# Landscape sits outside the fence and is painted behind the boundary furniture.
	for side in [-1.0,1.0]:
		for i in range(3,-1,-1):
			var z := 8.0-fposmod((44.0 if side<0 else 28.0)-game.distance,TREE_SPACING)-i*TREE_SPACING
			draw_tree(side,z)
	for side in [-1.0,1.0]:
		# Uniform beams need only one continuous span per height, not 18 copies.
		draw_rail(side,-240,8,0.85)
		draw_rail(side,-240,8,1.65)
		# Merge the two regularly spaced streams in depth order without sorting.
		# Each lamp is halfway between pillars throughout the entire scrolling loop.
		var pillar_index := 17
		var lamp_index := 3
		while pillar_index>=0 or lamp_index>=0:
			var pillar_z := 8.0-fposmod(FENCE_OFFSET-game.distance,FENCE_SPACING)-pillar_index*FENCE_SPACING
			var lamp_z := 8.0-fposmod(LAMP_OFFSET-game.distance,LAMP_SPACING)-lamp_index*LAMP_SPACING
			if pillar_index>=0 and (lamp_index<0 or pillar_z<lamp_z):
				draw_pillar(side,pillar_z)
				pillar_index-=1
			else:
				draw_lamp(side,lamp_z)
				lamp_index-=1
