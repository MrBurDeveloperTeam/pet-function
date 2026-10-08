extends Node2D
var game: Node2D
var layer = ""
func _draw():
	game.render_layer(self, layer)
