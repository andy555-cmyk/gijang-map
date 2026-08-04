#!/usr/bin/env python3
"""부산 시간대별 도로 속도 지도 — 데이터 빌드 (v2)

원천 3종 (전부 실측 확인, 2026-08-04)
  1) 부산광역시_지능형교통정보 구간레벨패턴정보 (data.go.kr 15041722)
     요일 / 시분 / 구간명 / 시점 / 종점 / 속도(시속)
     ⚠ 공개분은 18:00~18:55(5분 12스텝)만 들어있다. 24시간이 아니다.
  2) 부산광역시_지능형교통정보 링크정보 (15041723)  구간키 → 링크번호(표준노드링크 ID)
  3) 국토교통부 표준노드링크 MOCT_LINK.shp (its.go.kr)  링크번호 → 도로 형상·위계·차로·제한속도

v2 변경 (대표 피드백 08-04)
  · 🔴 절대속도만으로 줄 세우면 제한 30km/h 이면도로가 랭킹을 독식한다(실측: TOP10 중 6개).
    → **속도비(실제/제한)** 를 1차 지표로 올린다. 두 랭킹 TOP50 겹침이 23개뿐이었다.
  · 도로등급(ROAD_RANK)·차로수(LANES)·제한속도(MAX_SPD)·구간길이(LENGTH)를 세그먼트에 싣는다.
  · 지체시간 = 길이/실제속도 − 길이/제한속도 (초). 짧은 구간 과대평가를 잡는다.
  · **미관측 배경망(BASE)** 을 만든다. 관측 구간만 그리면 도로가 끊겨 보인다는 지적의 답이다.
"""
import csv, glob, json, math, os, statistics, sys
from collections import defaultdict
import shapefile
from pyproj import Transformer

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'data')
os.makedirs(OUT, exist_ok=True)

DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
DAYK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

# 국토부 표준노드링크 도로등급 코드
RANK = {'101': '고속도로', '102': '도시고속화도로', '103': '일반국도', '104': '특별·광역시도',
        '105': '국가지원지방도', '106': '지방도', '107': '시군도', '108': '기타'}
# 화면 필터용 묶음 — 위계가 8개면 칩이 너무 많다. 4개로 접는다.
def rank_group(r):
    if r in ('101', '102'):
        return 0          # 고속·도시고속
    if r in ('103', '105', '106'):
        return 1          # 국도·지방도
    if r == '104':
        return 2          # 광역시도(부산 간선의 78%)
    return 3              # 시군도·기타


def read_csv(path):
    with open(path, encoding='euc-kr', errors='replace') as f:
        return list(csv.DictReader(f))


def main():
    # ── 1. 링크정보: 구간키 → 링크번호
    lnk = read_csv(os.path.join(BASE, 'link.csv'))
    id2key = {}
    for r in lnk:
        id2key[r['링크번호'].strip()] = (r['링크명'].strip(), r['시점'].strip(), r['종점'].strip())
    print(f'링크정보 {len(lnk):,}행')

    # ── 2. 패턴: 구간키 → 요일 → 스텝별 속도
    pat = read_csv(os.path.join(BASE, 'pattern.csv'))
    times = sorted({r['시분'] for r in pat})
    tidx = {t: i for i, t in enumerate(times)}
    didx = {d: i for i, d in enumerate(DAYS)}
    spd = defaultdict(lambda: [[None] * len(times) for _ in DAYS])
    for r in pat:
        k = (r['구간명'].strip(), r['시점'].strip(), r['종점'].strip())
        d, t = didx.get(r['요일']), tidx.get(r['시분'])
        if d is None or t is None:
            continue
        try:
            spd[k][d][t] = int(r['속도(시속)'])
        except (ValueError, TypeError):
            pass
    print(f'패턴 {len(pat):,}행 · 구간 {len(spd):,} · 시각 {len(times)} ({times[0]}~{times[-1]})')

    # ── 3. 표준노드링크
    shp = glob.glob(os.path.join(BASE, 'nl', '*', 'MOCT_LINK.shp'))[0]
    sf = shapefile.Reader(shp, encoding='cp949', encodingErrors='replace')
    flds = [f[0] for f in sf.fields[1:]]
    I = {n: i for i, n in enumerate(flds)}
    tr = Transformer.from_crs('EPSG:5186', 'EPSG:4326', always_xy=True)

    need = set(id2key)
    obs, bg = {}, []
    # 부산 대략 bbox — 배경망을 이 안으로만 자른다(전국 155만 링크를 다 실을 수 없다)
    BB = (128.70, 34.98, 129.35, 35.42)

    for sr in sf.iterShapeRecords():
        rec = sr.record
        lid = rec[I['LINK_ID']]
        pts = sr.shape.points
        if len(pts) < 2:
            continue
        xs, ys = zip(*pts)
        lons, lats = tr.transform(xs, ys)
        inbb = (BB[0] <= lons[0] <= BB[2] and BB[1] <= lats[0] <= BB[3])
        if lid in need:
            obs[lid] = {
                'g': [[round(a, 5), round(b, 5)] for a, b in zip(lons, lats)],
                'rank': rec[I['ROAD_RANK']], 'lanes': rec[I['LANES']] or 0,
                'mx': rec[I['MAX_SPD']] or 0, 'len': rec[I['LENGTH']] or 0,
                'road': (rec[I['ROAD_NAME']] or '').strip(),
            }
        elif inbb:
            # 배경망 — 형태만 보이면 되는 시각 요소다. 정밀도를 과감히 낮춘다.
            #   · 100m 미만 링크 제외  · 좌표 4자리(≈11m)  · 중간점은 최대 6개로 솎음
            L = rec[I['LENGTH']] or 0
            if L < 100:
                continue
            g = [[round(a, 4), round(b, 4)] for a, b in zip(lons, lats)]
            if len(g) > 8:
                step = (len(g) - 1) / 7.0
                g = [g[int(round(i * step))] for i in range(8)]
            bg.append(g)
    print(f'관측 형상 {len(obs):,} / {len(need):,} ({len(obs)/len(need)*100:.1f}%)')
    print(f'배경망 {len(bg):,} 링크')

    # ── 4. 조립
    segs, sp_all = [], [[] for _ in DAYS]
    for lid, k in sorted(id2key.items()):
        o = obs.get(lid)
        s = spd.get(k)
        if not o or s is None:
            continue
        # 지체시간(초) — 전 요일·전 스텝 평균 속도 기준. 제한속도 대비 손실.
        vv = [v for row in s for v in row if v is not None]
        avg = statistics.mean(vv) if vv else None
        delay = None
        if avg and o['mx'] and o['len']:
            delay = round(o['len'] / 1000 * 3600 * (1 / avg - 1 / o['mx']), 1)
        segs.append([
            k[0], k[1], k[2],                    # 0 구간명 1 시점 2 종점
            o['road'], o['lanes'], o['mx'],      # 3 도로명 4 차로 5 제한속도
            rank_group(o['rank']), round(o['len']), delay,   # 6 등급군 7 길이(m) 8 지체(초)
            o['g']                               # 9 형상
        ])
        for d in range(len(DAYS)):
            sp_all[d].append(s[d])
    print(f'최종 세그먼트 {len(segs):,}')

    # ── 5. 통계 (전부 계산값 — 하드코딩 없음)
    flat = [v for d in sp_all for row in d for v in row if v is not None]
    RG = ['고속·도시고속', '국도·지방도', '광역시도', '시군도·기타']
    stat = {
        'n_seg': len(segs), 'n_bg': len(bg),
        'n_day': len(DAYS), 'n_step': len(times),
        'times': times, 'days': DAYK, 'day_ko': [d[0] for d in DAYS],
        'rank_ko': RG,
        'spd_min': min(flat), 'spd_max': max(flat),
        'spd_mean': round(statistics.mean(flat), 1),
        'spd_med': statistics.median(flat),
        'total_obs': len(flat),
    }

    # 요일별 평균
    stat['day_mean'] = []
    for d in range(len(DAYS)):
        vv = [v for row in sp_all[d] for v in row if v is not None]
        stat['day_mean'].append(round(statistics.mean(vv), 1) if vv else None)

    # 등급군별 요약 — 절대속도와 속도비를 나란히
    gsum = []
    for gi in range(len(RG)):
        idxs = [i for i, s in enumerate(segs) if s[6] == gi]
        a, r = [], []
        for i in idxs:
            vv = [sp_all[d][i][t] for d in range(len(DAYS)) for t in range(len(times))
                  if sp_all[d][i][t] is not None]
            if not vv:
                continue
            m = statistics.mean(vv)
            a.append(m)
            if segs[i][5]:
                r.append(m / segs[i][5] * 100)
        gsum.append({'n': len(idxs),
                     'abs': round(statistics.mean(a), 1) if a else None,
                     'ratio': round(statistics.mean(r), 1) if r else None})
    stat['rank_sum'] = gsum

    # 랭킹 — 속도비 기준(1차)과 절대속도 기준(대조군) 둘 다 낸다
    rows = []
    for i, s in enumerate(segs):
        vv = [sp_all[d][i][t] for d in range(len(DAYS)) for t in range(len(times))
              if sp_all[d][i][t] is not None]
        if len(vv) < len(DAYS) * len(times) * 0.5:
            continue
        m = statistics.mean(vv)
        rows.append({'i': i, 'abs': round(m, 1),
                     'ratio': round(m / s[5] * 100, 1) if s[5] else None,
                     'delay': s[8]})
    rr = [r for r in rows if r['ratio'] is not None]
    stat['rank_ratio'] = [[r['ratio'], r['i'], r['abs']] for r in sorted(rr, key=lambda x: x['ratio'])[:20]]
    stat['rank_abs'] = [[r['abs'], r['i'], r['ratio']] for r in sorted(rows, key=lambda x: x['abs'])[:20]]
    dd = [r for r in rows if r['delay'] is not None]
    stat['rank_delay'] = [[r['delay'], r['i'], r['abs']] for r in sorted(dd, key=lambda x: -x['delay'])[:20]]
    a50 = {r['i'] for r in sorted(rows, key=lambda x: x['abs'])[:50]}
    b50 = {r['i'] for r in sorted(rr, key=lambda x: x['ratio'])[:50]}
    stat['overlap50'] = len(a50 & b50)

    # ── 24시간 프로파일 ─────────────────────────────────────────────
    # 🔑 패턴정보(18:00~18:55)로는 하루가 안 보인다. 그래서 다른 파일을 붙인다.
    #    부산광역시_지능형교통정보_DSRC구간교통정보(15041717)는 주요 간선 138구간을
    #    2026-06-30 하루 00:00~23:45(15분 96스텝) 전 시간대로 담고 있다(실측).
    # ⚠ 구간명 체계가 링크정보와 달라(‘3부두-구덕교차로’ 식) 좌표를 붙일 수 없다.
    #    그래서 지도가 아니라 '곡선'으로만 쓴다. 없는 좌표를 추정해 그리지 않는다.
    h24 = None
    p24 = os.path.join(BASE, 'conn1.csv')
    if os.path.exists(p24):
        rows24 = read_csv(p24)
        byt = defaultdict(list)
        byseg = defaultdict(dict)
        for x in rows24:
            try:
                v = int(x['속도(시속)'])
            except (ValueError, TypeError):
                continue
            if v <= 0:
                continue
            hm = x['가공일시'][11:16]
            byt[hm].append(v)
            byseg[x['구간명'].strip()][hm] = v
        tt = sorted(byt)
        allc = [round(statistics.mean(byt[t]), 1) for t in tt]
        lo = min(range(len(tt)), key=lambda i: allc[i])
        hi = max(range(len(tt)), key=lambda i: allc[i])
        # 하루 평균이 낮은 구간 TOP 6 — 곡선을 겹쳐 그린다
        rank24 = sorted(((statistics.mean(v.values()), k) for k, v in byseg.items()
                         if len(v) >= len(tt) * 0.8))[:6]
        h24 = {
            'date': sorted({x['가공일시'][:10] for x in rows24})[0],
            'n_seg': len(byseg), 'times': tt, 'all': allc,
            'lo': [tt[lo], allc[lo]], 'hi': [tt[hi], allc[hi]],
            'segs': [[k, [byseg[k].get(t) for t in tt], round(m, 1)] for m, k in rank24],
        }
        print(f"24h 프로파일 {h24['n_seg']}구간 {len(tt)}스텝 · 최저 {h24['lo']} 최고 {h24['hi']}")
    stat['h24'] = h24

    pts = [p for s in segs for p in s[9]]
    stat['bbox'] = [round(min(p[0] for p in pts), 5), round(min(p[1] for p in pts), 5),
                    round(max(p[0] for p in pts), 5), round(max(p[1] for p in pts), 5)]

    print('등급군', {RG[i]: gsum[i] for i in range(len(RG))})
    print('두 랭킹 TOP50 겹침', stat['overlap50'])

    for name, obj in [('SEG', segs), ('SPD', sp_all), ('STAT', stat), ('BG', bg)]:
        p = os.path.join(OUT, name + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        print(f'  {name}.json {os.path.getsize(p)/1024/1024:.2f} MB')


if __name__ == '__main__':
    main()
