extends Node

# Cached PCM cues and independent voices prevent gunfire from cutting off feedback.
const CUES = {
	"shot":[950,350,0.07,0.12,-24], "drone":[1300,650,0.06,0.08,-27],
	"impact":[240,90,0.09,0.65,-19], "explosion":[95,30,0.55,0.85,-13],
	"boss_explosion":[75,22,1.3,0.9,-10], "damage":[220,55,0.3,0.55,-12],
	"laser_charge":[220,1400,0.1,0.03,-17], "laser":[1700,140,0.28,0.25,-14],
	"field_charge":[160,1100,1.5,0.07,-14], "field_laser":[1800,160,1.0,0.35,-10],
	"missile":[150,650,0.28,0.55,-15], "skill_offer":[520,1040,0.4,0.0,-12],
	"skill_choose":[780,1560,0.22,0.0,-12], "energy":[850,1200,0.09,0.0,-23],
	"coin":[1200,1800,0.12,0.0,-22], "repair":[400,900,0.24,0.0,-16],
	"shield":[1400,500,0.18,0.12,-14], "dodge":[900,1500,0.12,0.2,-18],
	"revive":[300,1400,0.55,0.0,-12], "pause":[650,400,0.12,0.0,-17],
	"resume":[400,650,0.12,0.0,-17], "launch":[200,950,0.5,0.2,-16],
	"escape":[180,1100,0.7,0.4,-14], "victory":[520,1040,0.8,0.0,-11],
	"defeat":[420,110,0.7,0.04,-12], "boss_warning":[300,450,0.5,0.05,-15],
	"airstrike":[80,25,0.9,0.85,-11], "boss_shot":[320,110,0.17,0.35,-19]
}
var cache = {}
var voices: Array[AudioStreamPlayer] = []
var cooldowns = {}
var noise_rng = RandomNumberGenerator.new()

func _ready():
	noise_rng.seed = 9213
	for i in range(12):
		var voice = AudioStreamPlayer.new()
		add_child(voice)
		voices.append(voice)

func play(cue: String):
	if not CUES.has(cue): return
	var now = Time.get_ticks_msec()
	if now < cooldowns.get(cue,0): return
	cooldowns[cue] = now+(100 if cue in ["shot","drone","impact","energy","coin"] else 40)
	var voice: AudioStreamPlayer
	for candidate in voices:
		if not candidate.playing: voice = candidate; break
	if voice == null: return
	if not cache.has(cue): cache[cue] = synthesize(CUES[cue])
	voice.stream = cache[cue]
	voice.volume_db = CUES[cue][4]
	voice.play()

func synthesize(spec: Array) -> AudioStreamWAV:
	var samples = int(spec[2]*22050)
	var data = PackedByteArray()
	data.resize(samples*2)
	var phase = 0.0
	for i in range(samples):
		var t = float(i)/samples
		phase += TAU*lerpf(spec[0],spec[1],t)/22050
		var tone = sin(phase)*0.75+sin(phase*2)*0.25
		var noise = noise_rng.randf_range(-1,1)
		var envelope = minf(1,t*40)*pow(1-t,1.4)
		data.encode_s16(i*2,int(clampf(lerpf(tone,noise,spec[3])*envelope,-1,1)*23000))
	var stream = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = data
	return stream
