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

/* ── HAYDAY_SHELL_V5 — 헤더 아래 전폭 가로 탭 + 왼쪽 상세 패널 ──────
   기장·서구와 같은 레이아웃이다(대표 지시 2026-08-01). 좌우 분리판은 폐기했다.
   #shellwrap 이 화면을 덮지만 pointer-events:none 이라 지도 조작을 막지 않는다.
   자식만 auto 로 되살린다 — 이 두 줄을 지우면 지도가 안 눌린다. */
#shellwrap{position:absolute;top:44px;left:0;right:0;bottom:0;z-index:15;
  pointer-events:none;display:flex;flex-direction:column;align-items:flex-start}
#shell{pointer-events:auto;flex:0 0 auto;align-self:stretch;background:rgba(9,12,18,.94);
  border-bottom:1px solid var(--line);backdrop-filter:blur(6px)}
#navlist{display:flex;flex-wrap:wrap;padding:0 6px}
.navitem{min-width:120px;min-height:56px;display:flex;flex-direction:column;justify-content:center;
  gap:3px;padding:9px 17px;margin:6px 3px;background:none;border:0;border-radius:9px;
  color:var(--ink3);cursor:pointer;font-family:inherit;text-align:left;transition:.12s}
.navitem:hover{background:var(--surf2);color:var(--ink)}
.navitem.on{background:var(--acc);color:#fff}
.navitem .nt{font:700 15.5px/1.25 inherit;letter-spacing:-.2px;white-space:pre-line}
.navitem .ns{font-size:12px;opacity:.85}
.navitem.on .ns{color:rgba(255,255,255,.86)}

/* ── 패널 — 왼쪽을 과감하게 크게 (대표 지시 2026-08-01) ────────────
   글자 크기는 zoom 3단계로 준다. px 를 단계마다 다시 쓰면 유지가 안 되고,
   transform:scale 은 스크롤이 깨진다. zoom 은 레이아웃을 그대로 재계산한다.
   ⚠ zoom 을 쓰면 max-height 도 배율로 나눠야 화면 밖으로 안 나간다. */
#detail{pointer-events:auto;flex:0 1 auto;min-height:0;width:700px;max-width:calc(100% - 24px);
  margin:10px 0 12px 12px;background:var(--surf);border:1px solid var(--line);border-radius:12px;
  box-shadow:0 12px 38px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden}
#detail.fs-s{zoom:1}
#detail.fs-m{zoom:1.22}
#detail.fs-l{zoom:1.5}
#fsz{position:absolute;right:112px;top:14px;display:flex;gap:3px;align-items:center}
#fsz b{font:700 11.5px/1 inherit;color:var(--ink3);margin-right:3px;letter-spacing:.06em}
.fsb{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:7px;
  padding:7px 10px;font:700 12.5px/1 inherit;cursor:pointer}
.fsb:hover{color:var(--ink);border-color:var(--line2)}
.fsb.on{background:var(--acc);border-color:var(--acc);color:#fff}
#detail.fold #vmode,#detail.fold #vbody{display:none}
#vhead{position:relative;padding:15px 18px 13px;border-bottom:1px solid var(--line)}
.vt{font:700 20px/1.2 inherit;letter-spacing:-.4px}
.vs{font-size:13.5px;color:var(--ink3);margin-top:3px}
.fold{position:absolute;right:14px;top:14px;background:var(--surf2);border:1px solid var(--line);
  color:var(--ink3);border-radius:8px;padding:7px 12px;font:700 12.5px/1 inherit;cursor:pointer}
.fold:hover{color:var(--ink);border-color:var(--line2)}
#vkpi{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;padding:13px 18px;
  border-bottom:1px solid var(--line)}
.k span{display:block;font-size:11.5px;color:var(--ink3);margin-bottom:3px}
.k b{font:800 22px/1.15 inherit;letter-spacing:-.7px;font-variant-numeric:tabular-nums}
.k b em{font-style:normal;font-size:11.5px;font-weight:500;color:var(--ink3);margin-left:2px}
#vmode{display:flex;gap:6px;padding:12px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.mode{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:8px;
  padding:8px 13px;font:700 13.5px/1 inherit;cursor:pointer}
.mode:hover{color:var(--ink)}
.mode.on{background:var(--acc);border-color:var(--acc);color:#fff}
.onemode{font-size:13.5px;color:var(--ink3)}
#vbody{padding:2px 18px 20px;overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin}
#vbody::-webkit-scrollbar{width:8px}
#vbody::-webkit-scrollbar-thumb{background:#333640;border-radius:4px}
#vbody::-webkit-scrollbar-track{background:transparent}
.grp{font:800 12.5px/1.3 inherit;letter-spacing:.06em;color:var(--ink2);
  margin:18px 0 9px;padding-bottom:8px;border-bottom:1px solid var(--line)}
/* 값·라벨은 ink 토큰만 입는다. 계열색은 옆의 칩이 진다. */
.row{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14.5px;color:var(--ink2)}
.row i{width:12px;height:12px;border-radius:3px;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
.row span{flex:1;line-height:1.35}
.row b{font-weight:800;font-size:15.5px;color:var(--ink);font-variant-numeric:tabular-nums}
.row.tot{margin-top:5px;padding-top:8px;border-top:1px solid var(--line)}
.ramp{display:flex;align-items:center;gap:8px;margin:4px 0 11px;font-size:12px;color:var(--ink3)}
.ramp i{flex:1;height:12px;border-radius:3px}
.mp{display:flex;align-items:center;gap:8px;padding:5px 0}
.mpc{width:21px;height:21px;border-radius:6px;background:var(--acc);color:#fff;
  font:700 12px/21px inherit;text-align:center;flex:0 0 auto}
.mpb{flex:1;min-width:0}
.mpn{font-size:13.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:6px;background:#262931;border-radius:2px;margin-top:3px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--acc);border-radius:2px}
.mpv{font:800 15px/1 inherit;color:var(--ink);font-variant-numeric:tabular-nums;flex:0 0 auto}
.note,.warn{margin-top:14px;padding:12px 13px;border-radius:0 8px 8px 0;font-size:13.5px;line-height:1.7}
.note{background:#161a20;border-left:2px solid var(--line2);color:#9aa5b2}
.warn{background:#241a13;border-left:2px solid var(--acc);color:#e3b795}
.note b,.warn b{color:var(--ink)}
/* 목표 질문 배너 — 이 레이어가 무엇에 답하려는 것인지 화면에 남긴다 (07-31 남실장님 [L253][L255]) */
.warn2{margin-top:14px;padding:13px;border-radius:9px;font-size:14px;line-height:1.7;
  background:#0f1c26;border:1px solid #1d3a4d;color:#9fd0e8}
.warn2 b{color:#7fd4ff;font-weight:800}
/* 스파크라인 — 18년 청년 비중 추이. 축·눈금 없이 형태만 읽힌다 */
.spark{display:flex;align-items:flex-end;gap:2px;height:32px;margin:7px 0 5px}
.spark i{flex:1;border-radius:1px;opacity:.9}

/* ── 청년 진단 컴포넌트 ─────────────────────────────────────────
   막대는 mount 시 좌→우로 자란다. 장식이 아니라 '어디가 얼마나 빠졌나'를
   눈이 먼저 잡게 하려는 것이다. 색은 검증 팔레트 안에서만 쓴다. */
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.kbig{display:flex;gap:8px;margin:12px 0 6px}
.kbig>div{flex:1;background:var(--surf2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.kbig span{display:block;font-size:12px;color:var(--ink3);margin-bottom:3px}
.kbig b{font:800 27px/1.1 inherit;letter-spacing:-.9px;font-variant-numeric:tabular-nums;display:block}
.kbig b em{font-style:normal;font-size:13px;font-weight:600;color:var(--ink3);margin-left:3px}
.kbig .up{color:#7fd4ff}.kbig .dn{color:var(--acc2)}

.pv{display:flex;align-items:center;gap:11px;padding:5px 0;font-size:14px}
.pv .pl{width:68px;flex:0 0 auto;color:var(--ink2);font-variant-numeric:tabular-nums}
.pv .pb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2.5px}
.pv .pb i{display:block;height:10px;border-radius:2px;transform-origin:left;
  animation:grow .55s cubic-bezier(.2,.8,.2,1) both}
.pv .pd{width:74px;font-size:15px;flex:0 0 auto;text-align:right;font-weight:700;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.pv:hover{background:rgba(255,255,255,.035);border-radius:6px}
.lg{display:flex;gap:16px;font-size:12.5px;color:var(--ink3);margin:2px 0 8px}
.lg s{text-decoration:none;display:flex;align-items:center;gap:5px}
.lg s i{width:10px;height:7px;border-radius:2px}

/* 18년 추이 — 축 없이 형태만. 마지막 해만 강조한다 */
.trend{display:flex;align-items:flex-end;gap:3px;height:124px;margin:8px 0 4px;
  padding:0 2px;border-bottom:1px solid var(--line)}
.trend i{flex:1;border-radius:2px 2px 0 0;transform-origin:bottom;
  animation:grow .5s cubic-bezier(.2,.8,.2,1) both;position:relative}
.trend i:hover{opacity:.75}
.tx{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink3);margin-top:3px}

.gap{margin:12px 0 4px;padding:12px;border-radius:10px;background:#1a1207;
  border:1px solid #3a2a10}
.gap .gt{font:800 15.5px/1.4 inherit;color:#f0c98a}
.gap .gn{font:800 34px/1.1 inherit;color:var(--acc2);letter-spacing:-1px;margin:6px 0 2px;
  font-variant-numeric:tabular-nums}
.gap .gs{font-size:13.5px;color:#c0a882;line-height:1.75}

/* 팝업 */
.maplibregl-popup-content{background:var(--surf);color:var(--ink2);border:1px solid var(--line2);
  border-radius:10px;padding:10px 12px;box-shadow:0 12px 34px rgba(0,0,0,.6)}
.maplibregl-popup-tip{display:none}
.pp b{font:800 15px/1.3 inherit;color:var(--ink);display:block}
.pp .ps{font-size:13px;color:var(--ink3);margin-top:2px}
.pp .pu{font-size:13.5px;margin-top:6px;line-height:1.45;color:var(--ink2)}
.pp .pg{font-size:13px;margin-top:5px;font-weight:600;display:flex;align-items:center;gap:5px;color:var(--ink2)}
.pp .pg i{width:9px;height:9px;border-radius:3px}
.pp .na,.na{color:var(--ink3);font-weight:500}

@media (max-width:960px){
  #detail{width:auto;margin:8px 8px 8px;max-width:none}
  #vkpi{grid-template-columns:repeat(3,1fr)}
  .navitem{min-width:88px;min-height:42px;padding:6px 10px}
  .navitem .nt{font-size:12px}
}
</style>
"""

    body = """
<div id="bar">
  <div class="bd">Hay<b>Day</b></div>
  <div class="bsep"></div>
  <div class="btitle">도시환경 공간분석툴 · <b>부산 사하구 신평·장림·다대동 일원</b> · 서부산스마트밸리(구 신평·장림산단)</div>
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
<div id="shellwrap">
  <div id="shell"><div id="navlist"></div></div>
  <div id="detail">
    <div id="vhead"></div>
    <div id="vkpi"></div>
    <div id="vmode"></div>
    <div id="vbody"></div>
  </div>
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
