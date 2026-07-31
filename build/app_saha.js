const BD={{BD}};
const ZONING={{ZONING}};
const EMD={{EMD}};
const EMDV={{EMDV}};
const SIGG={{SIGG}};
const SITE={{SITE}};
const SITEPAR={{SITEPAR}};
const FCT={{FCT}};
const IND={{IND}};
const MP={{MP}};

/* ══════════════════════════════════════════════════════════════════
   팔레트 — dataviz 검증기(scripts/validate_palette.js --mode dark)
   전 항목 PASS 확인본이다. 임의로 색을 바꾸면 검증이 깨진다.
     용도지역 4축  "#d55181,#3987e5,#199e70,#d95926"  → ALL PASS
     업종     8축  "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" → ALL PASS
   ⚠ 13개였던 용도지역을 4계열+미지정으로 묶었다. 8색을 넘는 범례는 읽히지 않는다.
   ⚠ '미지정'은 계열이 아니라 결측이다. 채도 있는 색을 주지 않고 중성 회색으로 둔다.
   ══════════════════════════════════════════════════════════════════ */
const ZG=[
 {k:'주거', c:'#3987e5', re:/주거/},
 {k:'상업', c:'#d55181', re:/상업/},
 {k:'공업', c:'#d95926', re:/공업/},
 {k:'녹지', c:'#199e70', re:/녹지/},
 {k:'미지정', c:'#6b7280', re:/./}
];
function zgOf(u){for(let i=0;i<ZG.length;i++)if(ZG[i].re.test(u||''))return i;return ZG.length-1;}

const SECTORS=[
 ['금속·도금',      '#3987e5', /도금|금속|주조|단조|열처리|절삭|강관|압연|철강|주물|용접|표면처리|알루미늄|비철|판금|철물|나사|볼트|스프링/],
 ['수산·식품',      '#d95926', /수산|식품|곡물|조리|냉동|훈제|어묵|육류|음료|도시락|제빵|장류|과자|두부|김치|절임|소금|얼음|떡|면류|커피|사료/],
 ['기계·장비',      '#199e70', /기계|밸브|펌프|베어링|공구|금형|장비|엔진|압축기|기어|하역|유압|공조|냉난방|산업용|동력/],
 ['섬유·의복',      '#c98500', /섬유|염색|의복|편조|신발|가죽|피복|봉제|모자|가방|원단|직물|양말|자수|재봉/],
 ['전기·전자',      '#d55181', /전기|전자|배전|반도체|케이블|전선|조명|음향|통신|축전지|변압기|제어반|계측|디스플레이/],
 ['화학·플라스틱',  '#008300', /화학|플라스틱|고무|도료|페인트|접착|비누|세제|수지|잉크|비료|폴리|합성|왁스|화장품|의약/],
 ['조선·선박',      '#9085e9', /선박|조선|해양|항해|어선|갑판/],
 ['기타',           '#e66767', /./]
];
function secOf(u){for(let i=0;i<SECTORS.length;i++)if(SECTORS[i][2].test(u||''))return i;return SECTORS.length-1;}

/* 층수 순차 램프 — 단일 색조(blue) 밝음→어두움. 무지개 금지. */
const LVRAMP=[[0,'#cde2fb'],[2,'#9ec5f4'],[4,'#6da7ec'],[7,'#3987e5'],[12,'#256abf'],[20,'#184f95']];
const INK={p:'#ffffff',s:'#c3c2b7',m:'#898781'};
const IND_ZONES=['일반공업지역','준공업지역','전용공업지역'];

/* ── 파생 ─────────────────────────────────────────────────────── */
const BUILDINGS={type:'FeatureCollection',features:BD.f.map((r,i)=>{
  const z=BD.zk[r[4]]||'';
  return {type:'Feature',id:i,
    properties:{lv:r[0],h:Math.max(3,(r[0]||1)*3.3),yr:r[2],site:r[3],z:z||'미지정',
                zg:zgOf(z),ind:IND_ZONES.indexOf(z)>=0?1:0},
    geometry:{type:'MultiPolygon',coordinates:r[9]}};})};

const FACTORIES={type:'FeatureCollection',features:IND.f.map((r,i)=>{
  const u=IND.ik[r[2]]||'';const s=secOf(u);
  return {type:'Feature',id:i,properties:{n:r[0],d:r[1],u:u,s:s,sn:SECTORS[s][0]},
          geometry:{type:'Point',coordinates:[r[3],r[4]]}};})};

/* ⚠ 법정동 경계에 앞바다 섬 37개가 섞여 있다(실측). 그대로 그리면 화면 아래 절반이
   섬 윤곽선이 되어 시선을 빼앗고, fitBounds 도 남북 24km 로 잡힌다. 본섬만 쓴다. */
function ringArea(r){let s=0;for(let i=0;i<r.length-1;i++)s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(s)/2;}
function mainland(fc){
  const ps=[];
  fc.features.forEach(f=>(f.geometry.coordinates||[]).forEach(poly=>{
    if(poly&&poly[0])ps.push({a:ringArea(poly[0]),poly:poly,n:f.properties.n});}));
  if(!ps.length)return ps;
  /* 기준은 '합계의 1%'가 아니라 '최대 폴리곤의 10%'다.
     합계 기준으로는 방파제·사주 같은 2%대 세장형 도형이 통과해 화면 아래를 윤곽선으로 채운다.
     실측: EMDV 42개 → 합계1% 5개(오답) / 최대10% 3개(정답: 다대·장림·신평 본섬)
           EMD  48개 → 최대10% 8개(법정동 8개 본섬) */
  const mx=Math.max(...ps.map(p=>p.a));
  return ps.filter(p=>p.a>=mx*0.10);
}
const MAIN_TGT=mainland(EMDV);
const EMDV_MAIN={type:'FeatureCollection',features:MAIN_TGT.map(p=>({
  type:'Feature',properties:{n:p.n},geometry:{type:'Polygon',coordinates:p.poly}}))};
const EMD_MAIN={type:'FeatureCollection',features:mainland(EMD).map(p=>({
  type:'Feature',properties:{n:p.n},geometry:{type:'Polygon',coordinates:p.poly}}))};

/* ── 집계 ─────────────────────────────────────────────────────── */
const NB=BD.f.length, NSITE=BD.f.filter(r=>r[3]).length, NIND=IND.f.length;
const LVN=BD.f.filter(r=>r[0]>0).length;
const ZGCNT=new Array(ZG.length).fill(0);
BUILDINGS.features.forEach(f=>ZGCNT[f.properties.zg]++);
const SECCNT=new Array(SECTORS.length).fill(0);
FACTORIES.features.forEach(f=>SECCNT[f.properties.s]++);
const ZONCNT=new Array(ZG.length).fill(0);
ZONING.features.forEach(f=>ZONCNT[zgOf(f.properties.u)]++);
const LVB=[[1,2,0],[3,5,0],[6,10,0],[11,99,0]];
BD.f.forEach(r=>{const v=r[0];if(!v)return;LVB.forEach(b=>{if(v>=b[0]&&v<=b[1])b[2]++;});});
const JIGA=SITEPAR.map(p=>+p.z).filter(v=>v>0).sort((a,b)=>a-b);
const JIGA_MED=JIGA.length?JIGA[Math.floor(JIGA.length/2)]:0;
const nf=n=>n.toLocaleString('ko-KR');

/* ── 지도 ─────────────────────────────────────────────────────── */
const ATTR='Imagery (c) Esri · 건물·용도지역·법정동·개별공시지가 (c) VWorld · 등록공장 (c) 부산광역시 제조업 공장등록현황(2025-12-31)';
const map=new maplibregl.Map({container:'map',antialias:true,
  style:{version:8,sources:{sat:{type:'raster',
    tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize:256,maxzoom:19,attribution:ATTR}},
  /* 위성이 밝고 채도가 높으면 데이터가 묻힌다. 베이스를 눌러 데이터를 띄운다. */
  layers:[{id:'sat',type:'raster',source:'sat',
    paint:{'raster-brightness-max':0.62,'raster-saturation':-0.42,'raster-contrast':0.12}}]},
  center:[128.968,35.068],zoom:12.4,pitch:0,bearing:0,attributionControl:false});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');
map.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:'metric'}),'bottom-right');
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');

let ready=false,bootN=0;
function boot(){if(ready)return;
  if(!map.isStyleLoaded()){if(bootN++<150)setTimeout(boot,200);return;}
  ready=true;
  addSources();addLayers();fitTarget();renderShell();selectLayer('bld');}
map.on('load',boot); map.on('styledata',boot); setTimeout(boot,1200); setTimeout(boot,3000);
map.once('idle',()=>doFit());

function addSources(){
  map.addSource('emd',{type:'geojson',data:EMD_MAIN});
  map.addSource('emdv',{type:'geojson',data:EMDV_MAIN});
  map.addSource('zon',{type:'geojson',data:ZONING});
  map.addSource('site',{type:'geojson',data:{type:'FeatureCollection',features:[SITE]}});
  map.addSource('bld',{type:'geojson',data:BUILDINGS});
  map.addSource('fac',{type:'geojson',data:FACTORIES});
}

function zgExpr(prop){const e=['match',['get',prop]];ZG.forEach((g,i)=>e.push(i,g.c));e.push(ZG[4].c);return e;}
function bldColor(mode){
  if(mode==='zone')return zgExpr('zg');
  if(mode==='lv'){const e=['interpolate',['linear'],['get','lv']];LVRAMP.forEach(([v,c])=>e.push(v,c));return e;}
  return ['case',['==',['get','ind'],1],'#d95926','#4b5563'];
}

function addLayers(){
  /* 대상지: 채움은 옅게, 테두리로 존재를 알린다(건물 색을 잡아먹지 않게) */
  map.addLayer({id:'l-site',type:'fill',source:'site',
    paint:{'fill-color':'#d95926','fill-opacity':0.10}});
  map.addLayer({id:'l-site-o',type:'line',source:'site',
    paint:{'line-color':'#f0a882','line-width':2,'line-opacity':0.95}});

  map.addLayer({id:'l-zon',type:'fill',source:'zon',
    paint:{'fill-color':zgExpr2(),'fill-opacity':0.5},layout:{visibility:'none'}});
  map.addLayer({id:'l-zon-o',type:'line',source:'zon',
    paint:{'line-color':'#0b0d11','line-width':0.6,'line-opacity':0.55},layout:{visibility:'none'}});

  /* ★ 건물 3D 압출 — 2D 평면 fill 은 위성 위에서 밋밋해 읽히지 않는다.
     서구판이 눈에 잘 들어오는 가장 큰 이유가 이것이다. */
  map.addLayer({id:'l-bld',type:'fill-extrusion',source:'bld',
    paint:{'fill-extrusion-color':bldColor('zone'),
           'fill-extrusion-height':['get','h'],
           'fill-extrusion-base':0,
           'fill-extrusion-opacity':0.93,
           'fill-extrusion-vertical-gradient':true}});

  map.addLayer({id:'l-emd',type:'line',source:'emd',
    paint:{'line-color':'#7d8794','line-width':0.9,'line-dasharray':[3,2.5],'line-opacity':0.55}});
  map.addLayer({id:'l-emdv',type:'line',source:'emdv',
    paint:{'line-color':'#ffffff','line-width':2.4,'line-opacity':0.9}});

  map.addLayer({id:'l-fac-h',type:'heatmap',source:'fac',
    paint:{'heatmap-weight':1,'heatmap-intensity':1.05,
      'heatmap-radius':['interpolate',['linear'],['zoom'],11,16,14,30,17,52],
      'heatmap-opacity':0.82,
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],
        0,'rgba(0,0,0,0)',0.15,'#184f95',0.35,'#3987e5',0.55,'#199e70',0.75,'#c98500',1,'#d95926']},
    layout:{visibility:'none'}});
  const sc=['match',['get','s']];SECTORS.forEach((s,i)=>sc.push(i,s[1]));sc.push('#e66767');
  map.addLayer({id:'l-fac',type:'circle',source:'fac',
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,3,14,5.2,17,8.5],
      'circle-color':sc,
      /* 겹치는 마크에는 표면색 링을 준다 — 점이 뭉쳐도 개수가 읽힌다 */
      'circle-stroke-width':1.4,'circle-stroke-color':'#0b0d11','circle-opacity':1},
    layout:{visibility:'none'}});
}
function zgExpr2(){const e=['match',['get','u']];
  ZONING.features.forEach(f=>{});
  const seen={};ZONING.features.forEach(f=>{const u=f.properties.u;if(!(u in seen)){seen[u]=1;e.push(u,ZG[zgOf(u)].c);}});
  e.push(ZG[4].c);return e;}

let TGT_BB=null;
function fitTarget(){
  let x1=180,y1=90,x2=-180,y2=-90;
  MAIN_TGT.forEach(p=>p.poly.forEach(r=>r.forEach(c=>{
    if(c[0]<x1)x1=c[0];if(c[0]>x2)x2=c[0];if(c[1]<y1)y1=c[1];if(c[1]>y2)y2=c[1];})));
  TGT_BB=[[x1,y1],[x2,y2]];doFit();
}
function doFit(){
  if(!TGT_BB)return;
  /* 컨테이너 크기 확정 전에 부르면 패딩이 폭을 먹어 넓게 물린다. resize 를 먼저 준다.
     ⚠ MapLibre 는 512px 타일이다. m/px = 78271*cos(lat)/2^z (156543 아님). */
  map.resize();
  const w=map.getCanvas().clientWidth||1440;
  const p=map.getPitch();
  map.fitBounds(TGT_BB,{padding:w<960?{top:52,bottom:28,left:10,right:10}
                                    :{top:56,bottom:36,left:292,right:296},duration:0});
  /* ⚠ pitch 가 붙으면 fitBounds 가 보수적으로 잡아 대상지가 화면의 절반만 쓴다(실측).
     기울기에 비례해 줌을 되돌려 준다. 값은 화면 대조로 맞춘 것이다. */
  if(p>8)map.setZoom(map.getZoom()+0.30+p*0.0115);
}
window.addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(doFit,180);});

/* ── 레이어 정의 ──────────────────────────────────────────────── */
function chips(items){return items.map(([c,k,v])=>
  `<div class="row"><i style="background:${c}"></i><span>${k}</span><b>${v}</b></div>`).join('');}

const LAYERS={
 bld:{t:'건축물',sub:nf(NB)+'동',
   show:['l-bld','l-site','l-site-o'],hide:['l-zon','l-zon-o','l-fac','l-fac-h'],
   modes:[['zone','용도지역'],['ind','공업지역 내외']],   /* 층수 모드 제외 — 공단지역이라 층수 표현 불필요 (2026-07-31 남실장님 확정) */
   legend(m){
     if(m==='lv')return `<div class="grp">지상 층수</div>
       <div class="ramp"><span>1층</span>
        <i style="background:linear-gradient(90deg,${LVRAMP.map(r=>r[1]).join(',')})"></i><span>20층+</span></div>
       ${chips(LVB.map((b,i)=>['#3987e5',b[1]>90?b[0]+'층 이상':b[0]+'~'+b[1]+'층',nf(b[2])]))}
       <div class="row tot"><span>층수 확보</span><b>${nf(LVN)} / ${nf(NB)}</b></div>
       <div class="row"><span>미상(0층)</span><b>${nf(NB-LVN)}</b></div>`;
     if(m==='ind')return `<div class="grp">공업지역 내외</div>
       ${chips([['#d95926','공업지역 내 건물',nf(BUILDINGS.features.filter(f=>f.properties.ind).length)],
                ['#4b5563','그 외',nf(NB-BUILDINGS.features.filter(f=>f.properties.ind).length)]])}
       <div class="row tot"><span>대상지 경계 내</span><b>${nf(NSITE)}동</b></div>`;
     return `<div class="grp">용도지역 계열</div>
       ${chips(ZG.map((g,i)=>[g.c,g.k,nf(ZGCNT[i])]))}
       <div class="note">13개 용도지역을 4계열+미지정으로 묶었습니다.
         8색을 넘는 범례는 읽히지 않습니다. 개별 용도지역명은 건물을 눌러 확인하세요.</div>`;},
   extra:`<div class="warn"><b>준공연도·건축물용도·연면적 미확보.</b>
      원천인 건축HUB(국토부 건축물대장 오픈API)가 공공데이터포털 개편(2026-07-29~08-02)으로
      응답하지 않습니다. <b>노후도 30년 판정은 이 값이 들어온 뒤 표시됩니다.</b></div>`},

 fac:{t:'등록공장',sub:nf(NIND)+'개',
   show:['l-fac','l-site-o'],hide:['l-zon','l-zon-o','l-bld','l-fac-h'],
   modes:[['pt','개별 위치'],['heat','밀도']],
   legend(m){
     if(m==='heat')return `<div class="grp">공장 밀도</div>
       <div class="ramp"><span>낮음</span>
        <i style="background:linear-gradient(90deg,#184f95,#3987e5,#199e70,#c98500,#d95926)"></i><span>높음</span></div>
       <div class="note">등록공장 ${nf(NIND)}개의 커널 밀도입니다. 줌에 따라 반경이 조정됩니다.</div>`;
     return `<div class="grp">업종 대분류</div>
       ${chips(SECTORS.map((s,i)=>[s[1],s[0],nf(SECCNT[i])]))}
       <div class="grp">법정동별</div>
       ${Object.entries(IND.by_dong).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
         `<div class="row"><span>${k}</span><b>${nf(v)}</b></div>`).join('')}`;},
   extra:`<div class="note">출처: 부산광역시 제조업 공장등록현황(2025-12-31, 파일데이터).
      지오코딩 성공 ${nf(NIND)}건 / 실패 ${IND.failed}건.
      <b>이 자료에는 종업원수·용지면적 항목이 없습니다.</b>
      467개 세부업종을 8축으로 묶었습니다 — 개별 업종명은 점을 눌러 확인하세요.</div>`},

 zon:{t:'용도지역',sub:nf(ZONING.features.length)+'구역',
   show:['l-zon','l-zon-o','l-site-o'],hide:['l-bld','l-fac','l-fac-h'],
   modes:[['all','전체'],['ind','공업계열만']],
   legend(){return `<div class="grp">계열별 구역 수</div>
     ${chips(ZG.map((g,i)=>[g.c,g.k,nf(ZONCNT[i])]))}`;},
   extra:`<div class="note">공업계열(일반·준·전용) 폴리곤을 병합한 것이 <b>대상지 경계</b>입니다.
      원본 산업단지 경계 shp 는 미확보이며 현재는 용도지역 기반 근사입니다.</div>`},

 site:{t:'대상지',sub:SITE.geometry.coordinates.length+'폴리곤',
   show:['l-site','l-site-o','l-bld'],hide:['l-zon','l-zon-o','l-fac','l-fac-h'],
   modes:[['fill','면']],
   legend(){return `<div class="grp">대상지 (공업지역 병합)</div>
     ${chips([['#d95926','공업계열 폴리곤',SITE.geometry.coordinates.length+'개']])}
     <div class="row"><span>대상지 내 건물</span><b>${nf(NSITE)}동</b></div>
     <div class="row"><span>대상지 내 필지</span><b>${nf(SITEPAR.length)}필지</b></div>
     <div class="row"><span>개별공시지가 중위</span><b>${JIGA_MED?nf(JIGA_MED)+'원/㎡':'미상'}</b></div>`;},
   extra:`<div class="note">사업 배치도 사업면적은 <b>${nf(MP.area_m2)}㎡</b>(원문 기준)입니다.
      위 폴리곤은 용도지역 기반 근사라 이 수치와 정확히 일치하지 않습니다.</div>`},

 mp:{t:'사업 배치도',sub:'A~G '+MP.programs.length+'개',   /* 명칭 확정: 마스터플랜 → 사업 배치도 (2026-07-31) */
   show:['l-site','l-site-o','l-bld'],hide:['l-zon','l-zon-o','l-fac','l-fac-h'],
   modes:[['list','단위사업']],
   legend(){
     const mx=Math.max(...MP.programs.map(p=>p.b));
     const rows=MP.programs.map(p=>`<div class="mp">
       <b class="mpc">${p.c}</b>
       <div class="mpb"><div class="mpn">${p.n}</div>
         <div class="bar"><i style="width:${Math.max(3,p.b/mx*100)}%"></i></div></div>
       <div class="mpv">${(p.b/100).toLocaleString('ko-KR')}억</div></div>`).join('');
     return `<div class="grp">${MP.name}</div>
       <div class="row"><span>사업면적</span><b>${nf(MP.area_m2)}㎡</b></div>
       <div class="row"><span>입주업체</span><b>${nf(MP.firms)}개</b></div>
       <div class="row"><span>고용인원</span><b>${nf(MP.employees)}인</b></div>
       <div class="row tot"><span>총 사업비</span><b>${MP.budget_eok.toLocaleString('ko-KR')}억원</b></div>
       <div class="grp">단위사업 · 사업비</div>${rows}`;},
   extra:`<div class="warn">A~G 사업의 <b>위치 좌표는 원문(이미지)에만 있어 지도에 올리지 못했습니다.</b>
      도면화하려면 구역도 원본(shp/dwg 또는 좌표)이 필요합니다.</div>`}
};

let cur='bld', curMode={};
function selectLayer(k){
  cur=k;
  Object.keys(LAYERS).forEach(kk=>{const el=document.getElementById('lb-'+kk);if(el)el.classList.toggle('on',kk===k);});
  const L=LAYERS[k];
  L.hide.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');});
  L.show.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','visible');});
  if(!curMode[k])curMode[k]=L.modes[0][0];
  document.getElementById('vhead').innerHTML=
    `<div class="vt">${L.t}</div><div class="vs">${L.sub}</div>`;
  document.getElementById('vmode').innerHTML=L.modes.length>1
    ? L.modes.map(([v,t])=>`<button class="mode ${curMode[k]===v?'on':''}" onclick="setMode('${v}')">${t}</button>`).join('')
    : `<div class="onemode">${L.modes[0][1]}</div>`;
  applyMode();
  document.getElementById('vbody').innerHTML=L.legend(curMode[k])+(L.extra||'');
  document.getElementById('vbody').scrollTop=0;
}
function setMode(v){curMode[cur]=v;selectLayer(cur);}
function applyMode(){
  const m=curMode[cur];
  if(cur==='bld'&&map.getLayer('l-bld'))map.setPaintProperty('l-bld','fill-extrusion-color',bldColor(m));
  if(cur==='fac'){
    map.setLayoutProperty('l-fac','visibility',m==='heat'?'none':'visible');
    map.setLayoutProperty('l-fac-h','visibility',m==='heat'?'visible':'none');
  }
  if(cur==='zon'){
    const f=m==='ind'?['in',['get','u'],['literal',IND_ZONES]]:null;
    map.setFilter('l-zon',f);map.setFilter('l-zon-o',f);
  }
}
window.setMode=setMode;window.selectLayer=selectLayer;

function renderShell(){
  document.getElementById('kpi').innerHTML=[
    ['건축물',nf(NB),'동'],['대상지 내',nf(NSITE),'동'],['등록공장',nf(NIND),'개'],
    ['용도지역',nf(ZONING.features.length),'구역'],['필지',nf(SITEPAR.length),'필지']
  ].map(([a,b,c])=>`<div class="k"><span>${a}</span><b>${b}<em>${c}</em></b></div>`).join('');
  document.getElementById('lbox').innerHTML=Object.entries(LAYERS).map(([k,v])=>
    `<button id="lb-${k}" class="lb" onclick="selectLayer('${k}')">
       <span>${v.t}</span><em>${v.sub}</em></button>`).join('');
}

/* ── 호버 ─────────────────────────────────────────────────────── */
const pop=new maplibregl.Popup({closeButton:false,closeOnClick:false,maxWidth:'300px',offset:10});
map.on('mousemove','l-fac',e=>{
  const p=e.features[0].properties;map.getCanvas().style.cursor='pointer';
  pop.setLngLat(e.lngLat).setHTML(
   `<div class="pp"><b>${p.n}</b><div class="ps">${p.d}</div>
     <div class="pu">${p.u}</div>
     <div class="pg"><i style="background:${SECTORS[p.s][1]}"></i>${p.sn}</div></div>`).addTo(map);
});
map.on('mouseleave','l-fac',()=>{map.getCanvas().style.cursor='';pop.remove();});
map.on('mousemove','l-bld',e=>{
  const p=e.features[0].properties;map.getCanvas().style.cursor='pointer';
  pop.setLngLat(e.lngLat).setHTML(
   `<div class="pp"><b>${p.z}</b>
     <div class="ps">${p.site==1?'대상지 내':'대상지 외'}</div>
     <div class="pu">지상 ${p.lv>0?p.lv+'층':'<span class="na">미상</span>'}</div>
     <div class="pg na">준공연도 미확보 (건축HUB 대기)</div></div>`).addTo(map);
});
map.on('mouseleave','l-bld',()=>{map.getCanvas().style.cursor='';pop.remove();});

/* 3D 체감을 위해 첫 진입에 살짝 기울인다.
   ⚠ fitBounds 는 현재 pitch 를 반영한다. 기울인 뒤 다시 물려야 화면이 헐렁해지지 않는다.
      (pitch 를 주면 가시영역이 넓어져 대상지가 작아 보인다 — 실측) */
setTimeout(()=>{if(!ready)return;
  map.easeTo({pitch:28,duration:1200});
  setTimeout(doFit,1260);
},1600);
window.resetView=()=>{map.easeTo({pitch:0,bearing:0,duration:500});setTimeout(doFit,540);};
window.tilt=()=>{map.easeTo({pitch:map.getPitch()>10?0:40,duration:500});setTimeout(doFit,540);};
