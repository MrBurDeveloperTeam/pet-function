from pipeline import *
next_step()
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
head=cs['head']['geometryDescriptor']['sdf'];body=cs['body']['geometryDescriptor']['sdf']
for p in head['primitives']:
    if p['id'].startswith('earblend-') or p['id'].startswith('concha-cut-'):
        p['center'][1]+=.02
        if 'transform' in p:p['transform']['position'][1]+=.02
# Muzzle pads become separate closed volumes with deep root overlap and a short frontal profile.
for sign,side in [(1,'l'),(-1,'r')]:
    id=f'muzzle-{side}';p=next(p for p in head['primitives'] if p['id']==id)
    p['center'][2]=.219;p['radii']=[.072,.050,.064]
    c=json.loads(json.dumps(cs[f'toe-{side}-0']))
    c.update(id=f'muzzle-pad-{side}',name=f'muzzle-pad-{side}',level='meso',material='clay',materialLayers=['clay'])
    c['transform']={'position':[sign*.057,.556,.267],'rotation':[0,0,0]}
    c['dimensions'].update(width=.141,height=.092,depth=.090)
    c['geometryDescriptor'].update(topologyIntent='Short rounded muzzle pad embedded in face; paired feline whisker pads')
    c['localFeatures']=[];s['componentTree'].append(c)
    cs[f'mouth-{side}']['geometryDescriptor']['tubePath'].update(points=[[0,.554,.307],[sign*.015,.540,.308],[sign*.031,.548,.303]],radius=.0017)
cs['nose']['transform']['position']=[0,.609,.325]
cs['nose']['dimensions'].update(width=.066,height=.034,depth=.023)
cs['philtrum']['transform']['position']=[0,.575,.311];cs['philtrum']['dimensions'].update(width=.0025,height=.040,depth=.0025)
for p in body['primitives']:
    if p['id']=='pelvis':p['center'][2]=-.142;p['radii'][2]=.17
    if p['id'].startswith('foreleg-'):
        sign=1 if p['id'].endswith('l') else -1;p['center'][0]=sign*.105;p['radii'][0]=.088
        p['transform']['position']=p['center']
body['bounds']['min'][2]=-.38
for pass_spec in s['buildPasses']:pass_spec['componentRefs']=[c['id'] for c in s['componentTree']]
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
