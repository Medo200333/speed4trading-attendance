from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.codex-backups' / 'access-center-20261022' / 'python-deps'))
from pypdf import PdfReader
destination = root / '.codex-backups' / 'access-center-20261022' / 'references'
destination.mkdir(parents=True, exist_ok=True)
for source in sorted((root / 'docs' / 'codex-access-pack' / 'REFERENCES').glob('*.pdf')):
    reader = PdfReader(source)
    pages = ['\n\n=== PAGE %s ===\n%s' % (index + 1, page.extract_text() or '') for index, page in enumerate(reader.pages)]
    (destination / (source.stem + '.txt')).write_text(''.join(pages), encoding='utf-8')
    print(json.dumps({'file': source.name, 'pages': len(pages), 'characters': sum(map(len, pages))}))
