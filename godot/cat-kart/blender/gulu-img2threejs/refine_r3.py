from pipeline import *
import shutil
next_step()
backup=ROOT/'versions/r2'
if not backup.exists():
    backup.mkdir(parents=True)
    for name in ['object-sculpt-spec.json','gulu-img2threejs-r2.blend','gulu-img2threejs-r2.glb','src','renders','public/index.html']:
        src=ROOT/name; dst=backup/name; dst.parent.mkdir(parents=True,exist_ok=True)
        if src.is_dir(): shutil.copytree(src,dst)
        elif src.exists(): shutil.copy2(src,dst)
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'))
cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf']; b=cs['body']['geometryDescriptor']['sdf']
for p in h['primitives']:
    id=p['id']
    if id=='cranium': p.update(center=[0,.704,0],radii=[.292,.229,.228])
    if id=='chin': p.update(center=[0,.542,.086],radii=[.151,.077,.120])
    if id.startswith('cheek-'): p.update(center=[.136 if id.endswith('l') else -.136,.626,.098],radii=[.126,.111,.117])
    if id.startswith('muzzle-'): p.update(center=[.057 if id.endswith('l') else -.057,.566,.199],radii=[.074,.058,.063])
    if id=='bridge': p.update(center=[0,.637,.195],radii=[.047,.087,.070])
    if id=='nape-volume': p.update(center=[0,.565,-.052],radii=[.15,.079,.128])
    if id.startswith('earblend-') and id.endswith('-0'): p['transform']['scale'][2]=.72
    if id.startswith('concha-cut-'):
        p['center'][2]=.065;p['transform']['position']=p['center'];p['radii'][2]=.062
    if id.startswith('socket-'):
        p['center'][0]=.124 if id.endswith('l') else -.124;p['center'][2]=.210;p['radii']=[.069,.070,.064]
for p in b['primitives']:
    id=p['id']
    if id=='neck': p.update(center=[0,.489,-.07],radii=[.168,.135,.150])
    if id=='chest': p.update(center=[0,.351,-.037],radii=[.210,.185,.168])
    if id.startswith('shoulder-'): p.update(center=[.133 if id.endswith('l') else -.133,.302,.082],radii=[.099,.128,.100])
    if id.startswith('foreleg-'):
        sign=1 if id.endswith('l') else -1
        p.update(center=[sign*.116,.191,.153],radii=[.076,.136,.078])
        p['transform']={'position':p['center'],'rotation':[.16,0,sign*.19]}
for sign,side in [(1,'l'),(-1,'r')]:
    c=cs[f'eye-{side}'];c['transform']['position']=[sign*.124,.683,.174];c['dimensions'].update(width=.130,height=.134,depth=.093)
    c['geometryDescriptor']['sculptedEye']['pupilRadiusNormalized']=.23
    c=cs[f'eyelid-{side}'];c['transform']['position']=[sign*.124,.683,.206];c['dimensions'].update(width=.142,height=.146,depth=.044)
    c=cs[f'muzzle-pad-{side}'];c['transform']['position']=[sign*.054,.566,.239];c['dimensions'].update(width=.138,height=.097,depth=.083)
    cs[f'mouth-{side}']['geometryDescriptor']['tubePath'].update(points=[[0,.558,.279],[sign*.013,.546,.279],[sign*.030,.552,.276]],radius=.0014)
cs['nose']['transform']['position']=[0,.604,.265]
cs['nose']['dimensions'].update(width=.054,height=.033,depth=.023)
cs['philtrum']['transform']['position']=[0,.579,.279];cs['philtrum']['dimensions']['height']=.025
s.setdefault('extensions',{})['guluRefinementR3']={'changes':['rounder lower cheek silhouette','nasal root intersects bridge and muzzle','rear neck overlaps cranium','shorter angled forelegs','deeper eye seating and integrated eyelid annulus'],'status':'draft; compare all views before accepting'}
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
