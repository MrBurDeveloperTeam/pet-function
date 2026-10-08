from pipeline import *
def save(name,data): (ROOT/name).write_text(json.dumps(data,indent=2),encoding='utf-8')
a=json.loads((ROOT/'anatomy.json').read_text())
an=a['anatomy']; an.update(applies=True,styleHeads=2.1,confidence=.85,source='measured-reference')
an['proportions']={'headUnit':.47,'torso':.97,'legs':.54,'shoulderWidth':1.05,'hipWidth':1.25}
an['pose']['type']='seated-quadruped'; an['faceLandmarks']={'hairline':0,'eyeLine':.52,'eyeSpacing':.22,'noseBase':.68,'mouthLine':.80,'earTop':-.14,'earBottom':.30}
an['features']=[{'name':'eyes','evidenceRef':'reference-front.png eye centers (194,162), (303,162) in original sheet','confidence':.9}, {'name':'head','evidenceRef':'reference-front.png skull y48..259, width275px','confidence':.85}]
save('anatomy.json',a); mark('character-landmarks',evidence='anatomy.json')
ass=json.loads((ROOT/'assessment.json').read_text()); pre=ass['preSpecAssessment']
pre['anatomy']=an
pre['objectClass']={'primaryType':'seated juvenile feline','primaryDomain':'character','formLanguage':['organic','sculptural'],'structureKind':['continuous core volume','embedded ocular forms','curved appendage'],'motionPotential':['static prop'],'materialFamilies':['clay'],'notes':'Static grey shape study, not a humanoid template.'}
pre['complexity']['scores']=dict(silhouetteComplexity=3,componentCount=2,hierarchyDepth=2,repetitionDensity=1,materialLayerCount=1,localDetailDensity=3,occlusionRisk=2,actionReadinessNeed=1)
pre['complexity']['reasoning']=['Continuous skull/ears/chest/limbs must preserve identity in front and profiles.','Ocular cavities and toe grooves need real relief; fur and colour deferred.']
ass['qualityContract']['definitionOfDone']=['Front skull width/height, recessed eyes, joined ear roots, compact seated pelvis, four grounded paws and thick curved tail match the supplied Gulu reference in multi-angle renders.','Editable static geometry exported to Blender after shape acceptance; no animation claim.']
save('assessment.json',ass)
mark('local-spec-search','pre-spec-assessment',evidence='assessment.json')
run('forge/stage1_intake/build_detail_inventory.py',ROOT/'reference-front.png','--mode','grid-3x3','--out-dir',ROOT/'detail-inventory','--out',ROOT/'di.json')
run('forge/stage2_spec/new_sculpt_spec.py','Gulu seated clay kitten','--image',ROOT/'reference-front.png','--assessment',ROOT/'assessment.json','--domain','character','--out',ROOT/'object-sculpt-spec.json')
next_step()
