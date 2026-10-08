from pathlib import Path
import subprocess, sys, json
from PIL import Image

ROOT = Path(__file__).resolve().parent
SKILL = Path('C:/Users/ming/.codex/skills/img2threejs')
STATE = ROOT / '.img2threejs/state.json'
def run(script, *args):
    proc = subprocess.run([sys.executable, str(SKILL / script), *map(str,args)], cwd=ROOT)
    if proc.returncode: raise SystemExit(proc.returncode)
def mark(*steps, evidence):
    state=json.loads(STATE.read_text(encoding='utf-8'))
    completed={s['id'] for s in state['checklist'] if s['status'] in ('done','skipped')}
    steps=[s for s in steps if s not in completed]
    if steps: run('forge/state.py','mark',*steps,'--state',STATE,'--evidence',ROOT/evidence)
def next_step():
    run('forge/next.py','--state',STATE,ROOT/'object-sculpt-spec.json')

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'intake':
        source=ROOT.parent/'gulu-clay-v3/reference-sheet.png'
        im=Image.open(source)
        # Crops isolate each single character without changing the reference design.
        crops={'front':(30,0,450,474),'left':(510,0,1015,474),'right':(1020,0,1536,474),'back':(20,498,445,958),'top':(528,500,1010,960),'bottom':(1030,505,1536,960)}
        for name,box in crops.items():
            im.crop(box).save(ROOT/f'reference-{name}.png')
        run('forge/stage1_intake/check_reference_admission.py',ROOT/'reference-front.png','--viewpoint','front','--out',ROOT/'admission.json','--probe-out',ROOT/'probe.json','--json')
        mark('reference-admission',evidence='admission.json')
        mark('character-contract-read',evidence='analysis.md')
        run('forge/stage1_intake/extract_landmarks.py',ROOT/'reference-front.png','--out',ROOT/'anatomy.json','--overlay',ROOT/'landmarks.png','--style-heads','2.1')
        next_step()
    elif action == 'assessment':
        run('forge/stage2_spec/new_pre_spec_assessment.py','Gulu seated clay kitten','--image',ROOT/'reference-front.png','--character','--domain','character','--complexity','complex','--spec-query','seated quadruped kitten broad cheeks recessed eye socket continuous ear roots curved thick tail','--out',ROOT/'assessment.json')
        next_step()
