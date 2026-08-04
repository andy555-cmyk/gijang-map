#!/usr/bin/env python3
"""부산 시간대별 도로 속도 지도 — 템플릿(CSS + body) 생성

⚠ MapLibre 는 CDN 을 쓰지 않는다. 자기완결 HTML 이어야 하고,
   컨테이너 검증 환경에서 unpkg 가 차단된다(실측 2026-08-01).
   ml.css / ml.js 는 기존 지도툴(seogu.html)에서 추출한 v4.7.1 번들이다.
"""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))

HTML = """<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>부산 시간대별 도로 속도 지도 | HayDay</title>
<meta name="description" content="부산광역시 9,085개 도로 구간의 요일별 퇴근시간대 평균 통행속도. 국토교통부 표준노드링크 + 부산광역시 교통정보서비스센터 구간레벨패턴정보.">
__MLCSS__
__MLJS__
<style>
:root{
  --bg:#080a0d; --surf:#11151c; --surf2:#1a1f28; --line:#252b36; --line2:#333b49;
  --ink:#f2f4f7; --ink2:#b9c0cc; --ink3:#7b8391; --acc:#e0672c;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',
  'Malgun Gothic',system-ui,sans-serif;overflow:hidden}
#map{position:absolute;inset:0}

/* 헤더 */
#hd{position:absolute;top:0;left:0;right:0;height:48px;z-index:6;display:flex;
  align-items:center;gap:14px;padding:0 18px;background:linear-gradient(180deg,
  rgba(8,10,13,.97) 0%,rgba(8,10,13,.86) 70%,rgba(8,10,13,0) 100%);pointer-events:none}
#hd b{font-size:15px;letter-spacing:-.2px}
#hd b i{color:var(--acc);font-style:normal}
#hd .sep{width:1px;height:16px;background:var(--line2)}
#hd .sub{font-size:12.5px;color:var(--ink3);letter-spacing:-.1px}

/* 패널 */
#wrap{position:absolute;inset:48px 0 0 0;z-index:5;display:flex;
  align-items:flex-start;padding:12px 0 0 12px;pointer-events:none}
#wrap>*{pointer-events:auto}
#detail{width:700px;max-width:calc(100% - 24px);background:rgba(17,21,28,.96);
  border:1px solid var(--line);border-radius:16px;overflow-y:auto;overflow-x:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.6);backdrop-filter:blur(14px);
  scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
#detail::-webkit-scrollbar{width:9px}
#detail::-webkit-scrollbar-thumb{background:var(--line2);border-radius:9px}
#detail.fold{max-height:none!important}
#detail.fold>*:not(.ph){display:none}

.ph{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:16px 18px 14px;border-bottom:1px solid var(--line)}
.pt{font-size:20px;font-weight:800;letter-spacing:-.5px}
.ps{font-size:13px;color:var(--ink3);margin-top:5px}
.ps b{color:var(--ink2);font-weight:700}
.pr{display:flex;align-items:center;gap:8px;flex:none}
#fsz{display:flex;align-items:center;gap:4px}
#fsz>b{font-size:11.5px;color:var(--ink3);margin-right:3px;font-weight:700}
.fsb{cursor:pointer;border:1px solid var(--line);border-radius:8px;background:transparent;
  color:var(--ink3);font:700 13px/1 inherit;padding:7px 11px}
.fsb:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.fsb.on{background:var(--acc);border-color:var(--acc);color:#160b05}
.fold{cursor:pointer;background:var(--surf2);border:1px solid var(--line);color:var(--ink3);
  border-radius:8px;padding:7px 12px;font:700 12.5px/1 inherit}
.fold:hover{color:var(--ink)}

#kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;padding:13px 18px;
  border-bottom:1px solid var(--line)}
#detail.nk #kpi{grid-template-columns:repeat(2,1fr);row-gap:11px}
.k span{display:block;font-size:11.5px;color:var(--ink3);margin-bottom:3px}
.k b{font:800 22px/1.15 inherit;letter-spacing:-.7px;font-variant-numeric:tabular-nums}
.k b em{font-style:normal;font-size:11.5px;font-weight:500;color:var(--ink3);margin-left:2px}

.sec{padding:15px 18px;border-bottom:1px solid var(--line)}
.sec:last-child{border-bottom:0}
.lb{font-size:12.5px;font-weight:800;color:var(--ink3);letter-spacing:.05em;margin-bottom:10px}
.lb .sub{font-weight:500;letter-spacing:0;opacity:.75;margin-left:5px}
.tnow{float:right;color:var(--acc);font-weight:800;letter-spacing:0;
  font-variant-numeric:tabular-nums}

.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:var(--surf2);border:1px solid var(--line);color:var(--ink3);border-radius:9px;
  padding:9px 14px;font:700 13.5px/1 inherit;cursor:pointer}
.chip:hover{color:var(--ink);border-color:var(--line2)}
.chip.on{background:var(--acc);border-color:var(--acc);color:#160b05}

.playrow{display:flex;gap:10px;align-items:center}
.btn-play{flex:none;background:var(--acc);border:0;color:#160b05;border-radius:10px;
  padding:11px 16px;font:800 14px/1 inherit;cursor:pointer;min-width:96px}
.btn-play:hover{filter:brightness(1.08)}
#slider{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;
  background:var(--surf2);outline:0;border:1px solid var(--line)}
#slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;
  background:var(--ink);border:3px solid var(--acc);cursor:pointer}
#slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--ink);
  border:3px solid var(--acc);cursor:pointer}
.ticks{display:flex;justify-content:space-between;margin-top:7px}
.ticks i{font-style:normal;font-size:10.5px;color:transparent}
.ticks i.on{color:var(--ink3)}

.leg{display:flex;flex-wrap:wrap;gap:9px 16px}
.lg{display:flex;align-items:center;gap:7px;font-size:13.5px;color:var(--ink2)}
.lg i{width:22px;height:5px;border-radius:3px;flex:none}

.br{display:flex;align-items:center;gap:10px;padding:5px 0;cursor:pointer}
.br:hover .bn{color:var(--ink)}
.bn{width:26px;font-size:13.5px;color:var(--ink3);font-weight:700;flex:none}
.bt{flex:1;height:9px;background:var(--surf2);border-radius:5px;overflow:hidden}
.bt i{display:block;height:100%;border-radius:5px;transition:width .4s}
.bv{width:44px;text-align:right;font-size:13.5px;font-weight:800;color:var(--ink2);
  font-variant-numeric:tabular-nums;flex:none}

.rk{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(37,43,54,.6);
  cursor:pointer}
.rk:last-child{border-bottom:0}
.rk:hover{background:rgba(255,255,255,.03)}
.rn{width:22px;font-size:12px;color:var(--ink3);font-weight:800;flex:none;
  font-variant-numeric:tabular-nums}
.rt{flex:1;min-width:0}
.rt b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.rt em{display:block;font-style:normal;font-size:12px;color:var(--ink3);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rv{width:52px;text-align:right;font-size:15px;font-weight:800;flex:none;
  font-variant-numeric:tabular-nums}

.note{font-size:12.5px;color:var(--ink3);line-height:1.7;margin-top:11px}
.note b{color:var(--ink2)}
.warn{font-size:12.5px;color:var(--ink2);line-height:1.7;margin-top:10px;
  padding:11px 13px;background:rgba(217,89,38,.10);border-left:3px solid var(--acc);
  border-radius:0 8px 8px 0}
.warn b{color:#f0a077}

.maplibregl-popup.tp .maplibregl-popup-content{background:rgba(17,21,28,.97);
  border:1px solid var(--line2);border-radius:11px;padding:11px 13px;
  box-shadow:0 14px 36px rgba(0,0,0,.6)}
.maplibregl-popup.tp .maplibregl-popup-tip{border-top-color:rgba(17,21,28,.97);
  border-bottom-color:rgba(17,21,28,.97)}
.tw b{font-size:14px}
.td{font-size:12px;color:var(--ink3);margin-top:3px}
.tv{font-size:19px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums}
.tm{font-size:11.5px;color:var(--ink3);margin-top:4px}

.maplibregl-ctrl-attrib{background:rgba(8,10,13,.8)!important;font-size:10.5px}
.maplibregl-ctrl-attrib a{color:var(--ink3)!important}

@media (max-width:960px){
  #detail{width:auto!important;margin-right:12px;max-width:none}
  #kpi{grid-template-columns:repeat(2,1fr);row-gap:11px}
  #hd .sub{display:none}
}
</style></head><body>
<div id="map"></div>
<div id="hd">
  <b>Hay<i>Day</i></b><div class="sep"></div>
  <span class="sub">부산 시간대별 도로 속도 · 9,085개 구간 · 요일별 퇴근 피크</span>
</div>
<div id="wrap"><div id="detail"></div></div>
<script>
__APP__
</script>
</body></html>
"""


def main():
    ml_css = io.open(os.path.join(BASE, 'ml.css'), encoding='utf-8').read()
    ml_js = io.open(os.path.join(BASE, 'ml.js'), encoding='utf-8').read()
    if 'maplibregl' not in ml_js:
        raise SystemExit('MapLibre 번들이 깨졌다.')
    out = HTML.replace('__MLCSS__', ml_css).replace('__MLJS__', ml_js)
    with io.open(os.path.join(BASE, 'tmpl.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('tmpl.html 생성 (MapLibre 인라인 %s B)' % format(len(ml_css) + len(ml_js), ','))


if __name__ == '__main__':
    main()
