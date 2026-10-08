extends Node
var game: Node
var engine: AudioStreamPlayer
var muted=false
var tone: AudioStreamPlayer
func _ready():
	if DisplayServer.get_name()=="headless":return
	engine=AudioStreamPlayer.new()
	engine.playback_type=AudioServer.PLAYBACK_TYPE_STREAM
	# Native looping PCM avoids thousands of GDScript push_frame calls in Web.
	var stream:AudioStreamWAV=load("res://art/engine-loop.wav").duplicate()
	stream.loop_mode=AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin=0
	stream.loop_end=4410
	engine.stream=stream
	engine.volume_db=-25
	add_child(engine)
	tone=AudioStreamPlayer.new()
	tone.volume_db=-18
	add_child(tone)
func toggle():
	muted=not muted
	if engine:engine.volume_db=-80 if muted else -25
	if tone:tone.volume_db=-80 if muted else -18
func _process(_dt):
	if engine==null:return
	if game.started and not game.paused and not game.finished:
		if not engine.playing:
			engine.play()
		engine.pitch_scale=clampf(1+game.speed*3/55.0+(.12 if game.drifting else 0),1,3.6)
	elif engine.playing:engine.stop()
func cue(hz: float):
	if tone==null or muted:return
	var data=PackedByteArray()
	data.resize(3308)
	for i in 1654:
		var t=float(i)/11025
		var envelope=pow(maxf(0,1-t/.15),2)
		var sample=int(sin(t*TAU*(hz+t*600))*envelope*10000)
		data[i*2]=sample&255
		data[i*2+1]=(sample>>8)&255
	var wav=AudioStreamWAV.new()
	wav.format=AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate=11025
	wav.data=data
	tone.stream=wav
	tone.play()
