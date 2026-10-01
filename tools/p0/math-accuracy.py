"""Independent Decimal accuracy check, never used to generate market prices."""
from decimal import Decimal, localcontext
import json
from pathlib import Path

golden = json.loads(Path('docs/verification/fixtures/p0-numeric-golden.json').read_text(encoding='utf-8'))
rows = []
with localcontext() as ctx:
    ctx.prec = 96
    scale = Decimal(10**9)
    for operation in ('exp', 'log'):
        for raw_x, raw_y in golden[operation]:
            x, actual = Decimal(raw_x) / scale, Decimal(raw_y) / scale
            reference = x.exp() if operation == 'exp' else x.ln()
            error = abs(actual - reference)
            threshold = Decimal('1e-7') * max(Decimal(1), abs(reference))
            assert error <= threshold, (operation, x, error, threshold)
            rows.append(dict(operation=operation, input=str(x), actual=str(actual),
                reference=str(reference), absoluteError=str(error),
                relativeError=None if reference == 0 else str(error/abs(reference)),
                allowedAbsoluteError=str(threshold), status='pass'))
result = dict(protocol='fixed-q9-v1', reference='Python Decimal context precision 96',
    scope='13 frozen boundary points, not a global approximation proof', rows=rows)
Path('docs/verification/fixtures/p0-math-accuracy.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print('PASS: 13 Decimal reference points; raw absolute/relative errors recorded.')
