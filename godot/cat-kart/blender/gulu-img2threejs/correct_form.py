from pipeline import *
import math
next_step()
run('forge/stage4_review/append_review.py',ROOT/'object-sculpt-spec.json','--pass-id','blockout','--fidelity','.48','--action','refine-spec','--summary','Measured dimensions now work; ear shells are narrow cones, tail stations are too coarse, nose/mouth buried and eye cap protrudes. Refine attachment geometry and short muzzle.','--render-screenshot',ROOT/'renders/front.png','--in-place')
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8')); comps={c['id']:c for c in s['componentTree']}
# Add the broad ear bases as continuous parts of the head field.
head=comps['head']['geometryDescriptor']['sdf']; last=head['operations'][-1]['id']
for sign,side in [(1,'l'),(-1,'r')]:
    for i,(x,y,z,rx,ry,rz) in enumerate([(.207,.851,.0,.114,.096,.062),(.235,.917,.0,.074,.075,.044),(.266,.970,.0,.033,.051,.025)]):
        id=f'earblend-{side}-{i}';head['primitives'].append({'id':id,'type':'ellipsoid','center':[sign*x,y,z],'radii':[rx,ry,rz]})
        out=f'joined-{id}';head['operations'].append({'id':out,'type':'smooth-union','left':last,'right':id,'radius':.035});last=out
    # Remove separate pointed cones: continuous shape now carries ear roots.
    comps[f'ear-{side}']['material']='hidden';comps[f'ear-{side}']['materialLayers']=['hidden']
    # Eye sphere is inset; iris relief stays near the visible sphere instead of a bulging button.
    comps[f'eye-{side}']['transform']['position'][2]=.168
    comps[f'iris-{side}']['transform']['position'][2]=.223
    comps[f'pupil-{side}']['transform']['position'][2]=.229
    comps[f'eyelid-{side}']['transform']['position'][2]=.213
    comps[f'eyelid-{side}']['dimensions']['depth']=.023
    # Inner ear patch becomes a recessed bowl at a shallower projection.
    con=comps[f'concha-{side}'];con['transform']['position']=[sign*.236,.919,.020]
    con['dimensions'].update(width=.070,height=.107,depth=.021)
    for i in range(4):
        toe=comps[f'toe-{side}-{i}'];toe['transform']['position'][1]=.055;toe['transform']['position'][2]=.257
        toe['dimensions'].update(width=.045,height=.072,depth=.056)
comps['nose']['transform']['position']=[0,.628,.300]
comps['nose']['dimensions'].update(width=.053,height=.028,depth=.027)
comps['philtrum']['transform']['position']=[0,.608,.304]
for side in ['l','r']:
    path=comps[f'mouth-{side}']['geometryDescriptor']['tubePath'];sign=1 if side=='l' else -1
    path.update(points=[[0,.598,.303],[sign*.024,.582,.297],[sign*.051,.593,.292]],radius=.0025)
# Increase paw height, reduce central abdomen projection and sloping chest width.
body=comps['body']['geometryDescriptor']['sdf']
for p in body['primitives']:
    if p['id']=='pelvis': p['center'][2]=-.10;p['radii'][2]=.18
    if p['id']=='chest': p['center'][2]=-.025;p['radii'][2]=.174
    if p['id'].startswith('paw-'):p['center'][1]=.060;p['radii'][1]=.059
# Smooth tail path with a Catmull-Rom resampling of measured stations; rounded tip.
tail=comps['tail']['geometryDescriptor']['taperedSweep'];old=tail['stations'];new=[]
def cr(p0,p1,p2,p3,t):
    return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
for i in range(len(old)-1):
    prev=old[max(0,i-1)];a=old[i];b=old[i+1];after=old[min(len(old)-1,i+2)]
    for j in range(8):
        t=j/8;pos=[cr(prev['position'][k],a['position'][k],b['position'][k],after['position'][k],t) for k in range(3)]
        r=max(0,cr(prev['rx'],a['rx'],b['rx'],after['rx'],t));new.append({'position':pos,'rx':r,'rz':r,'twist':0})
new.append(old[-1]);tail['stations']=new;tail['radialSegments']=32
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
next_step()
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
