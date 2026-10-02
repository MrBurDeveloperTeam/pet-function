extends RefCounted
## Elevated right-rear camera. All scenery and sprites use these same values.
const CENTER_X := 640.0
const HORIZON := 210.0
const DEPTH_SPAN := 378.0
const X_SCALE := 108.0
const CAMERA_X := 0.65
const HEIGHT_SCALE := 44.0
const PROJECTION_CENTER := CENTER_X+CAMERA_X*X_SCALE

static func project(world_x: float, z: float, height: float = 0.0) -> Vector3:
	var depth_scale := 1.0/maxf(0.45,1.0-z*0.065)
	return Vector3(PROJECTION_CENTER+(world_x-CAMERA_X)*X_SCALE*depth_scale,HORIZON+DEPTH_SPAN*depth_scale-height*HEIGHT_SCALE*depth_scale,depth_scale)

