export function mobileRoomSize(width,height) {
 const worldHeight=Math.max(height,620,width*845/1862);
 return {width:Math.max(width,worldHeight*1862/845),height:worldHeight};
}
export function clampRoomCamera(x,y,world,viewport) {
 return {x:Math.max(0,Math.min(x,world.width-viewport.width)),y:Math.max(0,Math.min(y,world.height-viewport.height))};
}
