extends Node

var callback: JavaScriptObject
var orientation_paused := false
var previously_paused := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not OS.has_feature("web"): return
	callback = JavaScriptBridge.create_callback(on_message)
	JavaScriptBridge.get_interface("window").addEventListener("message", callback)

func on_message(args: Array) -> void:
	if args.is_empty(): return
	var event = args[0]
	var browser = JavaScriptBridge.get_interface("window")
	if event.origin != browser.location.origin or event.source != browser.parent: return
	var data = event.data
	if data == null or data.source != "pet-function:orientation": return
	set_orientation_paused(bool(data.paused))

func set_orientation_paused(blocked: bool) -> void:
	if blocked == orientation_paused: return
	orientation_paused = blocked
	if blocked:
		previously_paused = get_tree().paused
		for action in InputMap.get_actions(): Input.action_release(action)
		if get_parent().has_method("clear_mobile_movement"): get_parent().clear_mobile_movement()
		get_tree().paused = true
	else:
		get_tree().paused = previously_paused

func _exit_tree() -> void:
	if OS.has_feature("web") and callback != null:
		JavaScriptBridge.get_interface("window").removeEventListener("message", callback)
