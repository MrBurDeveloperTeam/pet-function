from pipeline import *
next_step()
s=json.loads((ROOT/'object-sculpt-spec.json').read_text(encoding='utf-8'))
for c in s['componentTree']:
    if c['id']=='head':c['geometryDescriptor']['sdf']['bounds']['max'][1]=1.065
    if c['id']=='tail':
        for st in c['geometryDescriptor']['taperedSweep']['stations']:
            st['position'][0]*=.82;st['position'][1]*=.88;st['rx']*=.9;st['rz']*=.9
    if c['id']=='body':
        for p in c['geometryDescriptor']['sdf']['primitives']:
            if p['id'].startswith('haunch-'):p['center'][0]*=.91;p['radii'][0]*=.92
            if p['id'].startswith('rearpaw-'):p['center'][0]*=.90;p['radii'][0]*=.93
(ROOT/'object-sculpt-spec.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
run('forge/stage2_spec/validate_sculpt_spec.py',ROOT/'object-sculpt-spec.json','--strict-quality')
run('forge/stage3_build/generate_threejs_factory.py',ROOT/'object-sculpt-spec.json','--out',ROOT/'src/createGuluModel.ts','--force')
# Carry the shading correction in a reproducible script, not an unrecorded runtime edit.
p=ROOT/'src/createGuluModel.ts'; code=p.read_text(encoding='utf-8')
code=code.replace('const mesh_tail_3 = new THREE.Mesh(', 'mesh_tail_3Geometry.computeVertexNormals();\n  const mesh_tail_3 = new THREE.Mesh(')
p.write_text(code,encoding='utf-8')
