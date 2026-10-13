extends Node
var callback: JavaScriptObject
var last_run := ""
var last_approved := false
static func matches_run_id(incoming, current) -> bool:
	if typeof(current)==TYPE_INT: return typeof(incoming) in [TYPE_INT,TYPE_FLOAT] and float(incoming)==float(current)
	return typeof(incoming)==TYPE_STRING and incoming==current
func _ready():
	process_mode=Node.PROCESS_MODE_ALWAYS
	if OS.has_feature("web"):
		callback=JavaScriptBridge.create_callback(receive)
		JavaScriptBridge.get_interface("window").petReviveReceive=callback
		# Window identity must be compared in JS, not between Godot proxy objects.
		JavaScriptBridge.eval("if(window.petReviveListener)window.removeEventListener('message',window.petReviveListener);window.petReviveListener=function(e){if(e.origin===location.origin&&e.source===parent&&e.data&&e.data.source==='pet-function:revive')window.petReviveReceive(JSON.stringify(e.data));};window.addEventListener('message',window.petReviveListener);")
func receive(args: Array):
	if args.is_empty(): return
	var data=JSON.parse_string(str(args[0]))
	if not data is Dictionary: return
	var ack=apply_request(data)
	if not ack.is_empty() and OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage(%s,window.location.origin)" % JSON.stringify(ack))
func apply_request(data: Dictionary) -> Dictionary:
	if data.get("source","")!="pet-function:revive" or not data.get("approved") is bool: return {}
	var p=get_parent()
	# Browser numbers arrive as doubles; str(1.0) does not equal str(int(1)).
	if not matches_run_id(data.get("runId"),p.run_id): return {}
	var approved: bool=data.approved
	if p.state=="reviving":
		last_run=str(p.run_id)
		last_approved=approved
		p.resolve_revive(approved)
	elif last_run!=str(p.run_id) or last_approved!=approved: return {}
	return {"source":"pet-function:revive-ack","runId":p.run_id,"used":p.revive_count}
func _exit_tree():
	if OS.has_feature("web") and callback!=null: JavaScriptBridge.eval("window.removeEventListener('message',window.petReviveListener);window.petReviveReceive=null;")
