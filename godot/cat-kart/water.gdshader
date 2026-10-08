shader_type spatial;
uniform vec4 water : source_color=vec4(.22,.38,.42,1.0);
varying vec3 position_world;
void vertex(){position_world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
 float wave=step(.88,fract(position_world.x*.12+sin(position_world.z*.3+TIME*.5)*.08+TIME*.04));
 ALBEDO=mix(water.rgb,vec3(.52,.65,.65),wave*.4);
 ROUGHNESS=.38;
 METALLIC=.25;
}
