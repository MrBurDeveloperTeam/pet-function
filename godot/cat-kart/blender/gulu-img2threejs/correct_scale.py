from pipeline import *
next_step()
run('forge/stage4_review/append_review.py',ROOT/'object-sculpt-spec.json','--pass-id','blockout','--fidelity','.2','--action','refine-spec','--summary','Render failed geometry gates: explicit unit transform scale overrides measured dimensions on discrete eye/toe geometry. Remove the overriding scale for sized primitives.','--render-screenshot',ROOT/'renders/front.png','--in-place')
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'))
for c in s['componentTree']:
    if c['primitive'] not in ('tube','tapered-sweep') and c['topologyClass']!='implicit': c['transform'].pop('scale',None)
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
next_step()
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
