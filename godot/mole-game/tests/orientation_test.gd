extends SceneTree

func _initialize() -> void:
	call_deferred("verify")

func verify() -> void:
	var guard = load("res://orientation_guard.gd").new()
	root.add_child(guard)
	guard.set_orientation_paused(true)
	assert(paused, "Portrait pauses the engine")
	guard.set_orientation_paused(true)
	guard.set_orientation_paused(false)
	assert(not paused, "Repeated notices do not lose the original running state")
	paused = true
	guard.set_orientation_paused(true)
	guard.set_orientation_paused(false)
	assert(paused, "Rotation preserves an existing manual pause")
	paused = false
	print("Orientation pause checks passed")
	quit()
