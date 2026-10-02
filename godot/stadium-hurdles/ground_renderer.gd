extends Node2D
## One perspective-correct draw replaces hundreds of per-frame road strips.
var game: Node2D
var road: Texture2D
var paving: Texture2D
var surface: ShaderMaterial
var last_distance := -1.0
const VIEW = preload("res://runner_view.gd")
const GRASS = preload("res://art/sports-lawn-v2.png")

func _ready() -> void:
	z_index=-3
	var shader := Shader.new()
	shader.code="""
shader_type canvas_item;
uniform sampler2D road_pattern : repeat_enable, filter_nearest;
uniform sampler2D paving_pattern : repeat_enable, filter_nearest;
uniform sampler2D grass_pattern : repeat_enable, filter_nearest;
uniform float scroll_distance = 0.0;
uniform float horizon;
uniform float depth_span;
uniform float x_scale;
uniform float camera_x;
uniform float projection_center;
varying vec2 canvas_position;
void vertex() { canvas_position = VERTEX; }
void fragment() {
	float depth_scale = max((canvas_position.y - horizon) / depth_span, 0.00001);
	float world_z = (1.0 - 1.0 / depth_scale) / 0.065;
	float world_x = (canvas_position.x - projection_center) / (x_scale * depth_scale) + camera_x;
	if (abs(world_x) <= 4.5) {
		vec4 road_color = texture(road_pattern, vec2(world_x * 0.8, (world_z - scroll_distance) / 4.0));
		float lane_offset = mod(world_x + 4.5, 3.0);
		float stripe = step(min(lane_offset, 3.0-lane_offset), 0.022);
		COLOR = mix(road_color, vec4(1.0,0.945,0.81,1.0), stripe);
	} else if (abs(world_x) <= 5.6) {
		COLOR = texture(paving_pattern, vec2(world_x * 0.6, (world_z-scroll_distance) * 0.2));
	} else if (abs(world_x) <= 6.3) {
		// Sandstone footing unifies the pavement, fence pillars and lamp plinths.
		vec3 stone = texture(paving_pattern,vec2(world_x*0.6,(world_z-scroll_distance)*0.2)).rgb;
		float edge = step(abs(world_x),5.68);
		COLOR = vec4(mix(stone*0.88,vec3(0.98,0.86,0.61),edge),1.0);
	} else {
		// World-space pixel lawn scrolls with the track. Fade distant detail to avoid shimmer.
		vec3 grass = texture(grass_pattern,vec2(world_x,(world_z-scroll_distance))*0.022).rgb;
		vec3 lawn_base = vec3(0.45,0.65,0.22);
		float detail = smoothstep(0.07,0.65,depth_scale)*0.8;
		COLOR = vec4(mix(lawn_base,grass,detail),1.0);
	}
}
"""
	surface=ShaderMaterial.new()
	surface.shader=shader
	surface.set_shader_parameter("horizon",VIEW.HORIZON)
	surface.set_shader_parameter("depth_span",VIEW.DEPTH_SPAN)
	surface.set_shader_parameter("x_scale",VIEW.X_SCALE)
	surface.set_shader_parameter("camera_x",VIEW.CAMERA_X)
	surface.set_shader_parameter("projection_center",VIEW.PROJECTION_CENTER)
	surface.set_shader_parameter("road_pattern",road)
	surface.set_shader_parameter("paving_pattern",paving)
	surface.set_shader_parameter("grass_pattern",GRASS)
	material=surface

func _process(_delta: float) -> void:
	if last_distance==game.distance: return
	last_distance=game.distance
	surface.set_shader_parameter("scroll_distance",game.distance)

func _draw() -> void:
	draw_rect(Rect2(0,VIEW.HORIZON,1280,720-VIEW.HORIZON),Color.WHITE)


