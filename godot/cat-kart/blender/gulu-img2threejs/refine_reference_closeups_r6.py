from pipeline import *
import shutil
next_step()
backup=ROOT/'versions/r5'
if not backup.exists():
    backup.mkdir(parents=True)
    for name in ['object-sculpt-spec.json','src','renders','gulu-img2threejs-r5.glb','gulu-img2threejs-r5.blend']:
        src=ROOT/name;dst=backup/name
        if src.is_dir():shutil.copytree(src,dst)
        else:shutil.copy2(src,dst)
for srcname,view in [('codex-clipboard-deab9f29-da02-4fd5-8dd9-ed285d9e0306.png','front'),('codex-clipboard-963766a6-8ffe-45e8-89d7-b7345532b4e3.png','left'),('codex-clipboard-aa10ed29-a94c-4252-948f-8059cd5636e2.png','right')]:
    shutil.copy2(Path('C:/Users/ming/AppData/Local/Temp')/srcname,ROOT/f'reference-closeup-{view}.png')
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf']
for sign,side in [(1,'l'),(-1,'r')]:
    for i,(center,radii) in enumerate([([sign*.207,.839,0],[.109,.112,.066]),([sign*.244,.911,-.003],[.065,.084,.054]),([sign*.273,.974,-.009],[.025,.033,.036])]):
        p=next(p for p in h['primitives'] if p['id']==f'earblend-{side}-{i}');p.update(center=center,radii=radii)
    p=next(p for p in h['primitives'] if p['id']==f'concha-cut-{side}');p['center']=[sign*.219,.867,.063];p['radii']=[.057,.054,.052];p['transform']['position']=p['center']
    id=f'concha-upper-{side}';h['primitives'].append({'id':id,'type':'ellipsoid','center':[sign*.247,.926,.067],'radii':[.033,.042,.041]})
    index=next(i for i,o in enumerate(h['operations']) if o['id']==f'concha-recess-{side}')
    h['operations'].insert(index,{'id':f'ear-cavity-{side}','type':'smooth-union','left':f'concha-cut-{side}','right':id,'radius':.020})
    h['operations'][index+1]['right']=f'ear-cavity-{side}'
for p in h['primitives']:
    if p['id'].startswith('muzzle-'):p.update(center=[.042 if p['id'].endswith('l') else -.042,.573,.247],radii=[.060,.047,.061])
    if p['id']=='chin':p.update(center=[0,.535,.145],radii=[.151,.075,.140])
for op in h['operations']:
    if op['id'].startswith('join-muzzle-'):op['radius']=.018
    if op['id']=='join-chin':op['radius']=.052
h['primitives'].append({'id':'nasal-root','type':'ellipsoid','center':[0,.607,.253],'radii':[.026,.028,.051]})
h['operations'].append({'id':'joined-nasal-root','type':'smooth-union','left':h['operations'][-1]['id'],'right':'nasal-root','radius':.023})
cs['nose']['transform']['position']=[0,.600,.304];cs['nose']['dimensions']['depth']=.033
cs['head']['geometryDescriptor']['mouthRefinement'].update(padAmplitude=.007,cleftDepth=.002,lowerLipAmplitude=.0015,reference='three user-provided head closeups; true paired muzzle masses, embedded nasal root')
s['extensions']['headCloseupsR6']={'referenceFiles':['reference-closeup-front.png','reference-closeup-left.png','reference-closeup-right.png'],'scope':'rounded triangular ear shell/cavity and real paired muzzle volumes'}
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
