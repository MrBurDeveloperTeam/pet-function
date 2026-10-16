extends SceneTree

var failures := 0
var assertions := 0
var sheet_images := {}

func check(condition: bool, description: String) -> void:
	assertions += 1
	if not condition:
		push_error(description)
		failures += 1

func _initialize() -> void:
	call_deferred("verify")

# Use the orthographic KEEP_WIDTH pixel scale as an independent expectation.
# Production projects four camera-facing corners instead of using this formula.
func projected_alpha_bounds(scene, index: int) -> Rect2:
	var atlas: AtlasTexture = scene.cat_atlases[index]
	var texture_key: String = atlas.atlas.resource_path
	if not sheet_images.has(texture_key):
		sheet_images[texture_key] = atlas.atlas.get_image()
	var sheet: Image = sheet_images[texture_key]
	var frame_image := sheet.get_region(Rect2i(atlas.region))
	var used := Rect2(frame_image.get_used_rect())
	var sprite: Sprite3D = scene.cat_sprites[index]
	var camera: Camera3D = scene.camera
	var pixel_scale: float = root.get_visible_rect().size.x / camera.size * sprite.pixel_size
	var lift: float = scene.cat_visuals[index].position.y
	var visual_origin: Vector3 = scene.pitch_position(scene.game.cats[index].pos) + Vector3.UP * lift
	var screen_origin: Vector2 = camera.unproject_position(visual_origin)
	var frame_center := atlas.region.size * 0.5
	var top_left := screen_origin + (used.position - frame_center + Vector2(sprite.offset.x, -sprite.offset.y)) * pixel_scale
	return Rect2(top_left, used.size * pixel_scale)

func rect_near(actual: Rect2, expected: Rect2, tolerance := 0.1) -> bool:
	return actual.position.distance_to(expected.position) <= tolerance \
		and actual.end.distance_to(expected.end) <= tolerance

func verify() -> void:
	root.size = Vector2i(1280, 720)
	var scene = load("res://main.gd").new()
	root.add_child(scene)
	scene.set_process(false)
	scene.started = true
	scene.game.state = "playing"
	scene.game.cats[0].pos = Vector2(-5, -2)
	scene.game.cats[1].pos = Vector2(3, 1)
	scene.game.cats[3].pos = Vector2(10, -3)
	# The doubled cases represent the same CSS viewport on DPR 2 displays.
	var sizes: Array[Vector2i] = [Vector2i(1280, 720), Vector2i(1366, 768), Vector2i(1600, 806), Vector2i(1850, 835), Vector2i(1920, 1080), Vector2i(2560, 1080), Vector2i(3200, 1612), Vector2i(3840, 2160)]
	var density_reference := Rect2()
	var countdown_font_reference := 0
	for viewport_size in sizes:
		root.size = viewport_size
		await process_frame
		scene.update_visuals(0)
		for index in [0, 3]:
			for row in [1, 2]:
				for frame in range(8):
					for lift in [0.0, 0.1]:
						scene.cat_atlases[index].region = Rect2(frame * 192, row * 208, 192, 208)
						scene.cat_visuals[index].position.y = lift
						var expected := projected_alpha_bounds(scene, index)
						var actual: Rect2 = scene.cat_screen_rect(index)
						check(rect_near(actual, expected), "Projected cat bounds include frame, offset and kick lift: %s cat=%d row=%d frame=%d lift=%s" % [viewport_size, index, row, frame, lift])
						scene.tutorial_step = 0
						scene.tutorial_success_step = -1
						scene.game.controlled = index
						var focus: Rect2 = scene.tutorial_focus_rect()
						check(focus.encloses(expected), "Tutorial contains the entire visible cat at %s cat=%d row=%d frame=%d lift=%s" % [viewport_size, index, row, frame, lift])
						check(focus.size.x > expected.size.x and focus.size.y > expected.size.y, "Tutorial leaves visible padding around the alpha bounds")
		# Check selection rules against independently projected cat geometry.
		scene.cat_visuals[0].position.y = 0
		scene.cat_visuals[3].position.y = 0
		scene.update_visuals(0)
		scene.game.controlled = 0
		scene.tutorial_step = 2
		scene.tutorial_success_step = -1
		var teammate_focus: Rect2 = scene.tutorial_focus_rect()
		check(teammate_focus.encloses(projected_alpha_bounds(scene, 1)), "Passing lesson highlights teammate 1 at every viewport")
		check(not teammate_focus.encloses(projected_alpha_bounds(scene, 0)), "Passing lesson does not fall back to the controlled cat")
		scene.tutorial_step = 4
		check(scene.tutorial_focus_rect().encloses(projected_alpha_bounds(scene, 3)), "Steal lesson highlights the opponent before success")
		scene.tutorial_success_step = 4
		check(scene.tutorial_focus_rect().encloses(projected_alpha_bounds(scene, 0)), "Steal observation highlights the controlled cat after success")
		scene.tutorial_step = 5
		scene.game.controlled = 1
		check(scene.tutorial_focus_rect().encloses(projected_alpha_bounds(scene, 1)), "Switch lesson follows the newly controlled teammate")
		scene.tutorial_step = 1
		var energy_focus: Rect2 = scene.tutorial_focus_rect()
		check(energy_focus.position.x < 80 and energy_focus.get_center().y > root.size.y * 0.35 and energy_focus.get_center().y < root.size.y * 0.65, "Sprint lesson continues to highlight the energy HUD")
		# A 2x framebuffer must produce the same perceived padded frame.
		scene.tutorial_step = 0
		scene.game.controlled = 0
		scene.tutorial_success_step = -1
		var density_focus: Rect2 = scene.tutorial_focus_rect()
		if viewport_size == Vector2i(1600, 806):
			density_reference = density_focus
		elif viewport_size == Vector2i(3200, 1612):
			check(rect_near(Rect2(density_focus.position / 2, density_focus.size / 2), density_reference, 0.6), "DPR 2 preserves the apparent tutorial frame and padding")
		scene.game.state = "countdown"
		scene.game.phase_time = 3.0
		scene.update_visuals(0)
		await process_frame
		var countdown_rect: Rect2 = scene.announcement.get_global_rect()
		var countdown_font: int = scene.announcement.get_theme_font_size("font_size")
		check(scene.announcement.text == "3", "Countdown retains its 3, 2, 1 text")
		check(countdown_font >= int(viewport_size.y * 0.1), "Countdown is large enough on every framebuffer")
		check(countdown_rect.get_center().y >= viewport_size.y * 0.25 and countdown_rect.get_center().y <= viewport_size.y * 0.38, "Countdown sits visibly above the field center")
		check(absf(countdown_rect.get_center().x - viewport_size.x * 0.5) < 1, "Countdown remains horizontally centered")
		check(Rect2(Vector2.ZERO, Vector2(viewport_size)).encloses(countdown_rect), "Countdown stays inside the desktop viewport")
		if viewport_size == Vector2i(1600, 806):
			countdown_font_reference = countdown_font
		elif viewport_size == Vector2i(3200, 1612):
			check(absi(countdown_font - countdown_font_reference * 2) <= 1, "DPR 2 preserves the apparent countdown font size")
		scene.game.state = "playing"
		scene.update_visuals(0)
	print("Football responsive layout: ", "PASS" if failures == 0 else "FAIL", " / assertions=", assertions, " / failures=", failures)
	scene.audio.stop()
	scene.queue_free()
	await process_frame
	await process_frame
	quit(1 if failures else 0)
