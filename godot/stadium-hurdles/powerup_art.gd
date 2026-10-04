extends RefCounted
## Generated pixel sprites are trimmed and cached once by the renderer.
const MAGNET = preload("res://art/powerup-magnet.png")
const JETPACK = preload("res://art/powerup-jetpack.png")
const EXHAUST = preload("res://art/jet-exhaust.png")
const AIR_HAZARDS = preload("res://art/air-hazards.png")

static func sprite(texture: Texture2D) -> ImageTexture:
	var image := texture.get_image()
	return ImageTexture.create_from_image(image.get_region(image.get_used_rect()))

static func magnet() -> ImageTexture:
	return sprite(MAGNET)

static func jetpack() -> ImageTexture:
	return sprite(JETPACK)

static func exhaust_frames() -> Array[ImageTexture]:
	var frames: Array[ImageTexture] = []
	var image := EXHAUST.get_image()
	var cell := Vector2i(image.get_width()/2,image.get_height()/2)
	for i in range(4):
		var frame := image.get_region(Rect2i(Vector2i(i%2,i/2)*cell,cell))
		frames.append(ImageTexture.create_from_image(frame.get_region(frame.get_used_rect())))
	return frames

static func air_hazards() -> Dictionary:
	var image := AIR_HAZARDS.get_image()
	# The generated cloud extends slightly past the nominal atlas midpoint.
	# Split in the transparent gap so neither sprite includes its neighbour.
	var split := int(image.get_width()*0.52)
	var cloud := image.get_region(Rect2i(0,0,split,image.get_height()))
	var bird := image.get_region(Rect2i(split,0,image.get_width()-split,image.get_height()))
	return {
		"cloud":ImageTexture.create_from_image(cloud.get_region(cloud.get_used_rect())),
		"bird":ImageTexture.create_from_image(bird.get_region(bird.get_used_rect())),
	}
