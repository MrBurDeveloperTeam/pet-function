from pipeline import *
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'))
s['viewEvidence']=[{'id':f'reference-{v}.png','view':v,'imageRegion':{'x':0,'y':0,'width':1,'height':1,'units':'normalized'},'observations':['Isolated seated Gulu reference'], 'confidence':.85} for v in ['front','left','right','back','top','bottom']]
s['lightingFromPhoto']=['Key area light above front left; soft shadows, exposure 1.0 and ACES tone mapping.','Fill area light front right .4 key intensity.','Rear rim light .5 key intensity; contact shadow on neutral ground.']
for c in s['componentTree']:
    c['colorMaterialRecipe']={'dominantAlbedo':'rgba(150, 147, 143, 1)','secondaryAlbedo':'rgba(150, 147, 143, 1)','materialClass':'ceramic','materialClassConfidence':.8,'evidenceRefs':['reference-front.png']}
for m in s['materials']: m.pop('surfaceFrequencyBands',None)
for detail in s['preSpecAssessment']['detailInventory']['details']:
    if isinstance(detail['mapsTo'],list):
        ref=detail['mapsTo'][0].split('.')
        detail['mapsTo']={'ref':f'{ref[1]}/{ref[3]}'}
    else: detail['mapsTo']['ref']=detail['mapsTo']['ref'].replace('.','/')
# Shape study explicitly defers material reconstruction. Do not invent PBR extraction evidence.
s['lookDevTargets']['qualityPriority']='geometry-study'
s['buildPasses']=[p for p in s['buildPasses'] if p['id'] not in ('material-pass','surface-pass','structural-pass')]
struct=dict(s['buildPasses'][1]);struct.update(id='structural-pass',goal='Check embedded feline appendages and component hierarchy')
s['buildPasses'].insert(1,struct)
surface=dict(struct);surface.update(id='surface-pass',goal='Neutral clay roughness; coat colour and fur deliberately deferred')
s['buildPasses'].insert(4,surface)
for m in s['materials']: m['roughness']['variation']=.02
s['sculptPipeline']['passOrder']=[p['id'] for p in s['buildPasses']]
s['selfCorrectLoop']['reviewAfterPasses']=s['sculptPipeline']['passOrder']
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
mark('strict-validation',evidence='object-sculpt-spec.json')
next_step()
