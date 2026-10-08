extends RefCounted

const FORK_START = 0.16
const FORK_END = 0.38
var hard_amplitude = 10.0

func base(q: float) -> Vector3:
	var a = q * TAU
	return Vector3(170.0 * cos(a) + 35.0 * sin(a * 3.0), 2.0 + 5.0 * pow(maxf(0,sin(a*2.0)),2), 115.0 * sin(a) + 24.0 * sin(a*4.0))

func in_fork(q: float) -> bool:
	return q > FORK_START and q < FORK_END

func point(q: float, route: int = 0) -> Vector3:
	q = fposmod(q, 1.0)
	if not in_fork(q):
		return base(q)
	var u = (q - FORK_START) / (FORK_END - FORK_START)
	var start = base(FORK_START)
	var end = base(FORK_END)
	var direction = (end - start).normalized()
	var right = direction.cross(Vector3.UP).normalized()
	var offset = -32.0 * sin(u * PI) if route == 0 else hard_amplitude * sin(u * PI) + 8.0 * sin(u * PI * 3.0)
	# Hermite tangents keep both entries smooth; squared envelope rejoins without a kink.
	var span=FORK_END-FORK_START
	var t0=(base(FORK_START+.0001)-base(FORK_START-.0001))/.0002*span
	var t1=(base(FORK_END+.0001)-base(FORK_END-.0001))/.0002*span
	var p=(2*u*u*u-3*u*u+1)*start+(u*u*u-2*u*u+u)*t0+(-2*u*u*u+3*u*u)*end+(u*u*u-u*u)*t1
	p+=right*offset*sin(u*PI)
	if route == 1:
		p.y += 4.0 * pow(sin(u * PI * 2.0), 2)
	return p

func direction(q: float, route: int = 0) -> Vector3:
	return (point(q + 0.0001, route) - point(q - 0.0001, route)).normalized()

func width(q: float, route: int = 0) -> float:
	if not in_fork(q):
		return 12.0
	var u = (q - FORK_START) / (FORK_END - FORK_START)
	return lerpf(12.0, 9.0 if route == 0 else 8.0, minf(1.0, sin(u * PI) * 3.0))

func fork_length(route: int) -> float:
	var distance = 0.0
	var previous = point(FORK_START, route)
	for i in range(1, 401):
		var p = point(lerpf(FORK_START, FORK_END, float(i) / 400), route)
		distance += previous.distance_to(p)
		previous = p
	return distance

func balance() -> void:
	var target = fork_length(0)
	# Start the search beyond the shortest curve, where length increases monotonically.
	var low = 50.0
	var high = 160.0
	for i in 24:
		hard_amplitude = (low + high) * 0.5
		if fork_length(1) < target:
			low = hard_amplitude
		else:
			high = hard_amplitude
	hard_amplitude = (low + high) * 0.5

