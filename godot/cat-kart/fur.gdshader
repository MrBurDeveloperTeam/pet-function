shader_type spatial;
uniform vec4 fur : source_color;
uniform vec4 stripe : source_color;
uniform int identity=1;
varying vec3 local;
void vertex(){local=VERTEX;}
void fragment(){
 vec3 p=floor(local*65.0)/65.0;
 float noise=fract(sin(dot(floor(local*110.0),vec3(13.1,41.7,67.2)))*43758.5453);
 float angle=atan(p.z,p.x);
 float bands=sin(p.y*48.0+sin(angle*3.0)*3.0+sin(p.x*17.0));
 float mask=smoothstep(0.55,0.82,bands);
 if(identity==0){mask=0.0;}
 vec3 base=mix(fur.rgb,stripe.rgb,mask*0.85);
 if(identity==2){base=mix(base,vec3(0.84,0.51,0.16),smoothstep(0.92,0.99,cos(angle))*0.85);}
 ALBEDO=base*(0.92+noise*0.13);
 ROUGHNESS=0.92;
}
