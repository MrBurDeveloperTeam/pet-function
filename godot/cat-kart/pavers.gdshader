shader_type spatial;
render_mode cull_disabled;
uniform vec4 stone : source_color = vec4(0.34,0.40,0.43,1.0);
varying vec3 world_pos;
void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
 vec2 p=world_pos.xz;
 float row=floor(p.y/0.8);
 vec2 cell=vec2(p.x/1.6+mod(row,2.0)*0.5,p.y/0.8);
 vec2 f=fract(cell);
 float seams=step(0.045,f.x)*step(0.06,f.y);
 float variation=fract(sin(dot(floor(cell),vec2(12.9898,78.233)))*43758.5453);
 ALBEDO=stone.rgb*(0.93+variation*0.12)*mix(0.78,1.0,seams);
 ROUGHNESS=0.95;
}
