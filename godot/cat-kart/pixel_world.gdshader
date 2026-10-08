shader_type canvas_item;
uniform sampler2D screen_texture : hint_screen_texture, filter_nearest;
uniform float boost=0.0;
void fragment() {
    vec2 grid = vec2(768.0, 432.0);
    vec2 uv = (floor(SCREEN_UV * grid) + 0.5) / grid;
    vec3 rgb = texture(screen_texture, uv).rgb;
    vec2 offset=SCREEN_UV-.5;
    float radius=length(offset);
    float angle=atan(offset.y,offset.x);
    float rays=step(.985,fract(angle*26.0+sin(TIME*7.0)*.3));
    rgb=mix(rgb,vec3(.65,.87,.86),boost*rays*smoothstep(.36,.7,radius)*.3);
    rgb*=1.0-smoothstep(.3,.72,radius)*.12;
    COLOR = vec4(floor(rgb * 64.0 + 0.5) / 64.0, 1.0);
}
