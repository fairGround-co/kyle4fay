"""Copy partials/site-header.html into every public page.

The block between the site-header:start and site-header:end markers is
replaced. A page without markers gets the block right after <body>.

    python tools/sync-header.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['index.html', 'policy.html', 'endorsements.html', 'videos.html',
         'vote.html', 'record.html', 'privacy.html']

partial = (ROOT / 'partials' / 'site-header.html').read_text(encoding='utf-8')
block = re.compile(r'  <!-- site-header:start.*?<!-- site-header:end -->\n', re.S)

for name in PAGES:
    path = ROOT / name
    html = path.read_text(encoding='utf-8')
    if block.search(html):
        html = block.sub(lambda m: partial, html, count=1)
    else:
        html = html.replace('<body>\n', '<body>\n' + partial, 1)
    path.write_text(html, encoding='utf-8', newline='\n')
    print('synced', name)
