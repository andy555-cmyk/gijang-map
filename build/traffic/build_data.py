#!/usr/bin/env python3
"""부산 시간대별 교통 속도 지도 — 데이터 빌드

원천 3종 (전부 실측 확인, 2026-08-01)
  1) 부산광역시_지능형교통정보 구간레벨패턴정보 (data.go.kr 15041722)
     요일 / 시분 / 구간명 / 시점 / 종점 / 속도(시속)
     ⚠ 공개분은 18:00~18:55(5분 12스텝)만 들어있다. 24시간이 아니다.
  2) 부산광역시_지능형교통정보 링크정보 (15041723)  구간키 → 링크번호(표준노드링크 ID)
  3) 국토교통부 표준노드링크 MOCT_LINK.shp (its.go.kr)  링크번호 → 도로 형상

조인 실측: 패턴→링크 100.0% / 링크→SHP 96.4%
좌표계: EPSG:5186(ITRF2000 중부) → EPSG:4326
"""
import csv, glob, json, os, statistics, sys
from collections import defaultdict
import shapefile
from pyproj import Transformer

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'data')
os.makedirs(OUT, exist_ok=True)

DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
DAYK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


def read_csv(path):
    with open(path, encoding='euc-kr', errors='replace') as f:
        return list(csv.DictReader(f))


def main():
    # ── 1. 링크정보: 구간키 → 링크번호(복수 가능)
    lnk = read_csv(os.path.join(BASE, 'link.csv'))
    key2ids = defaultdict(list)
    id2key = {}
    for r in lnk:
        lid = r['링크번호'].strip()
        k = (r['링크명'].strip(), r['시점'].strip(), r['종점'].strip())
        key2ids[k].append(lid)
        id2key[lid] = k
    print(f'링크정보 {len(lnk):,}행 · 고유구간 {len(key2ids):,}')

    # ── 2. 패턴: 구간키 → 요일 → 12스텝 속도
    pat = read_csv(os.path.join(BASE, 'pattern.csv'))
    times = sorted({r['시분'] for r in pat})
    tidx = {t: i for i, t in enumerate(times)}
    didx = {d: i for i, d in enumerate(DAYS)}
    spd = defaultdict(lambda: [[None] * len(times) for _ in DAYS])
    for r in pat:
        k = (r['구간명'].strip(), r['시점'].strip(), r['종점'].strip())
        d = didx.get(r['요일'])
        t = tidx.get(r['시분'])
        if d is None or t is None:
            continue
        try:
            v = int(r['속도(시속)'])
        except (ValueError, TypeError):
            continue
        spd[k][d][t] = v
    print(f'패턴 {len(pat):,}행 · 구간 {len(spd):,} · 시각 {len(times)} ({times[0]}~{times[-1]})')

    # ── 3. 표준노드링크 형상
    shp = glob.glob(os.path.join(BASE, 'nl', '*', 'MOCT_LINK.shp'))[0]
    sf = shapefile.Reader(shp, encoding='cp949', encodingErrors='replace')
    flds = [f[0] for f in sf.fields[1:]]
    I = {n: i for i, n in enumerate(flds)}
    tr = Transformer.from_crs('EPSG:5186', 'EPSG:4326', always_xy=True)

    need = set(id2key)
    geom = {}
    meta = {}
    for sr in sf.iterShapeRecords():
        lid = sr.record[I['LINK_ID']]
        if lid not in need:
            continue
        pts = sr.shape.points
        if len(pts) < 2:
            continue
        xs, ys = zip(*pts)
        lons, lats = tr.transform(xs, ys)
        geom[lid] = [[round(a, 5), round(b, 5)] for a, b in zip(lons, lats)]
        meta[lid] = {
            'road': (sr.record[I['ROAD_NAME']] or '').strip(),
            'lanes': sr.record[I['LANES']],
            'maxspd': sr.record[I['MAX_SPD']],
        }
    print(f'형상 확보 {len(geom):,} / {len(need):,} ({len(geom)/len(need)*100:.1f}%)')

    # ── 4. 조립 — 속도가 있는 링크만
    segs, sp_all = [], [[] for _ in DAYS]
    nospd = 0
    for lid, k in sorted(id2key.items()):
        g = geom.get(lid)
        if not g:
            continue
        s = spd.get(k)
        if s is None:
            nospd += 1
            continue
        m = meta[lid]
        segs.append([k[0], k[1], k[2], m['road'], m['lanes'], m['maxspd'], g])
        for d in range(len(DAYS)):
            sp_all[d].append(s[d])
    print(f'최종 세그먼트 {len(segs):,} (형상○·속도✕ {nospd:,})')

    # ── 5. 통계 (환각 금지 — 전부 계산값)
    flat = [v for d in sp_all for row in d for v in row if v is not None]
    stat = {
        'n_seg': len(segs),
        'n_day': len(DAYS),
        'n_step': len(times),
        'times': times,
        'days': DAYK,
        'day_ko': [d[0] for d in DAYS],
        'spd_min': min(flat), 'spd_max': max(flat),
        'spd_mean': round(statistics.mean(flat), 1),
        'spd_med': statistics.median(flat),
        'total_obs': len(flat),
    }
    print('속도 분포 min/med/mean/max =',
          stat['spd_min'], stat['spd_med'], stat['spd_mean'], stat['spd_max'])

    # 요일별 평균
    stat['day_mean'] = []
    for d in range(len(DAYS)):
        vv = [v for row in sp_all[d] for v in row if v is not None]
        stat['day_mean'].append(round(statistics.mean(vv), 1) if vv else None)
    print('요일 평균', dict(zip(DAYK, stat['day_mean'])))

    # 상습 정체 구간 TOP 20 (전 요일·전 스텝 평균 속도 최저)
    rank = []
    for i, s in enumerate(segs):
        vv = [sp_all[d][i][t] for d in range(len(DAYS)) for t in range(len(times))
              if sp_all[d][i][t] is not None]
        if len(vv) < len(DAYS) * len(times) * 0.5:
            continue
        rank.append((round(statistics.mean(vv), 1), i))
    rank.sort()
    stat['slow20'] = [[v, i] for v, i in rank[:20]]
    stat['fast5'] = [[v, i] for v, i in rank[-5:]]

    bbox = [min(p[0] for s in segs for p in s[6]), min(p[1] for s in segs for p in s[6]),
            max(p[0] for s in segs for p in s[6]), max(p[1] for s in segs for p in s[6])]
    stat['bbox'] = [round(v, 5) for v in bbox]
    print('bbox', stat['bbox'])

    with open(os.path.join(OUT, 'SEG.json'), 'w', encoding='utf-8') as f:
        json.dump(segs, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'SPD.json'), 'w', encoding='utf-8') as f:
        json.dump(sp_all, f, separators=(',', ':'))
    with open(os.path.join(OUT, 'STAT.json'), 'w', encoding='utf-8') as f:
        json.dump(stat, f, ensure_ascii=False, separators=(',', ':'))

    for n in ['SEG', 'SPD', 'STAT']:
        p = os.path.join(OUT, n + '.json')
        print(f'  {n}.json {os.path.getsize(p)/1024/1024:.2f} MB')


if __name__ == '__main__':
    main()
