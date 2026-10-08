extends RefCounted
## Presentation only. Skill eligibility, effects and selection remain in progression.gd.
const IDS = ["bullet","damage","crit_damage","crit_chance","evade","leech","shield","defense","life","laser","reflect","double_damage","crit_bomb","counter","vampire","nuclear_shield","drone_boost","life_evolve","ring_laser","reflect2","supercrit","double_counter","vamp_drone","dimension"]
const EFFECTS = {
 "bullet":["Bullets +1"], "damage":["Damage +25%"],
 "crit_damage":["Crit damage +10%"], "crit_chance":["Crit chance +10%"],
 "evade":["Dodge +10%"], "leech":["40% drain chance","Heal 15% of damage"],
 "shield":["1 shield / 20s"], "defense":["Damage taken -8%"],
 "life":["Max HP +15%"], "laser":["Piercing laser","Damage +10%"],
 "drone":["Drone +1","50% aircraft damage"],
 "reflect":["Bounce x1"], "double_damage":["Crit: extra hit"],
 "crit_bomb":["Crit: nearby bombs","50% damage"], "counter":["Dodge: 3 missiles","75% damage"],
 "vampire":["40% drain chance","Heal 25% of damage"], "nuclear_shield":["3 shields / 20s"],
 "drone_boost":["Drone bullets x2"], "life_evolve":["Max HP +30%","Fatal save x1"],
 "ring_laser":["360-degree laser","Laser damage +20%"], "reflect2":["Bounce x3","Last hit: 50%"],
 "supercrit":["Crit +50% / DMG +50%","Max HP -15%"],
 "double_counter":["Dodge +20%","6 missiles / 85% DMG"],
 "vamp_drone":["Drone DMG +10%","Life-draining drones"],
 "dimension":["Max HP +60% / saves x2","Damage -20%"],
 "ascend_laser":["Laser damage +5%"], "ascend_crit":["Crit damage +5%"],
 "ascend_shield":["Shield cooldown -5%"], "repair":["Recover 15% HP"]
}
var atlas: Texture2D
var drone_icon: Texture2D
func card_rect(arena: Vector2, count: int, index: int) -> Rect2:
 var columns = count if arena.x/arena.y >= 1.1 else mini(2,count)
 var rows = ceili(float(count)/columns)
 var gap = 14.0
 var width = minf(230.0,(arena.x-40-gap*(columns-1))/columns)
 var height = minf(310.0,(arena.y-110-gap*(rows-1))/rows)
 var row = int(index/columns)
 var in_row = mini(columns,count-row*columns)
 var total_height = rows*height+(rows-1)*gap
 return Rect2(Vector2((arena.x-in_row*width-(in_row-1)*gap)/2+(index%columns)*(width+gap),(arena.y-total_height)/2+row*(height+gap)),Vector2(width,height))
func icon_index(id: String) -> int:
 var aliases = {"drone":"drone_boost","ascend_laser":"ring_laser","ascend_crit":"supercrit","ascend_shield":"nuclear_shield","repair":"life"}
 return maxi(0,IDS.find(aliases.get(id,id)))
func label(g, text: String, rect: Rect2, y: float, size: int, color: Color):
 var fitted = size
 while fitted > 8 and g.font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,fitted).x > rect.size.x-16:
  fitted -= 1
 var length = g.font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,fitted).x
 g.text_at(text,Vector2(rect.get_center().x-length/2,y),fitted,color)
func draw_card(g, entry: Array, index: int):
 var card = card_rect(g.arena_size,g.progression.choices.size(),index)
 var tier = int(entry[3])
 var accent = Color("8fe8da") if tier <= 1 else (Color("f5c772") if tier == 2 else Color("d6a0ff"))
 var hover = card.has_point(g.get_global_mouse_position())
 var p = card.position
 var s = card.size
 var ui_scale = minf(1.0,s.y/250.0)
 var polygon = PackedVector2Array([p+Vector2(12,0),p+Vector2(s.x-12,0),p+Vector2(s.x,12),p+Vector2(s.x,s.y-12),p+Vector2(s.x-12,s.y),p+Vector2(12,s.y),p+Vector2(0,s.y-12),p+Vector2(0,12)])
 g.paint.draw_colored_polygon(polygon,Color("244654") if hover else Color("142b38"))
 polygon.append(polygon[0])
 g.paint.draw_polyline(polygon,accent,3.0 if hover else 2.0,true)
 var title = Rect2(p+Vector2(8,8),Vector2(s.x-16,30*ui_scale))
 g.paint.draw_rect(title,Color("081621"))
 label(g,entry[1],title,title.position.y+21*ui_scale,maxi(8,int(16*ui_scale)),Color("f2eddb"))
 var image_height = minf(s.x-22,s.y*(.52 if s.y >= 280 else .42))
 var image = Rect2(Vector2(card.get_center().x-image_height/2,p.y+43*ui_scale),Vector2(image_height,image_height))
 if entry[0] == "drone" and drone_icon:
  g.paint.draw_texture_rect(drone_icon,image,false)
 elif atlas:
  var cell = atlas.get_size()/Vector2(6,4)
  var icon = icon_index(entry[0])
  g.paint.draw_texture_rect_region(atlas,image,Rect2(Vector2(icon%6,int(icon/6))*cell,cell))
 var divider = image.end.y+8*ui_scale
 g.paint.draw_line(Vector2(p.x+12,divider),Vector2(card.end.x-12,divider),Color(accent,0.5),1)
 for i in range(maxi(1,tier)):
  var center = Vector2(card.get_center().x+(i-(maxi(1,tier)-1)/2.0)*13,divider+12*ui_scale)
  g.paint.draw_colored_polygon(PackedVector2Array([center+Vector2(0,-4),center+Vector2(4,0),center+Vector2(0,4),center+Vector2(-4,0)]),accent)
 var lines: Array = EFFECTS.get(entry[0],[entry[2]])
 for i in range(lines.size()):
  label(g,lines[i],card,divider+(35+i*20)*ui_scale,maxi(8,int(15*ui_scale)),Color("eef7ed") if i == 0 else Color("b6d1d5"))
 var footer = "BASIC" if tier <= 1 else ("ADVANCED" if tier == 2 else "ULTIMATE")
 label(g,"%d  /  %s" % [index+1,footer],card,card.end.y-12,10,accent)
