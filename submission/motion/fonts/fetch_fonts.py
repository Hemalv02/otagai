#!/usr/bin/env python3
"""Download Google Fonts locally (no network at render time) and write fonts/fonts.css.

    python3 fonts/fetch_fonts.py "Geist:wght@400;500;600;700" "Geist Mono:wght@400;700"
    python3 fonts/fetch_fonts.py "Hind Siliguri:wght@400;600" --subset bengali --append

Prints the FONTS preload list to paste into scenes/index.js.
"""
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0 Safari/537.36'  # → woff


def main(argv):
    subset = 'latin'
    append = '--append' in argv
    fams = [a for a in argv if not a.startswith('--')]
    if '--subset' in argv:
        subset = argv[argv.index('--subset') + 1]
        fams = [f for f in fams if f != subset]
    if not fams:
        print(__doc__)
        return 1
    q = '&'.join('family=' + urllib.parse.quote(f, safe=':;@,') for f in fams)
    req = urllib.request.Request(f'https://fonts.googleapis.com/css2?{q}&display=swap', headers={'User-Agent': UA})
    css = urllib.request.urlopen(req).read().decode()
    blocks = re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})', css) or [('latin', b) for b in re.findall(r'@font-face\s*{[^}]*}', css)]
    out, specs = [], []
    for sub, b in blocks:
        if sub != subset:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", b).group(1)
        style = re.search(r'font-style:\s*(\w+)', b).group(1)
        w = re.search(r'font-weight:\s*(\d+)', b).group(1)
        url = re.search(r'url\((https[^)]+)\)', b).group(1)
        fn = f"{fam.replace(' ', '')}-{w}{'-italic' if style == 'italic' else ''}{'' if subset == 'latin' else '-' + subset}.{url.rsplit('.', 1)[-1]}"
        path = os.path.join(HERE, fn)
        if not os.path.exists(path):
            urllib.request.urlretrieve(url, path)
        out.append(b.replace(url, fn))
        specs.append(f"['{'italic ' if style == 'italic' else ''}{w} 20px \"{fam}\"']")
    mode = 'a' if append else 'w'
    with open(os.path.join(HERE, 'fonts.css'), mode) as f:
        f.write('\n'.join(out) + '\n')
    print(f'{len(out)} faces → fonts/fonts.css ({"appended" if append else "written"})')
    print('FONTS preload entries:\n  ' + ', '.join(specs))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
