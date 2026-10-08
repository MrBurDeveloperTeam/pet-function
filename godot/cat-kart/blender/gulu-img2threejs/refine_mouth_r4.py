from pipeline import *
import shutil
next_step()
backup=ROOT/'versions/r3'
if not backup.exists():
    backup.mkdir(parents=True)
    for name in ['object-sculpt-spec.json','src','renders','gulu-img2threejs-r3.glb','gulu-img2threejs-r3.blend']:
        src=ROOT/name;dst=backup/name
        if src.is_dir():shutil.copytree(src,dst)
        else:shutil.copy2(src,dst)
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf']
for p in h['primitives']:
    if p['id'].startswith('muzzle-'):p.update(center=[.050 if p['id'].endswith('l') else -.050,.576,.203],radii=[.067,.041,.061])
    if p['id']=='chin':p.update(center=[0,.539,.116],radii=[.153,.071,.131])
for op in h['operations']:
    if op['id'].startswith('join-muzzle-'):op['radius']=.032
cs['nose']['transform']['position']=[0,.600,.263]
cs['nose']['dimensions'].update(width=.049,height=.031,depth=.020)
for side,sign in [('l',1),('r',-1)]:
    cs[f'mouth-{side}']['geometryDescriptor']['tubePath'].update(points=[[0,.559,.26],[sign*.013,.550,.26],[sign*.030,.554,.26]],radius=.0008)
cs['head']['geometryDescriptor']['mouthRefinement']={'method':'shallow vertex relief and surface-projected closed mouth curve','depth':.002,'profile':'short paired whisker pads with continuous round chin'}
s['extensions']['mouthR4']={'scope':'mouth and chin only','source':'reference-front.png and reference-left.png','changes':['shorter smaller muzzle','raised paired pads','round chin transition','mouth curve conforms to actual head surface']}
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
