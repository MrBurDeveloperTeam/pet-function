shader_type spatial;
uniform vec4 fur : source_color;
uniform vec4 stripe : source_color;
uniform int identity=0;
varying vec3 p;
void vertex(){p=VERTEX;}
void fragment(){
 float grain=fract(sin(dot(floor(p*105.0),vec3(13.1,41.7,67.2)))*43758.5453);
 vec3 color=fur.rgb*(0.94+grain*0.08);
 if(identity!=0){float bands=sin(p.y*43.0+sin(atan(p.z,p.x)*3.0)*2.8);color=mix(color,stripe.rgb,smoothstep(0.65,0.85,bands)*0.8);}
 if(p.z<-0.22){
  vec2 eye=vec2(abs(p.x)-0.205,p.y-0.065);
  float rim=length(eye/vec2(0.145,0.115));
  if(rim<1.08)color=vec3(0.13,0.14,0.15);
  if(rim<0.91)color=vec3(0.83,0.59,0.21);
  if(length(eye/vec2(0.065,0.095))<1.0)color=vec3(0.07,0.09,0.1);
  if(length((eye-vec2(-0.035,0.038))/vec2(0.02))<1.0)color=vec3(0.98);
  float muzzle=length(vec2(p.x,p.y+0.22)/vec2(0.25,0.135));
  if(muzzle<1.0)color=vec3(0.91,0.87,0.77);
  if(identity==0 && abs(p.x)<max(0.0,0.055-p.y*0.12) && p.y<0.13 && p.y>-0.2)color=vec3(0.91,0.87,0.77);
  if(p.y< -0.105 && p.y> -0.175 && abs(p.x)<(-0.105-p.y)*0.95)color=vec3(0.75,0.4,0.44);
  if(abs(p.x)<0.009 && p.y< -0.17 && p.y> -0.24)color=vec3(0.22,0.2,0.2);
  if(abs(p.y+0.255-abs(p.x)*0.28)<0.007 && abs(p.x)<0.08)color=vec3(0.22,0.2,0.2);
 }
 ALBEDO=color; ROUGHNESS=0.94;
}
