#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""파이프라인 전반부 재작성본 (2026-07-30)

소멸한 원래 build.py의 대체본. gen.py(후반부)가 먹을 수 있는
build/data/<region>/*.json 를 원자료부터 만든다.

    [1] VWorld 수집      -> build/vw/<region>/*.json
    [2] 법정동 스캔      -> vw/adm.json 에서 확정
    [3] 건축HUB 표제부   -> build/vw/<region>/hub_all.json
    [4] 공간조인·PNU 페어링 -> build/data/<region>/*.json
                              -> gen.py 로 <region>.html

핵심 제약 (실측 2026-07-30):
  * VWorld 는 클라우드 컨테이너에서 완전 차단된다(http=000). **맥에서만 실행된다.**
  * 건축HUB 표제부 원천은 BldRgstHubService/getBrTitleInfo 다.
    ArchPmsHubService/getApBasisOulnInfo 는 403 — 활용신청 안 됨. 쓰지 마라.
  * 좌표변환 단계는 없앴다. VWorld 에 crs=EPSG:4326 을 요청해 처음부터 WGS84 로 받는다.

키는 환경변수로만 받는다. 파일·인자로 넘기지 마라.
    export VW_KEY=...      # VWorld
    export HUB_KEY=...     # data.go.kr (건축HUB)

사용법:
    python3 build/build.py saha --step 1      # VWorld 수집만
    python3 build/build.py saha --step 3      # 건축HUB 수집만
    python3 build/build.py saha --step 4      # 조인·데이터셋 생성만
    python3 build/build.py saha               # 1~4 전부
    python3 build/build.py saha --dry         # 요청 계획만 출력 (키 불필요)
"""
import argparse, io, json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, os.pardir))
VW = 'https://api.vworld.kr/req/data'
HUB = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo'

# ── VWorld 레이어 (실측으로 작동 확인된 것만) ──────────────────────────
# LP_PA_CBND_BONBUN(ERROR) / LT_C_UQ112 / LT_C_UQ121 (NOT_FOUND) 는 쓰지 않는다.
LAYERS = {
    'adm':  'LT_C_ADEMD_INFO',    # 법정동 경계
    'sigg': 'LT_C_ADSIGG_INFO',   # 시군구 경계
    'zon':  'LT_C_UQ111',         # 용도지역
    'bld':  'LT_C_SPBD',          # 건물
    'par':  'LP_PA_CBND_BUBUN',   # 지적(부번)
}


def die(msg):
    raise SystemExit('[중단] ' + msg)


def cfg_path(region):
    return os.path.join(ROOT, 'regions', region + '.json')


def load_cfg(region):
    p = cfg_path(region)
    if not os.path.exists(p):
        die('지역 설정이 없다: %s\n     regions/%s.json 을 먼저 만들어라.' % (p, region))
    return json.load(io.open(p, encoding='utf-8'))


def vwdir(region):
    d = os.path.join(ROOT, 'vw', region)
    os.makedirs(d, exist_ok=True)
    return d


def datadir(region):
    d = os.path.join(ROOT, 'data', region)
    os.makedirs(d, exist_ok=True)
    return d


def get(url, tries=4, timeout=60):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'hayday-map/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:                      # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    die('요청 실패(%d회): %s\n     %s' % (tries, last, url[:160]))


# ── [1] VWorld 수집 ───────────────────────────────────────────────────
def vw_url(key, layer, page, size, geom=None, attr=None):
    q = {
        'service': 'data', 'request': 'GetFeature', 'version': '2.0',
        'key': key, 'format': 'json', 'crs': 'EPSG:4326',
        'data': layer, 'size': str(size), 'page': str(page),
        'domain': 'localhost', 'geometry': 'true', 'attribute': 'true',
    }
    if geom:
        q['geomFilter'] = geom
    if attr:
        q['attrFilter'] = attr
    return VW + '?' + urllib.parse.urlencode(q, safe=':,()[]')


def vw_fetch(key, layer, geom=None, attr=None, size=1000, cap=200):
    """페이징으로 전량 회수. VWorld 는 size 최대 1000."""
    feats, page = [], 1
    while page <= cap:
        raw = get(vw_url(key, layer, page, size, geom, attr))
        try:
            j = json.loads(raw)
        except ValueError:
            die('%s: JSON 아님 — %s' % (layer, raw[:200]))
        res = j.get('response', {})
        st = res.get('status')
        if st == 'ERROR':
            err = res.get('error', {})
            code = err.get('code')
            if code == 'INVALID_RANGE':
                # geomFilter 면적 한도 초과. 타일 분할로 풀어야 한다.
                raise RangeTooBig('%s: %s' % (layer, err.get('text')))
            die('%s: %s %s' % (layer, code, err.get('text')))
        if st == 'NOT_FOUND':
            break
        fc = (res.get('result') or {}).get('featureCollection') or {}
        got = fc.get('features') or []
        feats.extend(got)
        total = int(((res.get('record') or {}).get('total')) or 0)
        print('    %s p%-3d +%-5d / total %s' % (layer, page, len(got), total or '?'))
        if len(got) < size or (total and len(feats) >= total):
            break
        page += 1
    return feats


class RangeTooBig(Exception):
    pass


# ── geomFilter 면적 한도 대응: 타일 분할 ───────────────────────────────
# 실측 2026-07-30: VWorld 는 geomFilter(BOX/POLYGON) 요청 면적을 10km² 로 제한한다.
#   LP_PA_CBND_BUBUN(지적) 에서 INVALID_RANGE 로 걸린다. LT_C_UQ111 은 170km² 도 통과했다.
#   레이어별로 다르므로 통째로 시도 → 걸리면 타일 분할로 자동 폴백한다.
KM_PER_DEG_LAT = 110.9
TILE_KM = 2.8                      # 2.8 x 2.8 = 7.84km² (10km² 한도에 여유)


def km_per_deg_lon(lat):
    return 111.32 * math.cos(math.radians(lat))


def tiles_for(bb, keep_mp, tile_km=TILE_KM):
    """bbox 를 tile_km 격자로 쪼갠다. 대상 폴리곤 bbox 와 겹치지 않는 칸은 버린다."""
    minx, miny, maxx, maxy = bb
    dlat = tile_km / KM_PER_DEG_LAT
    out = []
    y = miny
    while y < maxy:
        y2 = min(y + dlat, maxy)
        dlon = tile_km / max(1e-6, km_per_deg_lon((y + y2) / 2.0))
        x = minx
        while x < maxx:
            x2 = min(x + dlon, maxx)
            cell = (x, y, x2, y2)
            if any(not (cell[2] < b[0] or cell[0] > b[2] or
                        cell[3] < b[1] or cell[1] > b[3]) for b in keep_mp):
                out.append((round(x, 6), round(y, 6), round(x2, 6), round(y2, 6)))
            x = x2
        y = y2
    return out


def feat_id(f):
    p = f.get('properties') or {}
    for k in ('id', 'ID', 'pnu', 'PNU', 'gid', 'uid', 'bld_nm'):
        if p.get(k):
            return str(p[k])
    return json.dumps([p, (f.get('geometry') or {}).get('coordinates')],
                      sort_keys=True, ensure_ascii=False)[:400]


def vw_fetch_tiled(key, layer, bb, keep_bbs, attr=None):
    """먼저 통짜로 시도하고 INVALID_RANGE 면 타일 분할로 폴백한다."""
    geom = 'BOX(%s,%s,%s,%s)' % tuple(bb)
    try:
        return vw_fetch(key, layer, geom=geom, attr=attr)
    except RangeTooBig as e:
        print('    ! %s — 타일 분할로 전환' % e)
    tl = tiles_for(bb, keep_bbs)
    print('    %s 타일 %d칸 (%.1fkm 격자)' % (layer, len(tl), TILE_KM))
    seen, feats = set(), []
    for i, c in enumerate(tl, 1):
        g = 'BOX(%s,%s,%s,%s)' % c
        try:
            got = vw_fetch(key, layer, geom=g, attr=attr)
        except RangeTooBig:
            die('%s: 타일(%s)조차 한도 초과. TILE_KM 을 줄여라.' % (layer, g))
        new = 0
        for f in got:
            fid = feat_id(f)
            if fid in seen:
                continue
            seen.add(fid)
            feats.append(f)
            new += 1
        print('      tile %d/%d +%d (누적 %d)' % (i, len(tl), new, len(feats)))
    return feats


def step1(region, cfg, key):
    """bbox 는 손으로 넣지 않는다. 대상 법정동 폴리곤에서 자동 산출한다.
    손으로 추정하면 구역이 잘리거나 불필요하게 넓어진다."""
    vd = vwdir(region)
    sgg = cfg['sigungu_cd']
    keep = cfg.get('emd_names')

    out = {}
    out['adm'] = vw_fetch(key, LAYERS['adm'], attr='emd_cd:LIKE:%s' % sgg)
    out['sigg'] = vw_fetch(key, LAYERS['sigg'], attr='sig_cd:=:%s' % sgg)
    if not out['adm']:
        die('[1] 법정동을 못 받았다. 시군구 코드(%s)를 확인하라.' % sgg)

    tgt = [f for f in out['adm']
           if (not keep) or (f.get('properties', {}).get('emd_kor_nm') in keep)]
    if keep and not tgt:
        die('[1] 대상동(%s)이 반환 목록에 없다: %s'
            % (keep, [f.get('properties', {}).get('emd_kor_nm') for f in out['adm']]))

    # ⚠ 도서(섬)를 반드시 걸러야 한다. 실측: 다대동에 앞바다 섬들이 포함돼 있어
    #    통짜 bbox 가 남북 22km / 170.5km² 로 폭발했다(VWorld 한도 10km² 초과).
    polys = []                                   # (면적, bbox, 소속동)
    for f in tgt:
        nm = f.get('properties', {}).get('emd_kor_nm')
        for poly in rings_of(f.get('geometry')):
            if not poly:
                continue
            a = ring_area(poly[0])
            b = bbox_of([poly])
            if b:
                polys.append((a, b, nm))
    if not polys:
        die('[1] 대상동 경계에서 폴리곤을 못 얻었다.')
    polys.sort(key=lambda t: -t[0])
    tot_a = sum(p[0] for p in polys)
    min_frac = float(cfg.get('island_min_frac', 0.01))   # 전체 면적의 1% 미만 = 도서로 본다
    keep_p = [p for p in polys if p[0] >= tot_a * min_frac]
    drop_p = [p for p in polys if p[0] < tot_a * min_frac]
    if drop_p:
        print('    도서·자잘한 폴리곤 %d개 제외 (본섬 %d개 유지)' % (len(drop_p), len(keep_p)))

    def union_bb(ps):
        bb = None
        for _, b, _ in ps:
            bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]),
                                       max(bb[2], b[2]), max(bb[3], b[3]))
        return bb

    bb = union_bb(keep_p)
    pad = float(cfg.get('bbox_pad', 0.002))       # 약 200m 여유
    if cfg.get('bbox'):                          # 설정이 명시하면 그것을 쓴다
        box = tuple(cfg['bbox'])
        print('    bbox(설정 고정) %s' % (box,))
    else:
        box = (round(bb[0] - pad, 6), round(bb[1] - pad, 6),
               round(bb[2] + pad, 6), round(bb[3] + pad, 6))
    w = (box[2] - box[0]) * km_per_deg_lon((box[1] + box[3]) / 2.0)
    h = (box[3] - box[1]) * KM_PER_DEG_LAT
    print('    bbox(자동) BOX(%s,%s,%s,%s)  %.1f x %.1f km = %.1f km²  ← 대상동 %d개'
          % (box + (w, h, w * h, len(tgt))))
    keep_bbs = [b for _, b, _ in keep_p]
    json.dump({'bbox': list(box), 'km2': round(w * h, 2),
               'from': [f['properties'].get('emd_kor_nm') for f in tgt],
               'islands_dropped': len(drop_p)},
              io.open(os.path.join(vd, 'bbox.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)

    out['zon'] = vw_fetch_tiled(key, LAYERS['zon'], box, keep_bbs)
    out['par'] = vw_fetch_tiled(key, LAYERS['par'], box, keep_bbs)
    out['bld'] = vw_fetch_tiled(key, LAYERS['bld'], box, keep_bbs)

    for k, v in out.items():
        p = os.path.join(vd, k + '.json')
        json.dump(v, io.open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        print('  [1] %-5s %6d feats -> %s' % (k, len(v), os.path.basename(p)))
    return out


# ── [2] 법정동 스캔 ───────────────────────────────────────────────────
def step2(region, cfg):
    vd = vwdir(region)
    adm = json.load(io.open(os.path.join(vd, 'adm.json'), encoding='utf-8'))
    rows = []
    for f in adm:
        p = f.get('properties', {})
        rows.append({'c': p.get('emd_cd'), 'n': p.get('emd_kor_nm')})
    keep = cfg.get('emd_names')
    print('  [2] 법정동 %d개: %s' % (len(rows), ', '.join(r['n'] or '?' for r in rows)))
    if keep:
        miss = [n for n in keep if n not in [r['n'] for r in rows]]
        if miss:
            die('설정의 emd_names 중 실제로 없는 동: %s' % miss)
        print('  [2] 대상 %d개로 한정: %s' % (len(keep), ', '.join(keep)))
    return rows


# ── [3] 건축HUB 표제부 ────────────────────────────────────────────────
def hub_url(key, sgg, bjd, page, rows=1000):
    q = {'serviceKey': key, 'sigunguCd': sgg, 'bjdongCd': bjd,
         'numOfRows': str(rows), 'pageNo': str(page), '_type': 'json'}
    return HUB + '?' + urllib.parse.urlencode(q, safe='')


def bjdong_cd(emd_cd):
    """건축HUB 의 bjdongCd 는 법정동코드 10자리 중 읍면동(3)+리(2) = 5자리다.

    ⚠ 실측 2026-07-30: VWorld `LT_C_ADEMD_INFO` 의 `emd_cd` 는 **8자리**로 온다
      (예: 사하구 신평동 `26380104`). 그래서 `cd[5:10]` 로 자르면 `104` 가 되어
      건축HUB 가 JSON 아닌 빈 바디를 돌려주고 `json.loads` 에서 터진다.
      8자리면 리코드 `00` 을 붙여 5자리로 만들어야 한다 → `10400`.
    """
    cd = (emd_cd or '').strip()
    if len(cd) >= 10:
        return cd[5:10]
    if len(cd) == 8:
        return cd[5:8] + '00'
    return ''


def step3(region, cfg, key):
    """표제부는 법정동(bjdongCd) 단위로 긁는다."""
    vd = vwdir(region)
    adm = json.load(io.open(os.path.join(vd, 'adm.json'), encoding='utf-8'))
    keep = cfg.get('emd_names')
    sgg = cfg['sigungu_cd']

    targets = []
    for f in adm:
        p = f.get('properties', {})
        nm, cd = p.get('emd_kor_nm'), (p.get('emd_cd') or '')
        if keep and nm not in keep:
            continue
        bjd = bjdong_cd(cd)
        if bjd:
            targets.append((nm, bjd))
        else:
            print('    ! %s: emd_cd=%r 에서 bjdongCd 를 못 만들었다' % (nm, cd))
    if not targets:
        die('[3] 대상 법정동을 못 잡았다. adm.json 의 emd_cd 를 확인하라.')
    print('    대상 법정동: %s' % ', '.join('%s(%s)' % t for t in targets))

    allrows = []
    for nm, bjd in targets:
        page = 1
        while page <= 60:
            raw = get(hub_url(key, sgg, bjd, page))
            st = raw.lstrip()[:1]
            if st == '<':
                die('[3] XML 응답(키·활용신청 확인): %s' % raw[:240])
            if st not in ('{', '['):
                # 빈 바디·평문 에러. bjdongCd 자릿수 오류가 대표적 원인이다.
                die('[3] JSON 아님 (bjdongCd=%s len=%d) 원문 200자: %r'
                    % (bjd, len(raw), raw[:200]))
            j = json.loads(raw)
            hd = ((j.get('response') or {}).get('header') or {})
            if hd.get('resultCode') not in (None, '00', '0'):
                die('[3] API 오류 %s %s' % (hd.get('resultCode'), hd.get('resultMsg')))
            body = ((j.get('response') or {}).get('body') or {})
            items = (body.get('items') or {})
            it = items.get('item') if isinstance(items, dict) else items
            if it is None:
                it = []
            if isinstance(it, dict):
                it = [it]
            allrows.extend(it)
            total = int(body.get('totalCount') or 0)
            print('    hub %s(%s) p%-2d +%-5d / total %d' % (nm, bjd, page, len(it), total))
            if len(it) < 1000 or len(allrows) >= total:
                break
            page += 1
    p = os.path.join(vd, 'hub_all.json')
    json.dump(allrows, io.open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    print('  [3] 표제부 %d건 -> %s' % (len(allrows), os.path.basename(p)))
    return allrows


# ── 기하 유틸 (stdlib 만. shapely 없이) ──────────────────────────────
def rings_of(geom):
    """Polygon/MultiPolygon -> MultiPolygon 좌표(3중 리스트)로 정규화."""
    if not geom:
        return []
    t, c = geom.get('type'), geom.get('coordinates')
    if not c:
        return []
    if t == 'Polygon':
        return [c]
    if t == 'MultiPolygon':
        return c
    return []


def ring_area(r):
    s = 0.0
    for i in range(len(r) - 1):
        x1, y1 = r[i][0], r[i][1]
        x2, y2 = r[i + 1][0], r[i + 1][1]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def centroid(mp):
    """면적 가중 중심점. 위경도 평균이 아니라 폴리곤 중심."""
    tx = ty = ta = 0.0
    for poly in mp:
        if not poly:
            continue
        r = poly[0]
        a = ring_area(r) or 1e-12
        cx = sum(p[0] for p in r[:-1]) / max(1, len(r) - 1)
        cy = sum(p[1] for p in r[:-1]) / max(1, len(r) - 1)
        tx += cx * a
        ty += cy * a
        ta += a
    if ta == 0:
        return None
    return (tx / ta, ty / ta)


def pt_in_ring(x, y, r):
    inside = False
    n = len(r)
    for i in range(n - 1):
        x1, y1 = r[i][0], r[i][1]
        x2, y2 = r[i + 1][0], r[i + 1][1]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if x < xi:
                inside = not inside
    return inside


def pt_in_mp(x, y, mp):
    for poly in mp:
        if not poly:
            continue
        if pt_in_ring(x, y, poly[0]):
            if not any(pt_in_ring(x, y, h) for h in poly[1:]):
                return True
    return False


def bbox_of(mp):
    xs, ys = [], []
    for poly in mp:
        for r in poly:
            for p in r:
                xs.append(p[0])
                ys.append(p[1])
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


class Index(object):
    """bbox 사전검사 + point-in-polygon. 수만 건 규모에서 충분히 빠르다."""

    def __init__(self, feats, keyfn):
        self.items = []
        for f in feats:
            mp = rings_of(f.get('geometry'))
            bb = bbox_of(mp)
            if bb:
                self.items.append((bb, mp, keyfn(f)))

    def hit(self, x, y):
        for bb, mp, val in self.items:
            if bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3] and pt_in_mp(x, y, mp):
                return val
        return None


# ── [4] 조인 → 데이터셋 ───────────────────────────────────────────────
def r5(v):
    try:
        return round(float(v), 6)
    except (TypeError, ValueError):
        return v


def thin(mp):
    return [[[[r5(p[0]), r5(p[1])] for p in ring] for ring in poly] for poly in mp]


def step4(region, cfg):
    vd, dd = vwdir(region), datadir(region)
    L = lambda n: json.load(io.open(os.path.join(vd, n + '.json'), encoding='utf-8'))
    adm, sigg, zon, par, bld = L('adm'), L('sigg'), L('zon'), L('par'), L('bld')
    hub = L('hub_all') if os.path.exists(os.path.join(vd, 'hub_all.json')) else []

    keep = cfg.get('emd_names')
    old_yr = int(cfg.get('old_year', 30))
    base_yr = int(cfg.get('base_year', 2026))
    cut = base_yr - old_yr
    ind_zones = cfg.get('site_zones') or ['일반공업지역', '준공업지역', '전용공업지역']

    # --- EMD / EMDV / SIGG
    emd_feats, emd_keep = [], []
    for f in adm:
        p = f.get('properties', {})
        nm = p.get('emd_kor_nm')
        mp = thin(rings_of(f.get('geometry')))
        ft = {'type': 'Feature',
              'properties': {'n': nm, 'c': p.get('emd_cd')},
              'geometry': {'type': 'MultiPolygon', 'coordinates': mp}}
        emd_feats.append(ft)
        if not keep or nm in keep:
            emd_keep.append(ft)
    EMD = {'type': 'FeatureCollection', 'features': emd_feats}
    EMDV = {'type': 'FeatureCollection', 'features': emd_keep}

    sg = sigg[0] if sigg else None
    SIGG = ({'type': 'Feature',
             'properties': {'n': (sg.get('properties') or {}).get('sig_kor_nm'),
                            'c': (sg.get('properties') or {}).get('sig_cd')},
             'geometry': {'type': 'MultiPolygon',
                          'coordinates': thin(rings_of(sg.get('geometry')))}}
            if sg else {})

    # --- 대상지(SITE): 대상 법정동 ∩ 공업지역. 산단 경계 근사.
    site_polys, zon_feats, zk = [], [], []
    emd_idx = Index(emd_keep, lambda f: f['properties']['n'])
    # ⚠ 실측 2026-07-30: LT_C_UQ111 의 용도지역명 필드는 **`uname`** 이다.
    #    `prpos_area_dstrc_nm` 로 읽으면 전부 빈 문자열이 되어 대상지(SITE)가 0 폴리곤이 된다.
    #    지정연도는 `dyear` (용도지역 지정연도 — 건물 준공연도가 아니다. 노후도 대체재 아님).
    #    또 bbox 가 사각형이라 인접 시군구가 섞인다 → `sigg_name` 으로 한 번 더 걸러낸다.
    sgg_nm = cfg.get('sigungu_name')
    for f in zon:
        p = f.get('properties', {})
        u = p.get('uname') or p.get('prpos_area_dstrc_nm') or p.get('u') or ''
        if sgg_nm and p.get('sigg_name') and p.get('sigg_name') != sgg_nm:
            continue
        mp = rings_of(f.get('geometry'))
        c = centroid(mp)
        if not c:
            continue
        inside = emd_idx.hit(c[0], c[1]) is not None
        if keep and not inside:
            continue
        if u not in zk:
            zk.append(u)
        zon_feats.append({'type': 'Feature',
                          'properties': {'u': u, 'col': cfg.get('zone_colors', {}).get(u, '#9aa5b1'),
                                         'y': str(p.get('dyear') or p.get('ntfc_de') or '')[:4]},
                          'geometry': {'type': 'MultiPolygon', 'coordinates': thin(mp)}})
        if u in ind_zones:
            site_polys.extend(thin(mp))
    ZONING = {'type': 'FeatureCollection', 'features': zon_feats}
    site_area = sum(ring_area(poly[0]) for poly in site_polys) * 1e10 / 1.0 if site_polys else 0
    SITE = {'type': 'Feature',
            'properties': {'n': cfg.get('site_name', region),
                           'zones': ind_zones,
                           'polys': len(site_polys),
                           'note': '공업지역 병합 근사 (원본 shp 미확보)'},
            'geometry': {'type': 'MultiPolygon', 'coordinates': site_polys}}
    if not site_polys:
        print('  ⚠ [4] 대상지(SITE) 폴리곤이 0이다. site_zones=%s 가 실제 용도지역명과 안 맞는다.' % ind_zones)
        print('       실제 값 목록: %s' % zk)
    site_idx = Index([SITE], lambda f: 1) if site_polys else None

    # --- 필지(SITEPAR)
    SITEPAR = []
    for f in par:
        p = f.get('properties', {})
        mp = rings_of(f.get('geometry'))
        c = centroid(mp)
        if not c or (site_idx and not site_idx.hit(c[0], c[1])):
            continue
        SITEPAR.append({'j': p.get('jibun') or p.get('bon_bun') or '',
                        'z': str(p.get('jiga') or p.get('pblntf_pclnd') or ''),
                        'a': round(float(p.get('lndpcl_ar') or p.get('area') or 0), 1)})

    # --- 건축HUB 표제부 인덱스
    # ⚠ 실측 2026-07-30: VWorld LT_C_SPBD 는 `bd_mgt_sn`(건물관리번호 25자리)을 100% 채워 준다.
    #    지번 페어링보다 이게 정확하다. HUB 쪽 대응 필드는 mgmBldrgstPk 계열로 보이나 `[확인 필요]`.
    #    HUB 응답을 실제로 받은 뒤 필드명을 확정하고 MGM_KEYS 를 고칠 것.
    MGM_KEYS = ('mgmBldrgstPk', 'mgmUpBldrgstPk', 'bdMgtSn')
    hub_by_mgm, hub_by_pnu, hub_by_jibun = {}, {}, {}
    for h in hub:
        pnu = (h.get('platPlc') or '').strip()
        key = '%s-%s' % (str(h.get('bun') or '').lstrip('0') or '0',
                         str(h.get('ji') or '').lstrip('0') or '0')
        rec = {'yr': str(h.get('useAprDay') or '')[:4],
               'u': (h.get('mainPurpsCdNm') or '').strip(),
               'levels': h.get('grndFlrCnt'),
               'a': h.get('totArea') or h.get('archArea'),
               'hh': h.get('hhldCnt') or 0,
               'nm': (h.get('bldNm') or '').strip()}
        for mk in MGM_KEYS:
            v = str(h.get(mk) or '').strip()
            if v:
                hub_by_mgm.setdefault(v, rec)
        if pnu:
            hub_by_pnu[pnu] = rec
        hub_by_jibun.setdefault(key, rec)

    # --- 건축물(BD) : 서구판과 동일한 10필드 압축 포맷
    #     [levels, ab, yr, site, zk_idx, uk_idx, area, hh, cc, geometry]
    uk, f_rows = [], []
    matched = yrn = oldn = 0
    zon_idx = Index(zon_feats, lambda f: f['properties']['u'])
    for f in bld:
        p = f.get('properties', {})
        mp = rings_of(f.get('geometry'))
        c = centroid(mp)
        if not c:
            continue
        if keep and emd_idx.hit(c[0], c[1]) is None:
            continue
        jib = '%s-%s' % (str(p.get('bon_bun') or '').lstrip('0') or '0',
                         str(p.get('bu_bun') or '').lstrip('0') or '0')
        mgm = str(p.get('bd_mgt_sn') or '').strip()
        h = (hub_by_mgm.get(mgm)
             or hub_by_pnu.get((p.get('addr') or '').strip())
             or hub_by_jibun.get(jib))
        if h:
            matched += 1
        yr = int(h['yr']) if (h and str(h.get('yr') or '').isdigit()) else 0
        if yr:
            yrn += 1
            if yr <= cut:
                oldn += 1
        use = (h or {}).get('u') or (p.get('bdtyp_cd') or '')
        if use not in uk:
            uk.append(use)
        z = zon_idx.hit(c[0], c[1]) or ''
        if z not in zk:
            zk.append(z)
        lv = (h or {}).get('levels') or p.get('gro_flo_co') or 0
        try:
            lv = int(float(lv))
        except (TypeError, ValueError):
            lv = 0
        ar = (h or {}).get('a') or p.get('area') or 0
        try:
            ar = round(float(ar), 1)
        except (TypeError, ValueError):
            ar = 0.0
        ab = 1 if h else 5                       # 5 = 대장 미등재 (서구판 규약)
        insite = 1 if (site_idx and site_idx.hit(c[0], c[1])) else 0
        f_rows.append([lv, ab, yr, insite, zk.index(z), uk.index(use), ar,
                       int((h or {}).get('hh') or 0), '', thin(mp)])
    BD = {'zk': zk, 'uk': uk, 'f': f_rows}

    # ⚠ 준공연도(yr)는 건축HUB 표제부(useAprDay)만이 원천이다.
    #    VWorld LT_C_SPBD 에는 준공연도·용도·구조가 없다(실측: 속성은 위치·도로명·
    #    bd_mgt_sn·gro_flo_co 뿐, gro_flo_co 조차 52.6% 만 채워짐).
    #    따라서 hub 가 비면 노후도 판정이 전부 0 이 된다 — 그 상태로 배포하지 마라.
    if not hub:
        print('  ⚠ [4] hub_all.json 이 비었다. 준공연도·용도가 없으므로 노후도(30년) 판정이 불가하다.')
        print('       건축HUB 가 복구된 뒤 --step 3 → --step 4 를 다시 돌려라.')

    # --- 산단 특화 파생: 공장 노후도 집계 (서구의 VAC/VD/CL 자리)
    fct_total = fct_old = 0
    per_dong = {}
    for r in f_rows:
        is_fct = uk[r[5]] == '공장'
        if not is_fct:
            continue
        fct_total += 1
        if r[2] and r[2] <= cut:
            fct_old += 1
    FCT = {'cut': cut, 'old_year': old_yr, 'base_year': base_yr,
           'total': fct_total, 'old': fct_old,
           'ratio': round(fct_old / fct_total * 100, 1) if fct_total else 0.0}

    stats = {'N': len(f_rows), 'MATCH': matched, 'YRN': yrn, 'OLDN': oldn,
             'OLDR': round(oldn / yrn * 100, 1) if yrn else 0.0,
             'UNZ': sum(1 for z in zk if not z),
             'FCT': FCT}

    ds = {'BD': BD, 'EMDV': EMDV, 'ZONING': ZONING, 'EMD': EMD, 'SIGG': SIGG,
          'SITE': SITE, 'SITEPAR': SITEPAR, 'FCT': FCT}
    order = ['BD', 'EMDV', 'ZONING', 'EMD', 'SIGG', 'SITE', 'SITEPAR', 'FCT']

    sizes = {}
    for n in order:
        raw = json.dumps(ds[n], ensure_ascii=False, separators=(',', ':'))
        io.open(os.path.join(dd, n + '.json'), 'w', encoding='utf-8').write(raw)
        sizes[n] = len(raw.encode('utf-8'))
    json.dump({'region': region, 'order': order, 'sizes': sizes,
               'stats': stats},
              io.open(os.path.join(dd, '_manifest.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print('  [4] 건축물 %d동 / 대장매칭 %d (%.1f%%) / 연도확보 %d / 노후(%d년↑) %d (%.1f%%)'
          % (len(f_rows), matched, matched / max(1, len(f_rows)) * 100, yrn,
             old_yr, oldn, stats['OLDR']))
    print('  [4] 공장 %d동 중 노후 %d동 (%.1f%%)' % (fct_total, fct_old, FCT['ratio']))
    print('  [4] 용도지역 %d 폴리곤 / 필지 %d / 대상지 폴리곤 %d'
          % (len(zon_feats), len(SITEPAR), len(site_polys)))
    for n in order:
        print('      %-8s %10s B' % (n, format(sizes[n], ',')))
    print('  [4] -> %s' % dd)
    print('\n  ⚠ 아직 없는 레이어: 입주기업체(IND) · 고용(EMP) · 마스터플랜 A~G(MP)')
    print('     원자료가 공공API에 없다. 에스큐브 건으로 수집 예정인 기업체 리스트·노동자 현황이 원천이다.')
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('region')
    ap.add_argument('--step', type=int, choices=[1, 2, 3, 4])
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    cfg = load_cfg(a.region)
    steps = [a.step] if a.step else [1, 2, 3, 4]

    if a.dry:
        print('지역 %s / 시군구 %s / 대상동 %s'
              % (a.region, cfg['sigungu_cd'], cfg.get('emd_names')))
        for k, v in LAYERS.items():
            print('  [1] %-5s %-20s %s'
                  % (k, v, 'geomFilter=BOX(대상동에서 자동산출)'
                     if k in ('zon', 'par', 'bld') else 'attrFilter'))
        print('  [3] %s  sigunguCd=%s' % (HUB, cfg['sigungu_cd']))
        return 0

    vk = os.environ.get('VW_KEY')
    hk = os.environ.get('HUB_KEY')
    if 1 in steps and not vk:
        die('VW_KEY 환경변수가 없다. export VW_KEY=... (값은 노션 API 키 트래커)')
    if 3 in steps and not hk:
        die('HUB_KEY 환경변수가 없다. export HUB_KEY=... (값은 노션 API 키 트래커)')

    t0 = time.time()
    if 1 in steps:
        print('[1] VWorld 수집')
        step1(a.region, cfg, vk)
    if 2 in steps:
        print('[2] 법정동 스캔')
        step2(a.region, cfg)
    if 3 in steps:
        print('[3] 건축HUB 표제부 수집')
        step3(a.region, cfg, hk)
    if 4 in steps:
        print('[4] 공간조인 · 데이터셋 생성')
        step4(a.region, cfg)
    print('완료 %.1fs' % (time.time() - t0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
