from PIL import Image
import colorsys,pathlib
for file in pathlib.Path(__file__).parent.parent.joinpath('art','references').glob('*.png'):
 im=Image.open(file).convert('RGBA');w,h=im.size;selected=set()
 for y in range(int(h*.22),int(h*.61)):
  for x in range(w):
   r,g,b,a=im.getpixel((x,y));hue,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
   good=(.46<hue<.64 if file.stem=='munchkin' else .15<hue<.36 if file.stem in ['gulu','mochi','silverbelt'] else .07<hue<.17)
   if a>200 and good and s>.26 and v>.30:selected.add((x,y))
 components=[]
 while selected:
  queue=[selected.pop()];part=[]
  while queue:
   p=queue.pop();part.append(p)
   for dx,dy in [(0,1),(0,-1),(1,0),(-1,0)]:
    q=(p[0]+dx,p[1]+dy)
    if q in selected:selected.remove(q);queue.append(q)
  if len(part)>8:components.append((len(part),min(x for x,y in part),max(x for x,y in part),min(y for x,y in part),max(y for x,y in part)))
 print(file.stem,im.size,sorted(components,reverse=True)[:8])
