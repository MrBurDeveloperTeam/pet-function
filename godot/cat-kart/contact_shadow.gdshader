shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
void fragment() {
 float radius=length((UV-vec2(.5))*2.0);
 ALBEDO=vec3(.08,.11,.13);
 ALPHA=(1.0-smoothstep(.45,1.0,radius))*.36;
}
