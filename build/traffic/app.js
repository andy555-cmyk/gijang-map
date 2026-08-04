/* 부산 도로교통망 분석 — 앱 v2
   데이터 4종(SEG·SPD·STAT·BG)은 gen.py 가 플레이스홀더 자리에 주입한다.
   🔴 주석에 플레이스홀더를 그대로 적지 마라. replace 가 전부 치환해 데이터가 두 번 들어간다(실측).

   v2 (대표 피드백 08-04)
     ① 속도비(실제/제한)를 1차 지표로. 절대속도만 보면 제한 30km/h 이면도로가 랭킹을 독식한다.
     ② 도로 위계 필터 — 고속·도시고속 / 국도·지방도 / 광역시도 / 시군도
     ③ 미관측 배경망 — 관측 구간만 그리면 도로가 끊겨 보인다는 지적의 답
     ④ 차로수 = 선 굵기
     ⑤ 흐르는 빛 — 막히면 느리게, 뚫리면 빠르게 흐른다
*/
const SEG = {{SEG}};
const SPD = {{SPD}};
const ST = {{STAT}};
const BG = {{BG}};

/* SEG 필드 인덱스 */
const F_NM = 0, F_FR = 1, F_TO = 2, F_ROAD = 3, F_LANE = 4, F_MX = 5,
      F_RG = 6, F_LEN = 7, F_DELAY = 8, F_GEO = 9;

/* ── 색 ──────────────────────────────────────────────────────────
   검증 팔레트에서만 파생한다. 무지개 금지.
   ⚠ 지표에 따라 램프가 다르다. 속도비는 %, 절대속도는 km/h — 같은 색을 쓰면 오독된다. */
const RAMP_RATIO = [
  [0,  '#a8380f', '30% 미만'],
  [30, '#d95926', '30~50'],
  [50, '#c98500', '50~70'],
  [70, '#199e70', '70~90'],
  [90, '#3987e5', '90% 이상']
];
const RAMP_ABS = [
  [0,  '#a8380f', '10 미만'],
  [10, '#d95926', '10~20'],
  [20, '#c98500', '20~30'],
  [30, '#199e70', '30~45'],
  [45, '#3987e5', '45 이상']
];
const NA = '#3f4550';
const BGC = '#222c3a';   /* 미관측 배경망 — 너무 어두우면 그물망이 안 보인다 */

const nf = n => n.toLocaleString('ko-KR');
const DAY_KO = ST.day_ko, NSTEP = ST.n_step, NDAY = ST.n_day;
const RG_KO = ST.rank_ko;

/* ── 상태 ── */
let curDay = 0, curStep = 0, curFs = 's';
let metric = 'ratio';                  /* ratio | abs | delay */
let rgOn = [true, true, true, true];   /* 위계 필터 */
let playing = false, timer = null;
let flowOn = true, satOn = false, bgOn = true;

function ramp() { return metric === 'abs' ? RAMP_ABS : RAMP_RATIO; }
/* 세그먼트 i 의 현재 표시값 */
function valOf(i) {
  const v = SPD[curDay][i][curStep];
  if (v == null) return null;
  if (metric === 'abs') return v;
  const mx = SEG[i][F_MX];
  return mx ? v / mx * 100 : null;
}
function colorOf(x) {
  if (x == null) return NA;
  const R = ramp();
  let c = R[0][1];
  for (const r of R) if (x >= r[0]) c = r[1];
  return c;
}

/* ── 지도 ── */
const ATTR = '도로형상 국토교통부 표준노드링크(2026-07-16) · 속도 부산광역시 교통정보서비스센터 구간레벨패턴정보(2026-06)';
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      sat: {
        type: 'raster', tileSize: 256, maxzoom: 18, attribution: ATTR,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
      }
    },
    layers: [
      { id: 'bg0', type: 'background', paint: { 'background-color': '#05070a' } },
      { id: 'sat', type: 'raster', source: 'sat',
        layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.5, 'raster-saturation': -0.6 } }
    ]
  },
  center: [(ST.bbox[0] + ST.bbox[2]) / 2, (ST.bbox[1] + ST.bbox[3]) / 2],
  zoom: 10, attributionControl: false, dragRotate: false
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

/* 형상은 한 번만 만든다. 매 프레임 새로 만들면 9천 개에서 버벅인다. */
const FC = {
  type: 'FeatureCollection',
  features: SEG.map((s, i) => ({
    type: 'Feature', id: i,
    properties: { i: i, rg: s[F_RG], ln: s[F_LANE] || 1 },
    geometry: { type: 'LineString', coordinates: s[F_GEO] }
  }))
};
const FC_BG = {
  type: 'FeatureCollection',
  features: BG.map(g => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: g } }))
};

let ready = false, bootT = 0;
/* 🔴 재시도 한도는 '횟수'가 아니라 '시간'이다(사하 실측). */
function boot() {
  if (ready) return;
  if (!map.isStyleLoaded()) {
    if (!bootT) bootT = +new Date();
    if (+new Date() - bootT < 60000) setTimeout(boot, 200);
    return;
  }
  ready = true;
  addLayers();
  fitAll();
  renderShell();
  paint();
  setFs('s');
  startFlow();
}
map.on('load', boot); map.on('styledata', boot);
setTimeout(boot, 1200); setTimeout(boot, 3000);

/* 차로수 기반 굵기 — 대로는 굵게, 소로는 가늘게.
   🔴 MapLibre 는 ['zoom'] 을 top-level interpolate/step 에서만 허용한다.
      ['*', W, 2] 처럼 감싸면 스타일이 통째로 거부된다(실측). 배율을 인자로 넘긴다. */
function W(k) {
  return ['interpolate', ['linear'], ['zoom'],
    9,  ['*', k, ['interpolate', ['linear'], ['get', 'ln'], 1, 0.45, 5, 1.5]],
    11, ['*', k, ['interpolate', ['linear'], ['get', 'ln'], 1, 0.9,  5, 3.0]],
    13, ['*', k, ['interpolate', ['linear'], ['get', 'ln'], 1, 1.8,  5, 5.6]],
    15, ['*', k, ['interpolate', ['linear'], ['get', 'ln'], 1, 3.4,  5, 10]],
    17, ['*', k, ['interpolate', ['linear'], ['get', 'ln'], 1, 6.0,  5, 17]]];
}

function addLayers() {
  map.addSource('bgnet', { type: 'geojson', data: FC_BG });
  map.addSource('seg', { type: 'geojson', data: FC });

  /* ③ 미관측 배경망 — 도로가 끊겨 보이는 문제의 답 */
  map.addLayer({
    id: 'l-bg', type: 'line', source: 'bgnet',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': BGC,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.35, 12, 0.9, 15, 2.0, 17, 3.2],
      'line-opacity': 0.9
    }
  });

  map.addLayer({
    id: 'l-glow', type: 'line', source: 'seg',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['feature-state', 'c'], NA],
      'line-width': W(3.0), 'line-opacity': 0.13, 'line-blur': 4
    }
  });
  map.addLayer({
    id: 'l-seg', type: 'line', source: 'seg',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['feature-state', 'c'], NA],
      'line-width': W(1), 'line-opacity': 0.92
    }
  });
  /* ⑤ 흐르는 빛 — dash 를 굴린다. 막히면 느리게, 뚫리면 빠르게. */
  map.addLayer({
    id: 'l-flow', type: 'line', source: 'seg',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': W(0.5),
      'line-opacity': 0.55,
      'line-dasharray': [0, 3, 1, 6]
    }
  });
  map.addLayer({
    id: 'l-hit', type: 'line', source: 'seg',
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': W(5) }
  });
  map.addLayer({
    id: 'l-hi', type: 'line', source: 'seg',
    filter: ['==', ['get', 'i'], -1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': W(2.2), 'line-opacity': 0.95 }
  });

  map.on('mousemove', 'l-hit', e => {
    const f = e.features && e.features[0]; if (!f) return;
    map.getCanvas().style.cursor = 'pointer';
    showTip(e.lngLat, +f.properties.i);
  });
  map.on('mouseleave', 'l-hit', () => { map.getCanvas().style.cursor = ''; hideTip(); });
  map.on('click', 'l-hit', e => {
    const f = e.features && e.features[0]; if (f) focusSeg(+f.properties.i);
  });
  applyFilter();
}

/* ── 흐르는 빛 ──────────────────────────────────────────────────
   dasharray 배열을 프레임마다 회전시키면 빛이 선을 타고 흐른다.
   ⚠ 9천 개 라인에 매 프레임 setPaintProperty 를 걸면 렉이 걸린다.
      dash 패턴은 레이어 하나에만 주고, 흐름 속도는 프레임 간격으로 조절한다. */
const DASHES = [
  [0, 4, 3, 2], [0.5, 4, 3, 1.5], [1, 4, 3, 1], [1.5, 4, 3, 0.5],
  [2, 4, 3, 0], [0, 0.5, 4, 3, 2.5, 0], [0, 1, 4, 3, 2, 0], [0, 1.5, 4, 3, 1.5, 0],
  [0, 2, 4, 3, 1, 0], [0, 2.5, 4, 3, 0.5, 0], [0, 3, 4, 3, 0, 0]
];
let dashI = 0, flowTimer = null;
function startFlow() {
  clearInterval(flowTimer);
  if (!flowOn) return;
  flowTimer = setInterval(() => {
    if (!ready || !map.getLayer('l-flow')) return;
    dashI = (dashI + 1) % DASHES.length;
    map.setPaintProperty('l-flow', 'line-dasharray', DASHES[dashI]);
  }, 90);
}
function toggleFlow() {
  flowOn = !flowOn;
  map.setLayoutProperty('l-flow', 'visibility', flowOn ? 'visible' : 'none');
  const b = document.getElementById('flowb'); if (b) b.classList.toggle('on', flowOn);
  startFlow();
}

/* ── 색 갱신 — feature-state 만 바꾼다 ── */
function paint() {
  if (!ready) return;
  for (let i = 0; i < SEG.length; i++) {
    map.setFeatureState({ source: 'seg', id: i }, { c: colorOf(valOf(i)) });
  }
  updateHead();
}

/* ② 위계 필터 */
function applyFilter() {
  const on = [];
  rgOn.forEach((v, i) => { if (v) on.push(i); });
  const f = on.length === 4 ? null : ['in', ['get', 'rg'], ['literal', on]];
  ['l-glow', 'l-seg', 'l-flow', 'l-hit'].forEach(id => {
    if (map.getLayer(id)) map.setFilter(id, f);
  });
}
function toggleRg(i) {
  rgOn[i] = !rgOn[i];
  if (rgOn.every(v => !v)) rgOn[i] = true;   /* 전부 끄면 아무것도 안 보인다 */
  applyFilter(); renderRg(); renderRank();
}
function toggleBg() {
  bgOn = !bgOn;
  map.setLayoutProperty('l-bg', 'visibility', bgOn ? 'visible' : 'none');
  const b = document.getElementById('bgb'); if (b) b.classList.toggle('on', bgOn);
}
function toggleSat() {
  satOn = !satOn;
  map.setLayoutProperty('sat', 'visibility', satOn ? 'visible' : 'none');
  const b = document.getElementById('satb'); if (b) b.classList.toggle('on', satOn);
}

function fitAll() {
  const b = ST.bbox;
  const d = document.getElementById('detail');
  const w = window.innerWidth || 1440;
  const pad = (d && !d.classList.contains('fold') && w >= 960)
    ? { top: 92, bottom: 36, left: Math.round(d.getBoundingClientRect().width) + 30, right: 40 }
    : { top: 92, bottom: 36, left: 24, right: 24 };
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, duration: 0 });
}

/* ── 재생 ── */
function setStep(s) {
  curStep = ((s % NSTEP) + NSTEP) % NSTEP;
  paint();
  const sl = document.getElementById('slider'); if (sl) sl.value = curStep;
}
function setDay(d) { curDay = d; paint(); renderDays(); }
function setMetric(m) { metric = m; paint(); renderMetric(); renderLegend(); renderRank(); }
function play() {
  playing = true; clearInterval(timer);
  timer = setInterval(() => setStep(curStep + 1), 900); syncPlay();
}
function pause() { playing = false; clearInterval(timer); syncPlay(); }
function togglePlay() { playing ? pause() : play(); }
function syncPlay() {
  const b = document.getElementById('play');
  if (b) b.textContent = playing ? '⏸  멈춤' : '▶  재생';
}

/* ── 패널 ── */
function renderShell() {
  document.getElementById('detail').innerHTML = `
    <div class="ph">
      <div>
        <div class="pt">부산 도로교통망 분석</div>
        <div class="ps">퇴근 피크 <b>${ST.times[0]}~${ST.times[ST.times.length - 1]}</b> · 요일별 평균 · 관측 <b>${nf(ST.n_seg)}</b>구간</div>
      </div>
      <div class="pr">
        <div id="fsz"><b>글자</b>${['s,작게', 'm,보통', 'l,크게'].map(x => {
          const [k, n] = x.split(','); return `<button type="button" class="fsb" onclick="setFs('${k}')">${n}</button>`;
        }).join('')}</div>
        <button class="fold" onclick="toggleFold()">▲ 접기</button>
      </div>
    </div>

    <div class="sec">
      <div class="lb">분석 지표</div>
      <div id="metric" class="chips"></div>
      <div class="note" id="mnote"></div>
    </div>

    <div id="kpi"></div>

    <div class="sec">
      <div class="lb">도로 위계 <span class="sub">끄고 켜서 간선만 본다</span></div>
      <div id="rgs" class="chips"></div>
      <div id="rgtbl"></div>
    </div>

    <div class="sec">
      <div class="lb">요일</div>
      <div id="days" class="chips"></div>
    </div>

    <div class="sec">
      <div class="lb">시각 <span id="tnow" class="tnow"></span></div>
      <div class="playrow">
        <button id="play" class="btn-play" onclick="togglePlay()">▶  재생</button>
        <input id="slider" type="range" min="0" max="${NSTEP - 1}" value="0"
               oninput="pause();setStep(+this.value)">
      </div>
      <div class="ticks">${ST.times.map((t, i) =>
        `<i${i === 0 || i === NSTEP - 1 ? ' class="on"' : ''}>${t}</i>`).join('')}</div>
    </div>

    <div class="sec">
      <div class="lb" id="leglb"></div>
      <div id="leg" class="leg"></div>
    </div>

    <div class="sec">
      <div class="lb">요일별 평균 속도 <span class="sub">km/h</span></div>
      <div id="dbar"></div>
    </div>

    <div class="sec">
      <div class="lb" id="ranklb"></div>
      <div id="rank"></div>
    </div>

    <div class="sec">
      <div class="lb">보기</div>
      <div class="chips">
        <button class="chip on" id="flowb" onclick="toggleFlow()">흐름 애니메이션</button>
        <button class="chip on" id="bgb" onclick="toggleBg()">미관측 도로망</button>
        <button class="chip" id="satb" onclick="toggleSat()">위성 배경</button>
        <button class="chip" onclick="fitAll()">전체 보기</button>
      </div>
      <div class="note">
        도로 형상 <b>국토교통부 표준노드링크</b>(2026-07-16) ·
        속도 <b>부산광역시 교통정보서비스센터</b> 구간레벨패턴정보(2026-06 공개분).
        어두운 회색 선은 <b>속도 관측이 없는 도로</b>(${nf(ST.n_bg)}개)로, 도로망 형태를 보이기 위한 배경이다.
      </div>
      <div class="warn">
        <b>공개분은 18:00~18:55만 제공된다.</b> 24시간 전 시간대는 부산시 교통정보서비스센터에
        별도 신청해야 받을 수 있다(자료 설명에 명시). <b>없는 시간대를 추정해 그리지 않는다.</b>
      </div>
    </div>`;
  renderMetric(); renderKpi(); renderRg(); renderDays(); renderLegend();
  renderBar(); renderRank(); updateHead(); syncPlay();
}

const METRICS = [
  ['ratio', '속도비', '제한속도 대비 실제 통행속도(%). 위계가 다른 도로를 한 잣대로 비교할 수 있다.'],
  ['abs', '절대속도', '실측 통행속도(km/h). 제한 30km/h 이면도로가 상위를 독식하므로 단독 판단 근거로 쓰지 않는다.'],
  ['delay', '지체시간', '제한속도로 갔을 때 대비 손실 시간(초). 구간 길이를 반영해 짧은 구간의 과대평가를 잡는다.']
];
function renderMetric() {
  document.getElementById('metric').innerHTML = METRICS.map(m =>
    `<button class="chip${metric === m[0] ? ' on' : ''}" onclick="setMetric('${m[0]}')">${m[1]}</button>`).join('');
  const m = METRICS.find(x => x[0] === metric);
  document.getElementById('mnote').textContent = m ? m[2] : '';
}

function renderKpi() {
  const g = ST.rank_sum;
  document.getElementById('kpi').innerHTML = `
    <div class="k"><span>관측 구간</span><b>${nf(ST.n_seg)}<em>개</em></b></div>
    <div class="k"><span>평균 속도</span><b>${ST.spd_mean}<em>km/h</em></b></div>
    <div class="k"><span>광역시도 속도비</span><b>${g[2].ratio}<em>%</em></b></div>
    <div class="k"><span>고속·도시고속</span><b>${g[0].ratio}<em>%</em></b></div>`;
}

function renderRg() {
  document.getElementById('rgs').innerHTML = RG_KO.map((n, i) =>
    `<button class="chip${rgOn[i] ? ' on' : ''}" onclick="toggleRg(${i})">${n}</button>`).join('');
  document.getElementById('rgtbl').innerHTML = ST.rank_sum.map((g, i) => {
    const w = Math.max(2, g.ratio);
    return `<div class="br${rgOn[i] ? '' : ' off'}" onclick="toggleRg(${i})">
      <span class="bn2">${RG_KO[i]}</span>
      <span class="bt"><i style="width:${w}%;background:${colorOfRatio(g.ratio)}"></i></span>
      <span class="bv">${g.ratio}<em>%</em></span>
      <span class="bc">${nf(g.n)}</span></div>`;
  }).join('');
}
function colorOfRatio(x) {
  let c = RAMP_RATIO[0][1];
  for (const r of RAMP_RATIO) if (x >= r[0]) c = r[1];
  return c;
}

function renderDays() {
  document.getElementById('days').innerHTML = DAY_KO.map((d, i) =>
    `<button class="chip${i === curDay ? ' on' : ''}" onclick="setDay(${i})">${d}</button>`).join('');
}

function renderLegend() {
  const isAbs = metric === 'abs';
  document.getElementById('leglb').innerHTML =
    metric === 'delay' ? '색 = 속도비 (km/h 아님)' : (isAbs ? '통행속도 (km/h)' : '속도비 (제한속도 대비 %)');
  const R = metric === 'delay' ? RAMP_RATIO : ramp();
  document.getElementById('leg').innerHTML = R.map(r =>
    `<div class="lg"><i style="background:${r[1]}"></i>${r[2]}</div>`).join('') +
    `<div class="lg"><i style="background:${NA}"></i>자료 없음</div>` +
    `<div class="lg"><i style="background:${BGC}"></i>미관측 도로</div>`;
}

function renderBar() {
  const mx = Math.max(...ST.day_mean), mn = Math.min(...ST.day_mean);
  document.getElementById('dbar').innerHTML = ST.day_mean.map((v, i) => {
    const w = ((v - mn * 0.9) / (mx - mn * 0.9) * 100).toFixed(1);
    const c = v === mn ? '#d95926' : (v === mx ? '#3987e5' : '#6b7280');
    return `<div class="br" onclick="setDay(${i})">
      <span class="bn">${DAY_KO[i]}</span>
      <span class="bt"><i style="width:${w}%;background:${c}"></i></span>
      <span class="bv">${v.toFixed(1)}</span></div>`;
  }).join('');
}

function renderRank() {
  const src = metric === 'abs' ? ST.rank_abs : (metric === 'delay' ? ST.rank_delay : ST.rank_ratio);
  const lb = metric === 'abs' ? '절대속도 최저 20'
           : (metric === 'delay' ? '지체시간 최대 20' : '속도비 최저 20 <span class="sub">= 제 속도를 못 내는 곳</span>');
  const unit = metric === 'abs' ? 'km/h' : (metric === 'delay' ? '초' : '%');
  document.getElementById('ranklb').innerHTML = lb;
  const rows = src.filter(r => rgOn[SEG[r[1]][F_RG]]).map((r, n) => {
    const s = SEG[r[1]];
    const c = metric === 'delay' ? '#d95926' : colorOf(r[0]);
    return `<div class="rk" onclick="focusSeg(${r[1]})">
      <span class="rn">${n + 1}</span>
      <span class="rt"><b>${s[F_NM]}</b><em>${s[F_FR]} → ${s[F_TO]} · ${RG_KO[s[F_RG]]} · ${s[F_LANE]}차로 · 제한 ${s[F_MX]}</em></span>
      <span class="rv" style="color:${c}">${r[0]}<em>${unit}</em></span></div>`;
  }).join('');
  document.getElementById('rank').innerHTML = rows ||
    '<div class="note">선택한 위계에 해당하는 구간이 없다. 위계 필터를 켜라.</div>';
}

function updateHead() {
  const t = document.getElementById('tnow');
  if (t) t.textContent = DAY_KO[curDay] + '요일 ' + ST.times[curStep];
}

function focusSeg(i) {
  const g = SEG[i][F_GEO];
  map.setFilter('l-hi', ['==', ['get', 'i'], i]);
  const xs = g.map(p => p[0]), ys = g.map(p => p[1]);
  map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
    { padding: 220, maxZoom: 15.5, duration: 700 });
}

let tip;
function showTip(ll, i) {
  const s = SEG[i];
  const v = SPD[curDay][i][curStep];
  const r = (v != null && s[F_MX]) ? (v / s[F_MX] * 100).toFixed(0) : null;
  if (!tip) tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'tp' });
  tip.setLngLat(ll).setHTML(
    `<div class="tw"><b>${s[F_NM]}</b>
     <div class="td">${s[F_FR]} → ${s[F_TO]}</div>
     <div class="tv" style="color:${colorOf(valOf(i))}">
       ${v == null ? '자료 없음' : v + ' km/h'}${r != null ? ` <s>제한 대비 ${r}%</s>` : ''}</div>
     <div class="tm">${RG_KO[s[F_RG]]} · ${s[F_LANE]}차로 · 제한 ${s[F_MX]}km/h · ${nf(s[F_LEN])}m${
       s[F_DELAY] != null ? ` · 지체 ${s[F_DELAY]}초` : ''}</div></div>`
  ).addTo(map);
}
function hideTip() { if (tip) tip.remove(); }

/* ── 글자 크기 — 사하·서구와 같은 규격 ── */
const FSBASE = { s: 1.15, m: 1.45, l: 1.80 };
const FSPW = { s: 0.34, m: 0.38, l: 0.43 };
function fsScale() { return Math.min(1.5, Math.max(1, (window.innerWidth || 1440) / 1900)); }
function setFs(k) {
  curFs = k;
  const d = document.getElementById('detail'); if (!d) return;
  const iw = window.innerWidth || 1440, narrow = iw < 960;
  const z = narrow ? 1 : +(FSBASE[k] * fsScale()).toFixed(3);
  const pw = Math.max(560, Math.min(1100, Math.round(iw * FSPW[k])));
  const cw = Math.round(pw / z);
  d.style.zoom = z;
  d.style.width = narrow ? '' : cw + 'px';
  d.classList.toggle('nk', !narrow && cw < 560);
  d.style.maxHeight = 'calc((100vh - 92px)/' + z + ')';
  d.querySelectorAll('.fsb').forEach((b, i) => b.classList.toggle('on', ['s', 'm', 'l'][i] === k));
  setTimeout(fitAll, 220);
}
window.addEventListener('resize', () => {
  clearTimeout(window.__rz); window.__rz = setTimeout(() => setFs(curFs), 260);
});
function toggleFold() {
  const d = document.getElementById('detail');
  d.classList.toggle('fold');
  const b = d.querySelector('.fold');
  if (b) b.textContent = d.classList.contains('fold') ? '▼ 펼치기' : '▲ 접기';
  setTimeout(fitAll, 200);
}

window.setDay = setDay; window.setStep = setStep; window.togglePlay = togglePlay;
window.pause = pause; window.setFs = setFs; window.toggleFold = toggleFold;
window.toggleSat = toggleSat; window.fitAll = fitAll; window.focusSeg = focusSeg;
window.setMetric = setMetric; window.toggleRg = toggleRg; window.toggleFlow = toggleFlow;
window.toggleBg = toggleBg;
