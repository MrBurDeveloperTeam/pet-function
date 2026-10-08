from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
models=json.loads((ROOT/'meshes.json').read_text(encoding='utf-8'))
checks=[]
for obj in models:
    p=np.array(obj['positions'],dtype=float).reshape(-1,3)
    idx=np.array(obj['indices'],dtype=int).reshape(-1,3) if obj['indices'] else np.arange(len(p)).reshape(-1,3)
    assert np.isfinite(p).all() and idx.min()>=0 and idx.max()<len(p)
    areas=np.linalg.norm(np.cross(p[idx[:,1]]-p[idx[:,0]],p[idx[:,2]]-p[idx[:,0]]),axis=1)
    valid=idx[areas>1e-12]
    volume=np.einsum('ij,ij->i',p[valid[:,0]],np.cross(p[valid[:,1]],p[valid[:,2]])).sum()/6
    # Weld UV seams geometrically before examining manifold edge use.
    q=np.round(p,6);_,remap=np.unique(q,axis=0,return_inverse=True)
    tri=remap[valid]; edges=np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]);edges.sort(axis=1)
    _,counts=np.unique(edges,axis=0,return_counts=True)
    checks.append({'name':obj['name'],'triangles':len(idx),'degenerateTriangles':int((areas<=1e-12).sum()),'signedVolume':float(volume),'boundaryEdgesAfterSpatialWeld':int((counts==1).sum()),'nonManifoldEdgesAfterSpatialWeld':int((counts>2).sum())})
totals={'triangles':sum(c['triangles'] for c in checks),'glbBytes':(ROOT/'gulu-img2threejs-r6.glb').stat().st_size,'meshCount':len(checks),'finiteVertices':True,'meshChecks':checks,'note':'Topology/finite checks are not visual likeness acceptance. Mouth surface tubes may have open ends.'}
(ROOT/'geometry-audit-r6.json').write_text(json.dumps(totals,indent=2),encoding='utf-8')
canvas=Image.new('RGB',(1260,512),'#eee9e3');draw=ImageDraw.Draw(canvas)
try:font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
except OSError:font=ImageFont.load_default()
for i,(label,path) in enumerate([('参考图',ROOT/'reference-front.png'),('上一版',ROOT/'versions/r5/renders/front.png'),('本轮修改',ROOT/'renders/front.png')]):
    image=Image.open(path).convert('RGB').resize((420,474));canvas.paste(image,(i*420,38));draw.text((i*420+15,7),label,fill='#35322e',font=font)
canvas.save(ROOT/'comparison-before-after-r6.png')
print(json.dumps({k:v for k,v in totals.items() if k!='meshChecks'}))
print([(c['name'],c['boundaryEdgesAfterSpatialWeld'],c['nonManifoldEdgesAfterSpatialWeld']) for c in checks if c['name'] in ('head','body','tail','nose')])




