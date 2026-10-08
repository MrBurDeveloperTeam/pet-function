from pipeline import *
next_step()
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf'];b=cs['body']['geometryDescriptor']['sdf']
for p in h['primitives']:
    if p['id'].startswith('muzzle-'):p.update(center=[.052 if p['id'].endswith('l') else -.052,.566,.218],radii=[.074,.053,.071])
    if p['id']=='bridge':p.update(center=[0,.633,.206],radii=[.044,.079,.071])
for op in h['operations']:
    if op['id'].startswith('join-muzzle-'):op['radius']=.023
for p in b['primitives']:
    if p['id']=='neck':p.update(center=[0,.468,-.102],radii=[.165,.173,.183])
    if p['id']=='pelvis':p.update(center=[0,.201,-.110],radii=[.232,.207,.187])
for side,sign in [('l',1),('r',-1)]:
    cs[f'muzzle-pad-{side}']['material']='hidden';cs[f'muzzle-pad-{side}']['materialLayers']=['hidden']
    cs[f'mouth-{side}']['geometryDescriptor']['tubePath']['points']=[[0,.558,.287],[sign*.013,.546,.286],[sign*.028,.552,.284]]
cs['nose']['transform']['position'][2]=.279
cs['philtrum']['transform']['position'][2]=.286
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
