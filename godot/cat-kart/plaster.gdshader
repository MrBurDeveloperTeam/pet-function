shader_type spatial;
uniform vec4 plaster : source_color=vec4(0.7,0.6,0.5,1);
varying vec3 local;
void vertex(){local=VERTEX;}
void fragment(){
 vec3 p=floor(local*12.0);
 float n=fract(sin(dot(p,vec3(13.1,71.7,31.2)))*43758.5453);
 float weather=0.97+n*0.06;
 ALBEDO=plaster.rgb*weather;
 ROUGHNESS=0.94;
}
