from pipeline import *
next_step()
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
s.setdefault('extensions',{})['guluRefinement']={'revision':2,'source':'measured front/profile clay reference','factoryPostprocess':'apply_factory_refinements.py','changes':['Lower head and face by .035 relative height','Replace iris buttons with continuous sculpted eyeball and shallow iris/pupil relief','Subtract concha bowls from joined ear volume','Broaden muzzle pads and model triangular nasal pad','Curve front leg mass into smaller paws','Reduce discrete primitive tessellation and remove metadata from export']}
head=cs['head']['geometryDescriptor']['sdf'];head['resolution']=80
for p in head['primitives']:
    p['center'][1]-=.035
    if p['id']=='cranium':p['radii'][0]=.295;p['radii'][1]=.217
    if p['id'].startswith('cheek-'):p['center'][0]*=.90;p['radii']=[.130,.110,.124]
    if p['id'].startswith('muzzle-'):
        p['center']=[.058 if p['id'].endswith('l') else -.058,.562,.264];p['radii']=[.073,.052,.060]
    if p['id']=='chin':p['center']=[0,.511,.118];p['radii']=[.198,.080,.146]
    if p['id'].startswith('socket-'):p['radii']=[.066,.067,.068]
for op in head['operations']:
    if op['type']=='smooth-union':op['radius']=.043 if 'earblend' not in op['right'] else .026
last=head['operations'][-1]['id']
for sign,side in [(1,'l'),(-1,'r')]:
    id=f'concha-cut-{side}';head['primitives'].append({'id':id,'type':'ellipsoid','center':[sign*.236,.867,.049],'radii':[.062,.082,.055], 'transform':{'position':[sign*.236,.867,.049],'rotation':[0,0,sign*-.23]}})
    out=f'concha-recess-{side}';head['operations'].append({'id':out,'type':'subtract','left':last,'right':id});last=out
    for id in [f'eye-{side}',f'iris-{side}',f'pupil-{side}',f'eyelid-{side}']:
        cs[id]['transform']['position'][1]-=.035
    eye=cs[f'eye-{side}'];eye['dimensions'].update(width=.125,height=.129,depth=.111);eye['transform']['position'][2]=.176
    eye['geometryDescriptor']['sculptedEye']={'irisRadiusNormalized':.34,'irisGrooveDepthNormalized':.015,'pupilRadiusNormalized':.15,'pupilRecessNormalized':.014,'sphericalSurface':True}
    for id in [f'iris-{side}',f'pupil-{side}',f'concha-{side}']:cs[id]['material']='hidden';cs[id]['materialLayers']=['hidden']
    rim=cs[f'eyelid-{side}'];rim['dimensions'].update(width=.145,height=.148,depth=.021);rim['transform']['position'][2]=.214
    for i in range(4):
        toe=cs[f'toe-{side}-{i}'];toe['transform']['position']=[sign*.104+(i-1.5)*.038,.057,.257];toe['dimensions'].update(width=.043,height=.072,depth=.072)
body=cs['body']['geometryDescriptor']['sdf'];body['resolution']=56
for p in body['primitives']:
    if p['id']=='chest':p['center']=[0,.367,-.025];p['radii']=[.216,.195,.178]
    if p['id']=='neck':p['center']=[0,.481,.013];p['radii']=[.18,.12,.151]
    if p['id'].startswith('shoulder-'):
        sign=1 if p['id'].endswith('l') else -1;p['center']=[sign*.128,.313,.074];p['radii']=[.107,.14,.117]
    if p['id'].startswith('foreleg-'):
        sign=1 if p['id'].endswith('l') else -1;p['center']=[sign*.116,.203,.142];p['radii']=[.078,.145,.092]
        p['transform']={'position':p['center'],'rotation':[.15,0,sign*.12]}
    if p['id'].startswith('paw-'):p['center']=[(.104 if p['id'].endswith('l') else -.104),.055,.181];p['radii']=[.092,.055,.097]
    if p['id'].startswith('haunch-'):p['radii'][1]=.155
    if p['id'].startswith('rearpaw-'):p['radii'][1]=.042
for op in body['operations']:
    if op['type']=='smooth-union':op['radius']=.040
# A small heart/triangle nose in genuine geometry; nasal cavities are voids.
cs['nose']['transform']={'position':[0,.597,.333],'rotation':[0,0,0]}
cs['nose']['dimensions'].update(width=.063,height=.035,depth=.024)
cs['nose']['geometryDescriptor']['kittenNose']={'roundedTriangularPad':True,'nostrils':'paired shallow concave recesses','profileDepth':.024}
cs['philtrum']['transform']['position']=[0,.573,.325];cs['philtrum']['dimensions'].update(width=.003,height=.026,depth=.003)
for sign,side in [(1,'l'),(-1,'r')]:
    cs[f'mouth-{side}']['geometryDescriptor']['tubePath'].update(points=[[0,.559,.316],[sign*.016,.546,.306],[sign*.035,.553,.301]],radius=.0015)
cs['tail']['geometryDescriptor']['surfaceNormals']='weld radial seam and recompute area weighted normals'
# Reference has no whisker strands in this clay study. Surface hair remains deferred.
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
