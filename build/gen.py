#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""template/<region>.tmpl.html + data/<region>/*.json → <region>.html

소멸한 원래 gen.py의 대체본. 원래 gen.py의 최대 결함 두 가지를 구조적으로 제거했다.
  1) 원래 gen.py에는 v1.1 패치(빈집 밀도 레이어)가 없어 재실행하면 기능이 소멸했다.
     이 gen.py는 배포본 HTML 자체에서 뽑은 템플릿을 쓰므로 그런 소실이 원리상 불가능하다.
  2) 원래 gen.py는 출력 파일명이 index.html이어서 공유 랜딩을 덮어쓰는 사고를 냈다.
     여기서는 항상 <region>.html 로만 쓴다. index.html 은 어떤 경우에도 건드리지 않는다.
"""
import argparse, hashlib, io, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, os.pardir))

FORBIDDEN = {'index.html'}          # 절대 출력 대상이 될 수 없는 파일


def build(region):
    tpl = io.open(os.path.join(ROOT, 'template', f'{region}.tmpl.html'), encoding='utf-8').read()
    ddir = os.path.join(ROOT, 'data', region)
    man = json.load(io.open(os.path.join(ddir, '_manifest.json'), encoding='utf-8'))

    for name in man['order']:
        raw = io.open(os.path.join(ddir, f'{name}.json'), encoding='utf-8').read()
        json.loads(raw)                                  # 넣기 전에 유효성 확인
        ph = '{{%s}}' % name
        if tpl.count(ph) != 1:
            raise SystemExit(f'[{name}] 플레이스홀더가 {tpl.count(ph)}개 — 1개여야 한다')
        tpl = tpl.replace(ph, raw, 1)

    left = [n for n in man['order'] if ('{{%s}}' % n) in tpl]
    if left:
        raise SystemExit(f'치환되지 않은 플레이스홀더: {left}')
    return tpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('region', nargs='?', default='seogu')
    ap.add_argument('-o', '--out', help='출력 경로 (기본: 저장소 루트의 <region>.html)')
    ap.add_argument('--check', action='store_true',
                    help='쓰지 않고 기존 파일과 대조만 한다')
    a = ap.parse_args()

    html = build(a.region)
    out = a.out or os.path.join(REPO, f'{a.region}.html')

    if os.path.basename(out) in FORBIDDEN:
        raise SystemExit(f'거부: {out} 은 공유 랜딩이라 덮어쓸 수 없다')

    new_md5 = hashlib.md5(html.encode('utf-8')).hexdigest()

    if a.check:
        cur = io.open(out, encoding='utf-8').read()
        cur_md5 = hashlib.md5(cur.encode('utf-8')).hexdigest()
        ok = cur_md5 == new_md5
        print(f'{a.region}: 기존 {cur_md5} / 재생성 {new_md5} → ' +
              ('일치 (재현 가능)' if ok else '불일치'))
        return 0 if ok else 1

    io.open(out, 'w', encoding='utf-8').write(html)
    print(f'{a.region}: {out} ({len(html.encode("utf-8")):,} B, md5 {new_md5})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
