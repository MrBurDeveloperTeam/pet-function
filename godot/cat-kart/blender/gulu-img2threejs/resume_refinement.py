from pipeline import *
import shutil, datetime
backup=ROOT/'versions'/'r1';backup.mkdir(parents=True,exist_ok=True)
for name in ['object-sculpt-spec.json','gulu-img2threejs.blend','gulu-img2threejs.glb','comparison-front.png','capture-report.json']:
    if (ROOT/name).exists() and not (backup/name).exists():shutil.copy2(ROOT/name,backup/name)
if not (backup/'renders').exists():shutil.copytree(ROOT/'renders',backup/'renders')
state=json.loads(STATE.read_text(encoding='utf-8'))
state['loops']['maxPerPass']=12;state['loops']['maxTotal']=24
state['status']='active';state['stopReason']=''
state.setdefault('userAuthorizations',[]).append({'date':'2026-10-07','request':'Continue refining and reduce obvious differences','change':'Raise local correction limits to 12 per pass / 24 total; preserve completed review history and failed gates.'})
STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
next_step()
