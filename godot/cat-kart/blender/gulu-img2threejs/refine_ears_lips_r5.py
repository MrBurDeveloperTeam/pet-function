from pipeline import *
import shutil
next_step()
backup=ROOT/'versions/r4'
if not backup.exists():
    backup.mkdir(parents=True)
    for name in ['object-sculpt-spec.json','src','renders','gulu-img2threejs-r4.glb','gulu-img2threejs-r4.blend']:
        src=ROOT/name;dst=backup/name
        if src.is_dir():shutil.copytree(src,dst)
        else:shutil.copy2(src,dst)
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'));cs={c['id']:c for c in s['componentTree']}
h=cs['head']['geometryDescriptor']['sdf']
for sign,side in [(1,'l'),(-1,'r')]:
    for i,(center,radii) in enumerate([([sign*.213,.841,0],[.098,.108,.065]),([sign*.239,.909,-.003],[.063,.080,.053]),([sign*.263,.966,-.009],[.029,.039,.036])]):
        p=next(p for p in h['primitives'] if p['id']==f'earblend-{side}-{i}')
        p.clear();p.update(id=f'earblend-{side}-{i}',type='ellipsoid',center=center,radii=radii)
    p=next(p for p in h['primitives'] if p['id']==f'concha-cut-{side}')
    p['center']=[sign*.237,.890,.064];p['radii']=[.048,.068,.053];p['transform']['position']=p['center']
for p in h['primitives']:
    if p['id'].startswith('muzzle-'):p['radii']=[.069,.043,.059]
for side in ['l','r']:
    cs[f'mouth-{side}']['material']='hidden';cs[f'mouth-{side}']['materialLayers']=['hidden']
cs['philtrum']['material']='hidden';cs['philtrum']['materialLayers']=['hidden']
cs['head']['geometryDescriptor']['mouthRefinement']={'method':'continuous skin relief with paired whisker pads, upper lips, lip cleft and lower lip','subdivision':1,'padAmplitude':.025,'cleftDepth':.0045,'lowerLipAmplitude':.009,'noFloatingMouthCurve':True}
cs['head']['geometryDescriptor']['earRefinement']={'method':'three smoothly joined tapering ellipsoids per ear and inset concha','roundedTipRadius':.029,'embeddedRoot':True}
s['extensions']['earsMouthR5']={'scope':'rounded ear silhouette and volumetric closed feline mouth','status':'draft; inspect all views'}
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
