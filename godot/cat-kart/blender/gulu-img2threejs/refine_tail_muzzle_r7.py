from pipeline import *
import shutil, math
# User explicitly authorized raising the local correction bound to 18, preserving all history.
state=json.loads(STATE.read_text(encoding='utf-8'))
state['loops']['maxPerPass']=18;state['status']='active';state['stopReason']=''
state.setdefault('userAuthorizations',[]).append({'date':'2026-10-07','request':'Yes, continue; flatten whisker pads, clarify mouth and blend tail into body','change':'Raise maxPerPass from 12 to 18; retain maxTotal=24 and all failed reviews.'})
STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
next_step()
backup=ROOT/'versions/r6'
if not backup.exists():
    backup.mkdir(parents=True)
    for name in ['object-sculpt-spec.json','src','renders','gulu-img2threejs-r6.glb','gulu-img2threejs-r6.blend']:
        src=ROOT/name;dst=backup/name
        if src.is_dir():shutil.copytree(src,dst)
        else:shutil.copy2(src,dst)
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf'];b=cs['body']['geometryDescriptor']['sdf']
for p in h['primitives']:
    if p['id'].startswith('muzzle-'):p.update(center=[.042 if p['id'].endswith('l') else -.042,.574,.224],radii=[.060,.044,.053])
    if p['id']=='nasal-root':p['center'][2]=.237;p['radii'][2]=.051
cs['nose']['transform']['position'][2]=.289
cs['head']['geometryDescriptor']['mouthRefinement'].update(padAmplitude=.003,cleftDepth=.0045,cleftWidth=.0035,cleftOcclusion='grey vertex shading on actual recessed surface')
# Tail and pelvis are extracted from the SAME scalar field, with a broad root blend.
curve=[[-.16,.116,-.152],[-.35,.070,-.150],[-.47,.297,-.080],[-.345,.446,-.061]]
def point(t):return [sum(math.comb(3,i)*(1-t)**(3-i)*t**i*curve[i][k] for i in range(4)) for k in range(3)]
last=b['operations'][-1]['id']
for i in range(22):
    a=point(i/22);z=point((i+1)/22);d=[z[k]-a[k] for k in range(3)];length=math.sqrt(sum(v*v for v in d));dx,dy,dz=[v/length for v in d]
    rotation=[math.atan2(dz,dy),0,math.asin(-dx)]
    # Euler XYZ maps the capsule's Y axis to the segment direction.
    id=f'tail-field-{i}';radius=.067-.014*(i/21)**3
    b['primitives'].append({'id':id,'type':'capsule','radius':radius,'height':length,'transform':{'position':[(a[k]+z[k])/2 for k in range(3)],'rotation':rotation}})
    out=f'joined-tail-{i}';b['operations'].append({'id':out,'type':'smooth-union','left':last,'right':id,'radius':.055 if i<5 else .009});last=out
b['resolution']=64;b['bounds']['min'][0]=-.53
cs['body']['geometryDescriptor']['tailFusion']={'method':'shared implicit surface with pelvis and 22 overlapping curve capsules','rootBlendRadius':.055,'controlPoints':curve,'noSeparateTailCap':True}
cs['tail']['material']='hidden';cs['tail']['materialLayers']=['hidden']
s['extensions']['tailMuzzleR7']={'changes':['flatten muzzle by 0.031 normalized depth','clarify mouth cleft with genuine relief and subtle occlusion','fuse tail into body surface instead of overlap/cap seam'],'status':'draft'}
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
