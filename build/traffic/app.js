/* 부산 시간대별 도로 속도 지도 — 앱
   데이터는 {{SEG}} {{SPD}} {{STAT}} 자리에 빌드가 주입한다. */
const SEG = {{SEG}};
const SPD = {{SPD}};
const ST = {{STAT}};

/* ── 색 ────────────────────────────────────────────────────────────
   검증 팔레트에서만 파생한다(dataviz 검증기 PASS 색). 무지개 금지.
   속도는 '느릴수록 붉게' — 내비 관례를 따르되 임의색을 쓰지 않는다. */
const RAMP = [
  [0,  '#a8380f', '10 미만'],
  [10, '#d95926', '10~20'],
  [20, '#c98500', '20~30'],
  [30, '#199e70', '30~45'],
  [45, '#3987e5', '45 이상']
];
const NA = '#3f4550';
function colorOf(v) {
  if (v == null) return NA;
  let c = RAMP[0][1];
  for (const r of RAMP) if (v >= r[0]) c = r[1];
  return c;
}

const nf = n => n.toLocaleString('ko-KR');
const DAY_KO = ST.day_ko, NDAY = ST.n_day, NSTEP = ST.n_step;

/* ── 상태 ── */
let curDay = 0;        /* 0=월 */
let curStep = 0;       /* 0..NSTEP-1 */
let playing = false;
let timer = null;
let curFs = 's';
let hoverId = null;

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
      { id: 'bg', type: 'background', paint: { 'background-color': '#080a0d' } },
      { id: 'sat', type: 'raster', source: 'sat',
        layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55, 'raster-saturation': -0.5 } }
    ]
  },
  center: [(ST.bbox[0] + ST.bbox[2]) / 2, (ST.bbox[1] + ST.bbox[3]) / 2],
  zoom: 10, attributionControl: false, dragRotate: false
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

/* GeoJSON — 형상은 한 번만 만든다. 매 프레임 새로 만들면 9천 개에서 버벅인다. */
const FC = {
  type: 'FeatureCollection',
  features: SEG.map((s, i) => ({
    type: 'Feature', id: i,
    properties: { i: i, nm: s[0], f: s[1], t: s[2], road: s[3], ln: s[4], mx: s[5], v: null },
    geometry: { type: 'LineString', coordinates: s[6] }
  }))
};

let ready = false, bootT = 0;
/* 🔴 재시도 한도는 '횟수'가 아니라 '시간'이다.
   load·styledata·타이머가 같은 카운터를 같이 깎으면 회선이 느릴 때 앱이 영영 안 뜬다(사하 실측). */
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
}
map.on('load', boot); map.on('styledata', boot);
setTimeout(boot, 1200); setTimeout(boot, 3000);

function addLayers() {
  map.addSource('seg', { type: 'geojson', data: FC, generateId: false });
  /* 굵기는 줌에 따라. 얇으면 부산 전체 그림이 안 살고, 두꺼우면 도심이 뭉갠다.
     🔴 MapLibre 는 ['zoom'] 을 top-level interpolate/step 에서만 허용한다.
        ['*', W, 2.6] 처럼 감싸면 스타일이 통째로 거부된다(실측). 배율별로 따로 쓴다. */
  const W = k => ['interpolate', ['linear'], ['zoom'],
    9, 0.7 * k, 11, 1.6 * k, 13, 3.0 * k, 15, 5.5 * k, 17, 9 * k];
  map.addLayer({
    id: 'l-glow', type: 'line', source: 'seg',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['feature-state', 'c'], NA],
      'line-width': W(2.6),
      'line-opacity': 0.16, 'line-blur': 3
    }
  });
  map.addLayer({
    id: 'l-seg', type: 'line', source: 'seg',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['feature-state', 'c'], NA],
      'line-width': W(1),
      'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.22, 0.95]
    }
  });
  map.addLayer({
    id: 'l-hit', type: 'line', source: 'seg',
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': W(4) }
  });
  map.addLayer({
    id: 'l-hi', type: 'line', source: 'seg',
    filter: ['==', ['get', 'i'], -1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': W(1.9), 'line-opacity': 0.9 }
  });

  map.on('mousemove', 'l-hit', e => {
    const f = e.features && e.features[0]; if (!f) return;
    map.getCanvas().style.cursor = 'pointer';
    showTip(e.lngLat, f.properties);
  });
  map.on('mouseleave', 'l-hit', () => {
    map.getCanvas().style.cursor = ''; hideTip();
  });
  map.on('click', 'l-hit', e => {
    const f = e.features && e.features[0]; if (!f) return;
    focusSeg(+f.properties.i);
  });
}

/* ── 색 갱신 — feature-state 만 바꾼다(형상 재전송 없음) ── */
function paint() {
  if (!ready) return;
  const arr = SPD[curDay];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i][curStep];
    map.setFeatureState({ source: 'seg', id: i }, { c: colorOf(v) });
  }
  updateHead();
}

function fitAll() {
  const b = ST.bbox;
  const d = document.getElementById('detail');
  const w = window.innerWidth || 1440;
  const pad = (d && !d.classList.contains('fold') && w >= 960)
    ? { top: 96, bottom: 40, left: Math.round(d.getBoundingClientRect().width) + 30, right: 40 }
    : { top: 96, bottom: 40, left: 24, right: 24 };
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, duration: 0 });
}

/* ── 재생 ── */
function setStep(s) {
  curStep = ((s % NSTEP) + NSTEP) % NSTEP;
  paint();
  const sl = document.getElementById('slider'); if (sl) sl.value = curStep;
}
function setDay(d) { curDay = d; paint(); renderDays(); renderRank(); }
function play() {
  playing = true;
  clearInterval(timer);
  timer = setInterval(() => setStep(curStep + 1), 900);
  syncPlay();
}
function pause() { playing = false; clearInterval(timer); syncPlay(); }
function togglePlay() { playing ? pause() : play(); }
function syncPlay() {
  const b = document.getElementById('play');
  if (b) b.textContent = playing ? '⏸  멈춤' : '▶  재생';
}

/* ── 패널 ── */
function renderShell() {
  const el = document.getElementById('detail');
  el.innerHTML = `
    <div class="ph">
      <div>
        <div class="pt">부산 시간대별 도로 속도</div>
        <div class="ps">퇴근 피크 <b>${ST.times[0]}~${ST.times[ST.times.length - 1]}</b> · 요일별 평균</div>
      </div>
      <div class="pr">
        <div id="fsz"><b>글자</b>${['s,작게', 'm,보통', 'l,크게'].map(x => {
          const [k, n] = x.split(','); return `<button type="button" class="fsb" onclick="setFs('${k}')">${n}</button>`;
        }).join('')}</div>
        <button class="fold" onclick="toggleFold()">▲ 접기</button>
      </div>
    </div>

    <div id="kpi">
      <div class="k"><span>구간</span><b>${nf(ST.n_seg)}<em>개</em></b></div>
      <div class="k"><span>평균 속도</span><b>${ST.spd_mean}<em>km/h</em></b></div>
      <div class="k"><span>중앙값</span><b>${ST.spd_med}<em>km/h</em></b></div>
      <div class="k"><span>관측치</span><b>${nf(ST.total_obs)}<em>건</em></b></div>
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
      <div class="lb">속도 (km/h)</div>
      <div class="leg">${RAMP.map(r =>
        `<div class="lg"><i style="background:${r[1]}"></i>${r[2]}</div>`).join('')}
        <div class="lg"><i style="background:${NA}"></i>자료 없음</div>
      </div>
    </div>

    <div class="sec">
      <div class="lb">요일별 평균 속도</div>
      <div id="dbar"></div>
    </div>

    <div class="sec">
      <div class="lb">상습 정체 구간 <span class="sub">전 요일·전 시각 평균 최저 20</span></div>
      <div id="rank"></div>
    </div>

    <div class="sec">
      <div class="lb">보기</div>
      <div class="chips">
        <button class="chip" id="satb" onclick="toggleSat()">위성 배경</button>
        <button class="chip" onclick="fitAll()">전체 보기</button>
      </div>
      <div class="note">
        도로 형상 <b>국토교통부 표준노드링크</b>(2026-07-16) ·
        속도 <b>부산광역시 교통정보서비스센터</b> 구간레벨패턴정보(2026-06 공개분).
      </div>
      <div class="warn">
        <b>공개분은 18:00~18:55만 제공된다.</b> 24시간 전 시간대는 부산시 교통정보서비스센터에
        별도 신청해야 받을 수 있다(자료 설명에 명시). <b>없는 시간대를 추정해 그리지 않는다.</b>
      </div>
    </div>`;
  renderDays(); renderBar(); renderRank(); updateHead(); syncPlay();
}

function renderDays() {
  document.getElementById('days').innerHTML = DAY_KO.map((d, i) =>
    `<button class="chip${i === curDay ? ' on' : ''}" onclick="setDay(${i})">${d}</button>`).join('');
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
  const rows = ST.slow20.map((r, n) => {
    const s = SEG[r[1]];
    return `<div class="rk" onclick="focusSeg(${r[1]})">
      <span class="rn">${n + 1}</span>
      <span class="rt"><b>${s[0]}</b><em>${s[1]} → ${s[2]}</em></span>
      <span class="rv" style="color:${colorOf(r[0])}">${r[0].toFixed(1)}</span></div>`;
  }).join('');
  document.getElementById('rank').innerHTML = rows;
}

function updateHead() {
  const t = document.getElementById('tnow');
  if (t) t.textContent = DAY_KO[curDay] + '요일 ' + ST.times[curStep];
}

function focusSeg(i) {
  const s = SEG[i];
  map.setFilter('l-hi', ['==', ['get', 'i'], i]);
  const xs = s[6].map(p => p[0]), ys = s[6].map(p => p[1]);
  map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
    { padding: 220, maxZoom: 15.5, duration: 700 });
}

let tip;
function showTip(ll, p) {
  const v = SPD[curDay][+p.i][curStep];
  if (!tip) tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'tp' });
  tip.setLngLat(ll).setHTML(
    `<div class="tw"><b>${p.nm}</b>
     <div class="td">${p.f} → ${p.t}</div>
     <div class="tv" style="color:${colorOf(v)}">${v == null ? '자료 없음' : v + ' km/h'}</div>
     <div class="tm">${p.road || '-'} · ${p.ln}차로 · 제한 ${p.mx}km/h</div></div>`
  ).addTo(map);
}
function hideTip() { if (tip) tip.remove(); }

let satOn = false;
function toggleSat() {
  satOn = !satOn;
  map.setLayoutProperty('sat', 'visibility', satOn ? 'visible' : 'none');
  const b = document.getElementById('satb'); if (b) b.classList.toggle('on', satOn);
}

/* ── 글자 크기 ── 사하·서구와 같은 규격.
   zoom 은 폭까지 키우므로 CSS 폭을 배율로 나눠 상쇄한다. */
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
  d.style.maxHeight = 'calc((100vh - 96px)/' + z + ')';
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
