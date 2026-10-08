from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent
p=ROOT/'src/createGuluModel.ts';code=p.read_text(encoding='utf-8')
if "import { refineGuluGeometry }" not in code:
    code="import { refineGuluGeometry } from './refinements';\n"+code
    code=code.replace('  return root;\n}', '  refineGuluGeometry(root);\n  return root;\n}',1)
code=code.replace('new THREE.SphereGeometry(0.5, 64, 40)','new THREE.SphereGeometry(0.5, 32, 20)')
p.write_text(code,encoding='utf-8')
