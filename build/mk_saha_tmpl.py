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
:root{--bg:#0b1017;--pn:#111823;--pn2:#0e141d;--bd:#1e2836;--tx:#dbe3ec;--dim:#8899aa;--ac:#a855f7}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);
  font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Malgun Gothic',sans-serif;
  -webkit-font-smoothing:antialiased}
#map{position:absolute;inset:0}
.maplibregl-popup-content{background:#0f1620;color:var(--tx);border:1px solid var(--bd);
  border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.maplibregl-popup-tip{border-top-color:#0f1620!important;border-bottom-color:#0f1620!important}
.pp b{font-size:13px;display:block;margin-bottom:3px}
.pp .ps{font-size:11px;color:var(--dim)}
.pp .pu{font-size:11.5px;margin-top:5px;line-height:1.45}
.pp .pg{font-size:11px;margin-top:4px;font-weight:600}

#top{position:absolute;top:0;left:0;right:0;padding:12px 16px;z-index:5;pointer-events:none;
  background:linear-gradient(180deg,rgba(11,16,23,.94),rgba(11,16,23,0))}
#top h1{margin:0;font-size:15px;font-weight:700;letter-spacing:-.2px}
#top h1 em{font-style:normal;color:var(--ac)}
#top p{margin:3px 0 0;font-size:11.5px;color:var(--dim)}
#kpi{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;pointer-events:auto}
.k{background:rgba(17,24,35,.92);border:1px solid var(--bd);border-radius:9px;
  padding:6px 10px;min-width:84px}
.k span{display:block;font-size:10px;color:var(--dim)}
.k b{font-size:15px;font-weight:700;letter-spacing:-.4px}
.k em{font-style:normal;font-size:10px;color:var(--dim);margin-left:2px}

/* 좌: 레이어 선택창 — 남실장님 2026-07-27 지시(좌우 분리) */
#left{position:absolute;left:12px;top:132px;width:196px;z-index:6}
.ltitle{font-size:10.5px;color:var(--dim);letter-spacing:.06em;margin:0 0 6px 3px;font-weight:600}
#lbox{display:flex;flex-direction:column;gap:5px}
.lb{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;
  background:rgba(17,24,35,.92);border:1px solid var(--bd);color:var(--tx);
  border-radius:9px;padding:8px 11px;cursor:pointer;text-align:left;
  font-family:inherit;transition:.14s}
.lb:hover{border-color:#33415a;background:rgba(23,32,46,.95)}
.lb.on{border-color:var(--ac);background:rgba(168,85,247,.14)}
.lb span{font-size:12.5px;font-weight:600}
.lb em{font-style:normal;font-size:10.5px;color:var(--dim)}
.lb.on em{color:#c9a4f5}

/* 우: 값 표시창 */
#right{position:absolute;right:12px;top:132px;bottom:52px;width:262px;z-index:6;
  background:rgba(14,20,29,.95);border:1px solid var(--bd);border-radius:11px;
  display:flex;flex-direction:column;overflow:hidden}
#vhead{padding:11px 13px 9px;border-bottom:1px solid var(--bd)}
.vt{font-size:13.5px;font-weight:700}
.vs{font-size:11px;color:var(--dim);margin-top:2px}
#vmode{display:flex;gap:5px;padding:9px 13px;border-bottom:1px solid var(--bd);flex-wrap:wrap}
.mode{background:#151d29;border:1px solid var(--bd);color:var(--dim);border-radius:7px;
  padding:4px 9px;font-size:11px;cursor:pointer;font-family:inherit}
.mode:hover{color:var(--tx)}
.mode.on{background:rgba(168,85,247,.2);border-color:var(--ac);color:#e7d6fb;font-weight:600}
#vbody{padding:4px 13px 14px;overflow-y:auto;flex:1}
#vbody::-webkit-scrollbar{width:7px}
#vbody::-webkit-scrollbar-thumb{background:#28344a;border-radius:4px}
.grp{font-size:10px;color:var(--dim);letter-spacing:.06em;font-weight:600;
  margin:13px 0 5px;padding-bottom:4px;border-bottom:1px solid #1a2331}
.row{display:flex;align-items:center;gap:7px;padding:3.5px 0;font-size:11.5px}
.row i{width:9px;height:9px;border-radius:2.5px;flex:0 0 auto}
.row span{flex:1;color:#b9c4d1;line-height:1.35}
.row b{font-weight:700;font-variant-numeric:tabular-nums}
.row b.mpc{width:15px;height:15px;border-radius:4px;background:var(--ac);color:#fff;
  font-size:9.5px;display:grid;place-items:center;flex:0 0 auto}
.note{margin-top:11px;padding:8px 9px;background:#111a26;border-left:2px solid #33415a;
  border-radius:0 6px 6px 0;font-size:10.5px;color:#93a2b3;line-height:1.55}
.warn{margin-top:11px;padding:8px 9px;background:#231a12;border-left:2px solid #d98a2b;
  border-radius:0 6px 6px 0;font-size:10.5px;color:#e0bd8f;line-height:1.55}
.note b,.warn b{color:#dbe3ec}

#foot{position:absolute;left:12px;bottom:12px;width:196px;z-index:6;font-size:9.5px;
  color:#5c6a7a;line-height:1.5}
@media (max-width:920px){
  #left,#right{position:static;width:auto}
  #left{padding:0 12px}
  #lbox{flex-direction:row;overflow-x:auto}
  .lb{min-width:120px}
}
</style>
"""

    body = """
<div id="map"></div>
<div id="top">
  <h1>도시환경 공간분석툴 · <em>부산 사하구 신평·장림·다대동 일원</em></h1>
  <p>신평장림산단 — FutureVibe-01 마스터플랜 분석지도 · HayDay</p>
  <div id="kpi"></div>
</div>
<div id="left">
  <div class="ltitle">레이어</div>
  <div id="lbox"></div>
</div>
<div id="right">
  <div id="vhead"></div>
  <div id="vmode"></div>
  <div id="vbody"></div>
</div>
<div id="foot">
  건물·용도지역·법정동 · 개별공시지가 (c) VWorld<br>
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
