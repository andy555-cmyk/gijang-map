#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공장등록현황 CSV -> 지오코딩 -> build/data/<region>/IND.json

원천: data.go.kr 파일데이터 `부산광역시_제조업 공장등록현황_251231.csv` (11,386행)
      컬럼: 순번 · 회사명 · 공장대표주소 · 업종명 · 전화번호  (cp949)
      ⚠ 종업원수·용지면적 컬럼은 없다. 고용은 별도 원천(KOSIS 사업체조사)이 필요하다.

왜 이걸 쓰나: 건축HUB(data.go.kr 오픈API)가 2026-07-29~08-02 개편으로 막혀
  건축물 용도(=공장 판정)를 못 받는다. 공장등록현황은 **파일데이터**라 개편 영향이 없고,
  회사명·업종까지 붙어 있어 오히려 더 낫다.

지오코딩은 VWorld 주소검색 API. **맥에서만 된다**(클라우드는 IP 차단).
    export VW_KEY=...
    python3 build/geocode_ind.py saha

캐시: build/vw/<region>/geocache.json — 재실행 시 이미 찍은 주소는 건너뛴다.
"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
ADDR = 'https://api.vworld.kr/req/address'


def norm_addr(a):
    """VWorld 가 먹는 형태로 정리한다.
    '부산광역시 사하구 다대로354번안길 20, 2층(장림동)' -> '부산광역시 사하구 다대로354번안길 20'
    """
    a = (a or '').strip()
    a = re.sub(r'\([^)]*\)', ' ', a)      # (장림동) 같은 괄호 제거
    a = a.split(',')[0]                   # 동/층/호 등 부가정보 절단
    a = re.sub(r'\s+', ' ', a).strip()
    return a


def dong_of(a, dongs):
    for d in dongs:
        if d in (a or ''):
            return d
    return None


def geocode(key, addr, typ='ROAD', tries=3):
    q = {'service': 'address', 'request': 'getCoord', 'version': '2.0',
         'crs': 'EPSG:4326', 'type': typ, 'address': addr,
         'format': 'json', 'key': key, 'refine': 'true', 'simple': 'false'}
    url = ADDR + '?' + urllib.parse.urlencode(q)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'hayday/1.0'})
            raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
            j = json.loads(raw)
            res = j.get('response', {})
            if res.get('status') != 'OK':
                return None, res.get('status')
            pt = ((res.get('result') or {}).get('point') or {})
            x, y = pt.get('x'), pt.get('y')
            if x and y:
                return (round(float(x), 6), round(float(y), 6)), 'OK'
            return None, 'NO_POINT'
        except Exception as e:                      # noqa: BLE001
            if i == tries - 1:
                return None, 'EXC:' + type(e).__name__
            time.sleep(1.5 * (i + 1))
    return None, 'FAIL'


def main():
    region = sys.argv[1] if len(sys.argv) > 1 else 'saha'
    cfg = json.load(io.open(os.path.join(ROOT, 'regions', region + '.json'), encoding='utf-8'))
    dongs = cfg.get('emd_names') or []
    gu = cfg.get('sigungu_name') or ''
    key = os.environ.get('VW_KEY')
    if not key:
        raise SystemExit('VW_KEY 환경변수가 없다 (값은 노션 API 키 관리대장)')

    vd = os.path.join(ROOT, 'vw', region)
    raw_dir = os.path.join(vd, 'raw')
    src = None
    for f in sorted(os.listdir(raw_dir)):
        if '공장등록' in f and f.lower().endswith('.csv'):
            src = os.path.join(raw_dir, f)
            break
    if not src:
        raise SystemExit('공장등록현황 CSV 를 %s 에서 못 찾았다' % raw_dir)

    blob = open(src, 'rb').read()
    txt = None
    for enc in ('cp949', 'utf-8-sig', 'utf-8'):
        try:
            txt = blob.decode(enc)
            print('CSV %s (%s)' % (os.path.basename(src), enc))
            break
        except Exception:
            continue
    rows = list(csv.DictReader(io.StringIO(txt)))
    print('전체 %d행' % len(rows))

    tgt = []
    for r in rows:
        a = r.get('공장대표주소') or ''
        if gu and gu not in a:
            continue
        d = dong_of(a, dongs)
        if not d:
            continue
        tgt.append({'n': (r.get('회사명') or '').strip(),
                    'a': a.strip(),
                    'q': norm_addr(a),
                    'u': (r.get('업종명') or '').strip(),
                    'd': d})
    print('대상 %s %s -> %d개 업체' % (gu, '/'.join(dongs), len(tgt)))

    cpath = os.path.join(vd, 'geocache.json')
    cache = json.load(io.open(cpath, encoding='utf-8')) if os.path.exists(cpath) else {}
    print('캐시 %d건' % len(cache))

    stat = {'cache': 0, 'road': 0, 'parcel': 0, 'fail': 0}
    for i, t in enumerate(tgt, 1):
        q = t['q']
        if q in cache:
            t['lon'], t['lat'] = cache[q] if cache[q] else (None, None)
            stat['cache'] += 1
        else:
            pt, st = geocode(key, q, 'ROAD')
            kind = 'road'
            if not pt:
                pt, st = geocode(key, q, 'PARCEL')
                kind = 'parcel'
            cache[q] = list(pt) if pt else None
            t['lon'], t['lat'] = (pt if pt else (None, None))
            stat[kind if pt else 'fail'] += 1
            if i % 25 == 0:
                json.dump(cache, io.open(cpath, 'w', encoding='utf-8'), ensure_ascii=False)
                print('  %d/%d  road=%d parcel=%d fail=%d cache=%d'
                      % (i, len(tgt), stat['road'], stat['parcel'], stat['fail'], stat['cache']),
                      flush=True)
    json.dump(cache, io.open(cpath, 'w', encoding='utf-8'), ensure_ascii=False)

    ok = [t for t in tgt if t.get('lon')]
    bad = [t for t in tgt if not t.get('lon')]

    # 업종 사전 압축 (BD 의 uk 방식과 동일)
    ind_k, feats = [], []
    for t in ok:
        u = t['u']
        if u not in ind_k:
            ind_k.append(u)
        feats.append([t['n'], t['d'], ind_k.index(u), t['lon'], t['lat']])

    from collections import Counter
    by_dong = Counter(t['d'] for t in ok)
    by_ind = Counter(t['u'].split(' 외 ')[0] for t in ok)

    IND = {'src': os.path.basename(src),
           'note': '종업원수 없음 — 고용은 KOSIS 사업체조사 별도 원천 필요',
           'ik': ind_k,
           'by_dong': dict(by_dong),
           'total': len(ok), 'failed': len(bad),
           'f': feats}
    dd = os.path.join(ROOT, 'data', region)
    os.makedirs(dd, exist_ok=True)
    out = os.path.join(dd, 'IND.json')
    io.open(out, 'w', encoding='utf-8').write(
        json.dumps(IND, ensure_ascii=False, separators=(',', ':')))

    print('\n지오코딩 성공 %d / 실패 %d (성공률 %.1f%%)'
          % (len(ok), len(bad), len(ok) / max(1, len(tgt)) * 100))
    print('법정동별: %s' % dict(by_dong))
    print('업종 상위 10:')
    for k, v in by_ind.most_common(10):
        print('   %-40s %d' % (k[:40], v))
    print('-> %s (%s B)' % (out, format(os.path.getsize(out), ',')))
    if bad:
        bp = os.path.join(vd, 'geocode_fail.json')
        json.dump(bad, io.open(bp, 'w', encoding='utf-8'), ensure_ascii=False)
        print('실패 목록 -> %s' % bp)


if __name__ == '__main__':
    main()
