#!/usr/bin/env python3
"""부산 시간대별 도로 속도 지도 — 최종 HTML 조립
  tmpl.html(__APP__) + app.js({{SEG}}{{SPD}}{{STAT}}) + data/*.json → busan-traffic.html
  --check 로 재현성 검증(기존 파일 md5와 비교)
"""
import hashlib, json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'busan-traffic.html')


def build():
    app = open(os.path.join(BASE, 'app.js'), encoding='utf-8').read()
    for name in ['SEG', 'SPD', 'STAT']:
        with open(os.path.join(BASE, 'data', name + '.json'), encoding='utf-8') as f:
            payload = f.read().strip()
        token = '{{' + name + '}}'
        if token not in app:
            raise SystemExit(f'플레이스홀더 {token} 없음')
        app = app.replace(token, payload)
    tmpl = open(os.path.join(BASE, 'tmpl.html'), encoding='utf-8').read()
    if '__APP__' not in tmpl:
        raise SystemExit('템플릿에 __APP__ 없음')
    return tmpl.replace('__APP__', app)


def main():
    html = build()
    md5 = hashlib.md5(html.encode('utf-8')).hexdigest()
    if '--check' in sys.argv:
        if not os.path.exists(OUT):
            raise SystemExit('기존 산출물 없음')
        old = hashlib.md5(open(OUT, encoding='utf-8').read().encode('utf-8')).hexdigest()
        print(f'기존 {old} / 재생성 {md5} → ' + ('일치 (재현 가능)' if old == md5 else '🔴 불일치'))
        raise SystemExit(0 if old == md5 else 1)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'busan-traffic.html ({len(html.encode("utf-8")):,} B, md5 {md5})')


if __name__ == '__main__':
    main()
