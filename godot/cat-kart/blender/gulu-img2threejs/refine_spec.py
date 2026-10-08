from pipeline import *
import copy
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'))
template=copy.deepcopy(s['componentTree'][1]); components=[]
def component(id,level,primitive,pos=(0,0,0),dims=(1,1,1),material='clay',parent='root',desc=None):
    c=copy.deepcopy(template); c.update(id=id,name=id,level=level,primitive=primitive,parent=parent,material=material,materialLayers=[material],confidence=.85,evidenceRefs=['reference-front.png','reference-left.png'],role='body',localFeatures=[],details=[])
    c['topologyClass']='implicit' if desc and 'sdf' in desc else 'assembled-solid'
    c['topologyRationale']='Continuous blended anatomical volume measured from Gulu front/profile references.' if c['topologyClass']=='implicit' else 'Embedded ocular or relief subpart with real volume, not a projected image.'
    c['transform']={'position':list(pos),'rotation':[0,0,0],'scale':[1,1,1]}
    c['dimensions']=dict(zip(['width','height','depth'],dims),units='relative',confidence=.85)
    c['geometryDescriptor'].update(desc or {})
    c['surfaceDetail'].update(bumpAmplitude=0,normalPattern='none',notes='Smooth grey shape study.')
    c['actionProfile']['animationRole']='static'; c['actionProfile']['pivot']['localPosition']=list(pos)
    c['attachment']=None if parent is None else {'parent':parent,'parentSocket':'origin','localStart':list(pos),'localEnd':list(pos),'contactType':'embedded','embedDepth':.025,'overlap':.025,'gapTolerance':.005}
    components.append(c); return c

root=component('root','macro','box',material='hidden',parent=None)
root['actionProfile']['sockets']=[{'id':'origin','name':'origin','position':[0,0,0],'rotation':[0,0,0]}]
def implicit(parts,bounds,subtract=[]):
    primitives=[{'id':name,'type':'ellipsoid','center':p,'radii':r} for name,p,r in parts]
    operations=[]; last=primitives[0]['id']
    for p in primitives[1:]:
        new='join-'+p['id']; operations.append({'id':new,'type':'smooth-union','left':last,'right':p['id'],'radius':.025});last=new
    for name,p,r in subtract:
        primitives.append({'id':name,'type':'ellipsoid','center':p,'radii':r})
        new='cut-'+name; operations.append({'id':new,'type':'subtract','left':last,'right':name}); last=new
    return {'sdf':{'primitives':primitives,'operations':operations,'resolution':64,'bounds':{'min':bounds[0],'max':bounds[1]}}}

# Y up, +Z forward. Skull HH=.47, width=.61; total height including ears=1.
headparts=[('cranium',[0,.710,0],[.302,.223,.228]),('chin',[0,.595,.082],[.225,.11,.185]),('cheek-l',[.170,.648,.118],[.133,.124,.135]),('cheek-r',[-.170,.648,.118],[.133,.124,.135]),('muzzle-l',[.058,.592,.218],[.089,.060,.071]),('muzzle-r',[-.058,.592,.218],[.089,.060,.071]),('bridge',[0,.662,.190],[.038,.099,.06])]
cuts=[('socket-l',[.118,.718,.204],[.067,.069,.073]),('socket-r',[-.118,.718,.204],[.067,.069,.073])]
head=component('head','macro','ellipsoid',desc=implicit(headparts,([-.36,.465,-.28],[.36,.96,.31]),cuts))
# Compact seated torso; forelimbs overlap chest and paws instead of exposed tube caps.
bodyparts=[('pelvis',[0,.207,-.070],[.240,.209,.210]),('chest',[0,.385,.012],[.217,.218,.184]),('neck',[0,.520,0],[.192,.130,.169])]
for sign,suffix in [(1,'l'),(-1,'r')]:
    bodyparts += [(f'haunch-{suffix}',[sign*.205,.177,-.064],[.126,.168,.176]),(f'shoulder-{suffix}',[sign*.119,.377,.092],[.112,.134,.115]),(f'foreleg-{suffix}',[sign*.114,.209,.147],[.081,.170,.085]),(f'paw-{suffix}',[sign*.110,.045,.185],[.100,.045,.113]),(f'rearpaw-{suffix}',[sign*.235,.040,.052],[.094,.04,.09])]
body=component('body','macro','ellipsoid',desc=implicit(bodyparts,([-.36,-.015,-.31],[.36,.665,.32])))
# A curved tail centerline rather than segmented cylinders; stations retain thick middle.
tail=component('tail','macro','tapered-sweep',desc={'taperedSweep':{'stations':[{'position':p,'rx':r,'rz':r,'twist':0} for p,r in [([-.15,.12,-.20],.072),([-.28,.085,-.17],.082),([-.39,.13,-.14],.080),([-.44,.23,-.12],.083),([-.45,.35,-.10],.079),([-.43,.45,-.09],.071),([-.40,.49,-.09],.045),([-.38,.51,-.09],0)]],'radialSegments':32,'capEnds':True}})
for sign,suffix in [(1,'l'),(-1,'r')]:
    # Ear shell is a tapered flattened sweep with its root deep inside skull.
    ear=component(f'ear-{suffix}','meso','tapered-sweep',desc={'taperedSweep':{'stations':[{'position':[sign*x,y,z],'rx':rx,'rz':rz,'twist':0} for x,y,z,rx,rz in [(.205,.82,.002,.111,.058),(.233,.90,.015,.079,.040),(.276,1.0,.011,.012,.012),(.278,1.01,.012,0,0)]],'radialSegments':24,'capEnds':True}})
    for id,p,d,mat in [(f'eye-{suffix}',[sign*.118,.718,.184],[.120,.126,.112],'ocular'),(f'iris-{suffix}',[sign*.118,.716,.238],[.072,.076,.010],'iris-clay'),(f'pupil-{suffix}',[sign*.118,.716,.245],[.029,.036,.006],'iris-clay')]:
        component(id,'meso' if id.startswith('eye') else 'micro','ellipsoid',p,d,mat)
    rim=component(f'eyelid-{suffix}','meso','torus',[sign*.118,.718,.203],[.139,.144,.035],desc={'torusTubeRatio':.055})
    # inner ear initially a grey volumetric concha placeholder, later subtractive refinement.
    component(f'concha-{suffix}','meso','ellipsoid',[sign*.238,.900,.040],[.084,.122,.017],'clay')
    for i in range(4):
        component(f'toe-{suffix}-{i}','micro','ellipsoid',[sign*.110+(i-1.5)*.039,.037,.237],[.044,.059,.062])
component('nose','meso','ellipsoid',[0,.640,.262],[.045,.025,.027],'clay')
component('philtrum','micro','ellipsoid',[0,.613,.282],[.005,.032,.004],'iris-clay')
for sign,suffix in [(1,'l'),(-1,'r')]:
    component(f'mouth-{suffix}','micro','tube',desc={'tubePath':{'points':[[0,.600,.277],[sign*.025,.588,.279],[sign*.053,.596,.273]],'radius':.002,'tubularSegments':24,'radialSegments':6,'closed':False}},material='iris-clay')
s['componentTree']=components
s.pop('rig',None)
# Static study has part pivots, no humanoid skeleton. Only measured feline geometry is emitted.
s['performanceBudget'].update(targetTriangles=100000,maxDrawCalls=40,fpsTarget=60)
m=copy.deepcopy(s['materials'][0]); materials=[]
for id,color,rough in [('hidden','#000000',1),('clay','#96938f',.75),('ocular','#a39e98',.32),('iris-clay','#77736e',.55)]:
    mat=copy.deepcopy(m); mat.update(id=id,name=id,baseColor=color,color=color)
    mat['albedo']={'dominant':color,'secondary':[color]};mat['colorVariation'].update(palette=[color],pattern='flat',amplitude=0)
    mat['roughness']={'base':rough,'variation':0};mat['metalness']={'base':0,'variation':0}
    mat['normal'].update(pattern='none',strength=0);mat['bump'].update(pattern='none',amplitude=0)
    for band in mat['surfaceFrequencyBands']: band['amplitude']=0
    mat['localOverrides']=[{'id':'clay-finish','region':'entire surface','roughness':rough,'evidenceRef':'reference-front.png'}]
    mat['notes']='Uniform neutral clay; coat and fur deferred by user.'
    if id=='hidden':mat['opacity']={'base':0}
    materials.append(mat)
s['materials']=materials
s['repetitionSystems']=[{'id':'toe-series','componentRef':'toe-l-0','count':1,'distribution':'linear','spacing':[0,0,0],'notes':'Four toe positions per paw authored individually to avoid changing paw shape.'}]
features=[('ear-roots','ear-l','root overlap .04'),('eye-sockets','head','subtract socket depth .073'),('cheek-volume','head','continuous smooth blend'),('muzzle-pads','head','two short pads joined to face'),('chin-setback','head','chin behind nose'),('tail-arc','tail','thick curved sweep'),('foreleg-roots','body','embedded into chest'),('seated-haunches','body','wide pelvic support'),('toe-separation','toe-l-0','rounded toe groups'),('eyelid-rim','eyelid-l','shallow ocular lip'),('nose-pad','nose','short nasal pad'),('philtrum-groove','philtrum','nasal to oral central line')]
details=[]
for id,ref,note in features:
    c=next(c for c in components if c['id']==ref)
    c['localFeatures'].append({'id':id,'kind':'contour','description':note,'evidenceRefs':['reference-front.png'],'geometryEffect':{'type':'sculpted-relief','amplitude':.005}})
    details.append({'id':id,'kind':'contour','description':note,'confidence':.85,'evidenceRef':'reference-front.png','mapsTo':[f'componentTree.{ref}.localFeatures.{id}'],'region':{'x':0,'y':0,'width':1,'height':1}})
s['preSpecAssessment']['detailInventory']['details']=details
s['preSpecAssessment']['complexity']['estimatedCounts']={'macroComponents':4,'mesoComponents':len([c for c in components if c['level']=='meso']),'microFeatureGroups':len(details),'materialLayers':4,'repetitionSystems':1}
s['featureReviewTargets']=[]
for id,refs in [('anatomy-proportion',['head','body']),('pose-silhouette',['body','tail']),('face-landmark-placement',['head','eye-l','eye-r','nose']),('outfit-and-palette',['head','body'])]:
    s['featureReviewTargets'].append({'id':id,'name':id,'tier':'critical' if id!='outfit-and-palette' else 'important','passIds':['blockout','proportion-lock','feature-placement','material-pass'],'minimumScore':.80,'mustPass':id!='outfit-and-palette','componentRefs':refs,'evidenceRefs':['reference-front.png']})
for p in s['buildPasses']:
    p['componentRefs']=[c['id'] for c in components];p['goal']='Gulu '+p['id'];p['acceptance']=['Match measured feline reference, with volumetric parts and no floating ear/eye/forelimb roots.']
save=lambda name,data:(ROOT/name).write_text(json.dumps(data,indent=2),encoding='utf-8')
save('object-sculpt-spec.json',s); save('di.json',s['preSpecAssessment']['detailInventory'])
mark('detail-inventory',evidence='di.json')
run('forge/state.py','mark','projection-route','--state',STATE,'--status','skipped','--reason','Grey geometry only requested; no coat texture projection.')
mark('spec-authoring',evidence='object-sculpt-spec.json')
run('forge/state.py','mark','material-evidence','material-spec-wiring','--state',STATE,'--status','skipped','--reason','User defers colour/fur; neutral clay study uses independent plain PBR materials.')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
mark('strict-validation',evidence='object-sculpt-spec.json')
next_step()
