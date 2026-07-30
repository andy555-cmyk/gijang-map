#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""서구 템플릿에서 MapLibre 번들·CSS만 떼어내 사하구용 템플릿을 조립한다.

왜 서구 템플릿을 손보지 않고 새로 쓰나:
  서구 앱 스크립트(24KB)는 빈집(VAC/VD/CL) 로직이 판정·라벨·시뮬레이터까지 얽혀 있다.
  사하구는 노후주거지가 아니라 노후 산단이라 그 절반이 무의미하고, 도려내면 잔여 참조가 남는다.
  MapLibre 번들(802KB)과 MapLibre CSS(65KB)만 **바이트 그대로** 재사용하고
  앱 CSS·마크업·JS 는 산단용으로 새로 쓴다.

    python3 build/mk_saha_tmpl.py
      -> build/template/saha.tmpl.html
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(ROOT, 'template')
SRC = os.path.join(TPL, 'seogu.tmpl.html')
APP = os.path.join(ROOT, 'app_saha.js')
OUT = os.path.join(TPL, 'saha.tmpl.html')


def grab(s, tag, nth=0):
    """n번째 <tag>...</tag> 를 내용과 함께 그대로 잘라낸다."""
    hits = list(re.finditer(r'<%s[^>]*>' % tag, s))
    m = hits[nth]
    e = s.find('</%s>' % tag, m.end())
    return s[m.start():e + len(tag) + 3]


def main():
    s = io.open(SRC, encoding='utf-8').read()
    ml_css = grab(s, 'style', 0)          # MapLibre CSS (65KB)
    ml_js = grab(s, 'script', 0)          # MapLibre 번들 (802KB)
    if 'maplibregl' not in ml_js:
        raise SystemExit('MapLibre 번들을 못 잡았다. 서구 템플릿 구조가 바뀌었다.')
    app = io.open(APP, encoding='utf-8').read()
    print('MapLibre CSS %s B / 번들 %s B / 앱 %s B'
          % (format(len(ml_css), ','), format(len(ml_js), ','), format(len(app), ',')))

    css = """
<style>
:root{
  /* 서페이스 — dataviz 레퍼런스 dark 계열. 반투명 금지: 위성 위에서 글씨가 새어 안 읽힌다. */
  --page:#0b0d11; --surf:#15171b; --surf2:#1d2026; --line:#2c2e33; --line2:#3a3d44;
  --ink:#ffffff; --ink2:#c3c2b7; --ink3:#898781; --acc:#d95926; --acc2:#f0a882;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--page);color:var(--ink);overflow:hidden;
  font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#map{position:absolute;inset:44px 0 0}

/* ── 상단 바 ─────────────────────────────────────────── */
#bar{position:absolute;top:0;left:0;right:0;height:44px;z-index:20;display:flex;align-items:center;
  gap:14px;padding:0 14px;background:var(--surf);border-bottom:1px solid var(--line)}
.bd{font-weight:800;font-size:14px;letter-spacing:-.02em;white-space:nowrap}
.bd b{color:var(--acc2)}
.bsep{width:1px;height:18px;background:var(--line2)}
.btitle{font-size:12.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btitle b{color:var(--ink);font-weight:700}
#tabs{margin-left:auto;display:flex;gap:5px;flex:0 0 auto}
.tab{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:7px;
  padding:5px 11px;font:600 11.5px/1 inherit;text-decoration:none;white-space:nowrap;transition:.13s}
.tab:hover{color:var(--ink);border-color:var(--line2)}
.tab.on{background:var(--acc);border-color:var(--acc);color:#fff}
.vbtn{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:7px;
  padding:5px 10px;font:600 11.5px/1 inherit;cursor:pointer}
.vbtn:hover{color:var(--ink);border-color:var(--line2)}

/* ── 좌: 레이어 선택창 (남실장님 2026-07-27 지시 — 좌우 분리) ── */
#left{position:absolute;left:12px;top:56px;width:268px;z-index:10;display:flex;flex-direction:column;gap:9px;
  max-height:calc(100% - 68px)}
.card{background:var(--surf);border:1px solid var(--line);border-radius:11px;
  box-shadow:0 10px 34px rgba(0,0,0,.55)}
.chd{font:700 10px/1 inherit;letter-spacing:.1em;color:var(--ink3);padding:11px 13px 0}
#kpi{display:grid;grid-template-columns:1fr 1fr;gap:1px;padding:9px 13px 12px}
.k{padding:4px 0}
.k span{display:block;font-size:10.5px;color:var(--ink3);margin-bottom:1px}
.k b{font:700 17px/1.15 inherit;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.k b em{font-style:normal;font-size:10.5px;font-weight:500;color:var(--ink3);margin-left:2px}
#lbox{display:flex;flex-direction:column;gap:0;padding:6px}
.lb{display:flex;align-items:baseline;gap:7px;width:100%;background:none;border:0;color:var(--ink2);
  border-radius:8px;padding:9px 11px;cursor:pointer;text-align:left;font-family:inherit;transition:.12s}
.lb:hover{background:var(--surf2);color:var(--ink)}
.lb span{font:600 13px/1 inherit}
.lb em{font-style:normal;font-size:10.5px;color:var(--ink3);margin-left:auto}
.lb.on{background:var(--acc);color:#fff}
.lb.on em{color:rgba(255,255,255,.82)}

/* ── 우: 값 표시창 ───────────────────────────────────── */
#right{position:absolute;right:12px;top:56px;bottom:12px;width:284px;z-index:10;
  background:var(--surf);border:1px solid var(--line);border-radius:11px;
  box-shadow:0 10px 34px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden}
#vhead{padding:12px 14px 10px;border-bottom:1px solid var(--line)}
.vt{font:700 15px/1.2 inherit;letter-spacing:-.3px}
.vs{font-size:11.5px;color:var(--ink3);margin-top:2px}
#vmode{display:flex;gap:5px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.mode{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:7px;
  padding:5px 10px;font:600 11.5px/1 inherit;cursor:pointer}
.mode:hover{color:var(--ink)}
.mode.on{background:var(--acc);border-color:var(--acc);color:#fff}
.onemode{font-size:11.5px;color:var(--ink3)}
#vbody{padding:2px 14px 16px;overflow-y:auto;flex:1;scrollbar-width:thin}
#vbody::-webkit-scrollbar{width:8px}
#vbody::-webkit-scrollbar-thumb{background:#333640;border-radius:4px}
#vbody::-webkit-scrollbar-track{background:transparent}
.grp{font:700 10px/1 inherit;letter-spacing:.1em;color:var(--ink3);
  margin:15px 0 7px;padding-bottom:6px;border-bottom:1px solid var(--line)}
/* 값·라벨은 ink 토큰만 입는다. 계열색은 옆의 칩이 진다. */
.row{display:flex;align-items:center;gap:8px;padding:4.5px 0;font-size:12px;color:var(--ink2)}
.row i{width:10px;height:10px;border-radius:3px;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
.row span{flex:1;line-height:1.35}
.row b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.row.tot{margin-top:5px;padding-top:8px;border-top:1px solid var(--line)}
.ramp{display:flex;align-items:center;gap:7px;margin:3px 0 9px;font-size:10px;color:var(--ink3)}
.ramp i{flex:1;height:9px;border-radius:3px}
.mp{display:flex;align-items:center;gap:8px;padding:5px 0}
.mpc{width:17px;height:17px;border-radius:5px;background:var(--acc);color:#fff;
  font:700 10px/17px inherit;text-align:center;flex:0 0 auto}
.mpb{flex:1;min-width:0}
.mpn{font-size:11px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:4px;background:#262931;border-radius:2px;margin-top:3px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--acc);border-radius:2px}
.mpv{font:700 11px/1 inherit;color:var(--ink);font-variant-numeric:tabular-nums;flex:0 0 auto}
.note,.warn{margin-top:12px;padding:9px 10px;border-radius:0 7px 7px 0;font-size:11px;line-height:1.6}
.note{background:#161a20;border-left:2px solid var(--line2);color:#9aa5b2}
.warn{background:#241a13;border-left:2px solid var(--acc);color:#e3b795}
.note b,.warn b{color:var(--ink)}

/* 팝업 */
.maplibregl-popup-content{background:var(--surf);color:var(--ink2);border:1px solid var(--line2);
  border-radius:10px;padding:10px 12px;box-shadow:0 12px 34px rgba(0,0,0,.6)}
.maplibregl-popup-tip{display:none}
.pp b{font:700 13px/1.3 inherit;color:var(--ink);display:block}
.pp .ps{font-size:11px;color:var(--ink3);margin-top:2px}
.pp .pu{font-size:11.5px;margin-top:6px;line-height:1.45;color:var(--ink2)}
.pp .pg{font-size:11px;margin-top:5px;font-weight:600;display:flex;align-items:center;gap:5px;color:var(--ink2)}
.pp .pg i{width:9px;height:9px;border-radius:3px}
.pp .na,.na{color:var(--ink3);font-weight:500}

#foot{position:absolute;left:12px;bottom:12px;width:268px;z-index:9;font-size:9.5px;
  color:#6b7280;line-height:1.55;padding:0 3px}
@media (max-width:960px){
  #map{inset:44px 0 0}
  #left,#right{position:absolute;left:8px;right:8px;width:auto}
  #left{top:52px;flex-direction:row;overflow-x:auto;max-height:none}
  #right{top:auto;bottom:8px;max-height:46%}
  #kpi{display:none}
  #foot{display:none}
  .lb{white-space:nowrap}
}
</style>
"""

    body = """
<div id="bar">
  <div class="bd">Hay<b>Day</b></div>
  <div class="bsep"></div>
  <div class="btitle">도시환경 공간분석툴 · <b>부산 사하구 신평·장림·다대동 일원</b> · 신평장림산단 FutureVibe-01</div>
  <div id="tabs">
    <button class="vbtn" onclick="tilt()">기울이기</button>
    <button class="vbtn" onclick="resetView()">초기화</button>
    <a class="tab" href="./gijang.html">기장 만화천</a>
    <a class="tab" href="./seogu.html">부산 서구</a>
    <a class="tab on" href="./saha.html">부산 사하구</a>
    <a class="tab" href="./index.html">전체</a>
  </div>
</div>
<div id="map"></div>
<div id="left">
  <div class="card"><div class="chd">현황 통계</div><div id="kpi"></div></div>
  <div class="card"><div class="chd" style="padding-bottom:2px">레이어</div><div id="lbox"></div></div>
</div>
<div id="right">
  <div id="vhead"></div><div id="vmode"></div><div id="vbody"></div>
</div>
<div id="foot">
  건물 · 용도지역 · 법정동 · 개별공시지가 (c) VWorld<br>
  등록공장 (c) 부산광역시 제조업 공장등록현황 2025-12-31<br>
  위성영상 (c) Esri World Imagery
</div>
"""

    html = ('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,'
            'maximum-scale=1,user-scalable=no"/>\n'
            '<title>도시환경 공간분석툴 · 부산 사하구 신평·장림·다대동 | HayDay</title>\n'
            + ml_css + css + '</head><body>\n'
            + body + ml_js + '\n<script>\n' + app + '\n</script>\n</body></html>\n')

    io.open(OUT, 'w', encoding='utf-8').write(html)
    print('-> %s (%s B)' % (OUT, format(len(html.encode('utf-8')), ',')))

    # 플레이스홀더 검증 — gen.py 가 요구하는 것과 1:1 이어야 한다
    ph = sorted(set(re.findall(r'\{\{(\w+)\}\}', html)))
    print('플레이스홀더:', ph)
    for p in ph:
        n = html.count('{{%s}}' % p)
        if n != 1:
            raise SystemExit('{{%s}} 가 %d개다 — 1개여야 한다' % (p, n))
    return ph


if __name__ == '__main__':
    main()
