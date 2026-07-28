#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""배포된 HTML에서 인라인 데이터 상수를 분리해 data/*.json + template 로 되돌린다.
소멸한 build.py/gen.py 파이프라인 복구용. 원본 raw(VWorld/건축HUB)가 없으므로
이 산출물이 현재의 마스터 데이터다."""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# 지역별로 '데이터'인 상수만 명시한다. 자동 탐지에 맡기면 코드 상수(RAMP/AGEMATCH 등,
# JSON이 아닌 JS 리터럴)까지 끌려와 깨진다.
TARGETS = {
    'seogu': ['BD','EMDV','VD','ZONING','EMD','SIGG','SITE','CL','SITEPAR','POP','VAC'],
    # gijang은 서구판과 별도 코드베이스다(기술부록 Y-1). 데이터/코드 상수가 섞여 있고
    # POP은 unquoted key, RAMP·AGEMATCH는 작은따옴표라 JSON이 아니다. 별도 작업으로 남긴다.
    'gijang': [],
}
DEFAULT_REGIONS = ['seogu']
# 자동 탐지용: 한 줄짜리 최상위 데이터 상수
AUTO = re.compile(r'(?m)^const ([A-Z][A-Z0-9_]*)=(?=[\[{])')


def scan_literal(src, i):
    """src[i]의 여는 괄호부터 짝이 맞는 닫는 괄호까지. 문자열/이스케이프를 존중한다."""
    pairs = {'{': '}', '[': ']'}
    close = pairs[src[i]]
    depth, j, q = 0, i, None
    while j < len(src):
        c = src[j]
        if q:
            if c == '\\':
                j += 2
                continue
            if c == q:
                q = None
        elif c in '"\'':
            q = c
        elif c in pairs:
            depth += 1
        elif c in '}]':
            depth -= 1
            if depth == 0:
                if c != close:
                    raise SystemExit(f'괄호 불일치 @{i}')
                return j + 1
        j += 1
    raise SystemExit(f'닫는 괄호를 찾지 못했다 @{i}')


def find_consts(src, names=None):
    """(name, start, value_start, value_end) 목록. 여러 줄 값도 지원한다."""
    out = []
    for m in AUTO.finditer(src):
        name = m.group(1)
        if names is not None and name not in names:
            continue
        vs = m.end()
        ve = scan_literal(src, vs)
        tail = src[ve:ve + 2]
        if not tail.startswith(';'):
            raise SystemExit(f"[{name}] 값 뒤에 ';'가 없다 (실제 {tail!r}) — 수동 확인 필요")
        out.append((name, m.start(), vs, ve + 1))
    return out


def extract(region):
    html = os.path.join(ROOT, os.pardir, f'{region}.html')
    src = io.open(html, encoding='utf-8').read()
    consts = find_consts(src, TARGETS.get(region))
    if not consts:
        raise SystemExit(f'{region}: 데이터 상수를 찾지 못했다')

    ddir = os.path.join(ROOT, 'data', region)
    os.makedirs(ddir, exist_ok=True)

    pieces, prev, manifest = [], 0, []
    for name, st, vs, le in consts:
        raw = src[vs:le].rstrip()
        assert raw.endswith(';'), name
        raw = raw[:-1].rstrip()
        json.loads(raw)                      # JSON 유효성 검증 (실패하면 여기서 멈춘다)
        p = os.path.join(ddir, f'{name}.json')
        io.open(p, 'w', encoding='utf-8').write(raw)
        pieces.append(src[prev:vs])
        pieces.append('{{%s}}' % name)       # 플레이스홀더
        prev = le - 1                        # 세미콜론은 템플릿에 남긴다
        manifest.append({'name': name, 'bytes': len(raw.encode('utf-8'))})
    pieces.append(src[prev:])

    tdir = os.path.join(ROOT, 'template')
    os.makedirs(tdir, exist_ok=True)
    io.open(os.path.join(tdir, f'{region}.tmpl.html'), 'w', encoding='utf-8').write(''.join(pieces))
    io.open(os.path.join(ddir, '_manifest.json'), 'w', encoding='utf-8').write(
        json.dumps({'region': region, 'order': [c['name'] for c in manifest],
                    'sizes': {c['name']: c['bytes'] for c in manifest}},
                   ensure_ascii=False, indent=1))
    print(f'{region}: 상수 {len(consts)}개 분리 → data/{region}/  (' +
          ', '.join(f"{c['name']} {c['bytes']:,}B" for c in manifest) + ')')


if __name__ == '__main__':
    for r in (sys.argv[1:] or DEFAULT_REGIONS):
        extract(r)
