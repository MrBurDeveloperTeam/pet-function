"""Extract supplied character art; retain its actual colours and facial pixels."""
from PIL import Image
from pathlib import Path
import json
from collections import deque

root = Path(__file__).resolve().parent.parent / 'art' / 'references'
root.mkdir(parents=True, exist_ok=True)
sources = {
 'mallow': '179bfa46-67ea-4396-a67d-3ffa9db663ad',
 'silverbelt': '5dd69041-5d06-40ca-b2a0-f8b1c3a5ed2b',
 'fastrat': 'aa7e8d3b-71e9-44ca-938d-0dadc2806460',
 'gulu': '2710c273-a69d-43f1-b59a-1b7e69afe8ef',
 'munchkin': '9b3834bd-a080-4d67-94c9-96c0fc1e91c2',
 'mochi': '988acb6f-2c46-4c40-929f-137d261723aa',
}
for name, token in sources.items():
 im=Image.open(Path('C:/Users/ming/AppData/Local/Temp') / ('codex-clipboard-'+token+'.png')).convert('RGBA')
 w,h=im.size; p=im.load(); seen=set(); q=deque()
 # Only connected, neutral background pixels are removed; dark cat outlines remain.
 for x in range(w): q.extend([(x,0),(x,h-1)])
 for y in range(h): q.extend([(0,y),(w-1,y)])
 while q:
  x,y=q.popleft()
  if (x,y) in seen or not (0<=x<w and 0<=y<h):continue
  seen.add((x,y)); r,g,b,a=p[x,y]
  if max(r,g,b)-min(r,g,b)>5 or max(r,g,b)>48:continue
  p[x,y]=(r,g,b,0)
  q.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])
 bbox=im.getbbox(); im=im.crop(bbox); im.save(root/(name+'.png'))
 w,h=im.size;p=im.load()
 rows=[]
 # Central silhouette excludes the sideways tail.
 for y in range(h):
  groups=[]; start=None
  for x in range(w+1):
   occupied=x<w and p[x,y][3]>0
   if occupied and start is None:start=x
   if not occupied and start is not None:groups.append((start,x-1));start=None
  central=[g for g in groups if g[0]<=w*.5<=g[1]]
  rows.append(list(central[0] if central else max(groups,key=lambda a:a[1]-a[0],default=(w//2,w//2))))
 (root/(name+'.json')).write_text(json.dumps({'width':w,'height':h,'rows':rows}))
 print(name, im.size)
