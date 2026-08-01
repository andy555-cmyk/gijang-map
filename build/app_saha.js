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
const YTH={{YTH}};

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


/* 청년·고령 지표 램프 — LVRAMP 와 같은 방식으로 검증 팔레트에서 파생한 단일색조다.
   무지개 금지. 발산(변화폭)만 예외로 주황(#d95926)↔파랑(#3987e5), 중립은 회색(#6b7280). */
const RYTH=[[11,'#cde2fb'],[13.5,'#9ec5f4'],[15.5,'#6da7ec'],[18,'#3987e5'],[25,'#184f95']];
const ROLD=[[18,'#f7e7c6'],[23,'#e3bb72'],[28,'#c98500'],[37,'#8a5b00']];
const RDR =[[-11,'#a8380f'],[-7,'#d95926'],[-3,'#e0997c'],[0,'#6b7280'],[1.5,'#3987e5']];

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

/* ── 청년·고령 지표를 법정동 경계에 붙인다 ─────────────────────────
   원자료는 행정동(16개)이고 지도 경계는 법정동(8개)이다. YTH.json 생성 단계에서
   행정동을 법정동으로 합산해 뒀다. 여기서는 조인만 한다.
   ⚠ 스타일에 glyphs 가 없어 symbol 레이어(라벨)를 쓸 수 없다. 이름은 호버로 보여준다. */
const YI=YTH.years.length-1, Y0=0;
const EMD_YTH={type:'FeatureCollection',features:EMD_MAIN.features.map(f=>{
  const n=f.properties.n, v=YTH.emd[n];
  const q={n:n,has:v?1:0};
  if(v){q.tot=v.tot[YI];q.yth=v.yth[YI];q.old=v.old[YI];
        q.r=v.r[YI];q.r0=v.r[Y0];q.dr=v.dr;q.ychg=v.ychg;q.tchg=v.tchg;
        q.oldr=+(v.old[YI]/v.tot[YI]*100).toFixed(2);}
  return {type:'Feature',properties:q,geometry:f.geometry};})};
const YTH_MISS=EMD_YTH.features.filter(f=>!f.properties.has).map(f=>f.properties.n);

/* ── 청년 진단 파생값 ──────────────────────────────────────────
   전부 원자료(YTH.sigg.b, 연도×5세밴드)에서 계산한다. 상수 하드코딩 금지 —
   자료가 갱신되면 화면이 따라 바뀌어야 한다. */
const BI={}; YTH.bands.forEach((b,i)=>BI[b]=i);
const Y_FIRST=String(YTH.years[0]), Y_LAST=String(YTH.years[YI]);
/* 65세 이상은 한 칸으로 묶는다 — 13칸 + 1칸 = 14행이 화면에 들어간다 */
const PBANDS=YTH.bands.slice(0,13).concat([['65세 이상',13,YTH.bands.length]]);
function bandVal(yr,spec){const b=YTH.sigg.b[yr];
  if(Array.isArray(spec))return b.slice(spec[1],spec[2]).reduce((a,c)=>a+c,0);
  return b[BI[spec]];}
const PYR=PBANDS.map(sp=>{const k=Array.isArray(sp)?sp[0]:sp;
  const a=bandVal(Y_FIRST,sp), z=bandVal(Y_LAST,sp);
  return {k:k.replace('세 이상','+').replace('세',''),a:a,z:z,d:a?(z/a-1)*100:0};});
const PYR_MAX=Math.max(...PYR.map(p=>Math.max(p.a,p.z)));

/* 코호트 잔존율 — 15년 뒤(5세 3칸) 같은 세대가 몇 % 남았나.
   출생 감소와 유출을 가르는 유일한 방법이다. 100% 미만이면 순유출이다. */
const COH_FROM=String(YTH.years[2]), COH_TO=Y_LAST, COH_YRS=YTH.years[YI]-YTH.years[2];
const COH=YTH.bands.slice(2,11).map((k,i)=>{const j=i+2;
  const a=YTH.sigg.b[COH_FROM][j], z=YTH.sigg.b[COH_TO][j+3];
  return {k:k,to:YTH.bands[j+3],a:a,z:z,r:a?z/a*100:0};}).filter(c=>c.a>0);
const COH_MIN=COH.reduce((m,c)=>c.r<m.r?c:m,COH[0]);
const COH_MAX=COH.reduce((m,c)=>c.r>m.r?c:m,COH[0]);


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
const SG=YTH.sigg;
const SG_R0=+(SG.yth[0]/SG.tot[0]*100).toFixed(2), SG_R1=+(SG.yth[YI]/SG.tot[YI]*100).toFixed(2);
const SG_O0=+(SG.old[0]/SG.tot[0]*100).toFixed(1), SG_O1=+(SG.old[YI]/SG.tot[YI]*100).toFixed(1);
const SG_TCHG=+((SG.tot[YI]/SG.tot[0]-1)*100).toFixed(1), SG_YCHG=+((SG.yth[YI]/SG.yth[0]-1)*100).toFixed(1);
/* 목표 역산 — 첫해 청년 비중을 지금 총인구에 적용하면 몇 명이 모자라나.
   ⚠ SG_R0 보다 먼저 선언하면 TDZ 로 스크립트 전체가 죽는다(실측). 이 위치를 지켜라. */
const GOAL_R=SG_R0, GOAL_NEED=Math.round(SG.tot[YI]*GOAL_R/100)-SG.yth[YI];
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
  addSources();addLayers();fitTarget();renderShell();selectLayer('bld');setFs('m');}
map.on('load',boot); map.on('styledata',boot); setTimeout(boot,1200); setTimeout(boot,3000);
map.once('idle',()=>doFit());

function addSources(){
  map.addSource('emd',{type:'geojson',data:EMD_MAIN});
  map.addSource('emdv',{type:'geojson',data:EMDV_MAIN});
  map.addSource('zon',{type:'geojson',data:ZONING});
  map.addSource('site',{type:'geojson',data:{type:'FeatureCollection',features:[SITE]}});
  map.addSource('bld',{type:'geojson',data:BUILDINGS});
  map.addSource('fac',{type:'geojson',data:FACTORIES});
  map.addSource('yth',{type:'geojson',data:EMD_YTH});
}

function zgExpr(prop){const e=['match',['get',prop]];ZG.forEach((g,i)=>e.push(i,g.c));e.push(ZG[4].c);return e;}
function bldColor(mode){
  if(mode==='zone')return zgExpr('zg');
  if(mode==='lv'){const e=['interpolate',['linear'],['get','lv']];LVRAMP.forEach(([v,c])=>e.push(v,c));return e;}
  return ['case',['==',['get','ind'],1],'#d95926','#4b5563'];
}

function ythColor(m){
  const key=m==='old'?'oldr':(m==='dr'?'dr':'r');
  const ramp=m==='old'?ROLD:(m==='dr'?RDR:RYTH);
  const e=['interpolate',['linear'],['get',key]];
  ramp.forEach(([v,c])=>e.push(v,c));
  return ['case',['==',['get','has'],1],e,'#3a3f47'];
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

  /* 법정동 코로플레스 — 건물보다 아래, 위성 바로 위에 깐다 */
  map.addLayer({id:'l-yth',type:'fill',source:'yth',
    paint:{'fill-color':ythColor('r'),'fill-opacity':0.68},layout:{visibility:'none'}});
  map.addLayer({id:'l-yth-o',type:'line',source:'yth',
    paint:{'line-color':'#0b0d11','line-width':1.2,'line-opacity':0.75},layout:{visibility:'none'}});

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
  /* V5 레이아웃 기준 패딩 — 상단 탭 스트립 높이와 왼쪽 패널 폭을 DOM 에서 실측한다.
     하드코딩하면 탭이 2줄로 접힐 때 대상지가 스트립 뒤로 들어간다. */
  const sh=document.getElementById('shell'), dt=document.getElementById('detail');
  const shH=(sh?sh.offsetHeight:60)+10;
  /* ⚠ zoom 을 쓰므로 offsetWidth 가 아니라 getBoundingClientRect 를 봐야 한다.
     offsetWidth 는 배율 전 값이라 패널 뒤로 대상지가 숨는다. */
  const dtW=(dt&&!dt.classList.contains('fold'))?dt.getBoundingClientRect().width+24:24;
  map.fitBounds(TGT_BB,{padding:w<960?{top:shH+8,bottom:28,left:10,right:10}
                                    :{top:shH,bottom:30,left:dtW,right:28},duration:0});
  /* ⚠ 줌 보정은 폐기했다. 좌우 분리판(패딩 292/296)에서는 fitBounds 가 보수적이라
     +0.30+pitch*0.0115 을 되돌려 줬는데, V5(왼쪽 패널 584px)에서는 그 보정이 과해
     대상지 남쪽이 화면 밖으로 나간다(실측 2026-08-01: bump 0.15 부터 이미 벗어남).
     지금은 pitch 0/28/40 모두 bump 없이 정확히 물린다. 다시 넣지 마라. */
}
window.addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(doFit,180);});

/* ── 레이어 정의 ──────────────────────────────────────────────── */
function chips(items){return items.map(([c,k,v])=>
  `<div class="row"><i style="background:${c}"></i><span>${k}</span><b>${v}</b></div>`).join('');}

const LAYERS={
 bld:{t:'건축물',sub:nf(NB)+'동',
   show:['l-bld','l-site','l-site-o'],hide:['l-zon','l-zon-o','l-fac','l-fac-h','l-yth','l-yth-o'],
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
   show:['l-fac','l-site-o'],hide:['l-zon','l-zon-o','l-bld','l-fac-h','l-yth','l-yth-o'],
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

 yth:{t:'청년 지표',sub:'20~34세 · 18년',
   show:['l-yth','l-yth-o','l-site-o'],hide:['l-bld','l-zon','l-zon-o','l-fac','l-fac-h'],
   modes:[['r','청년 비중'],['dr','비중 변화'],['old','고령 비중']],
   legend(m){
     const E=Object.entries(YTH.emd);
     const q=`<div class="warn2"><b>왜 청년이 머물지 않는가</b> · <b>머물게 하려면</b><br>
       이 두 질문이 이 레이어의 목적입니다. 아래 수치가 앞 질문의 정량 답입니다.</div>`;
     if(m==='dr'){
       const rows=E.map(([n,v])=>[n,v.dr,v.ychg,v.tchg]).sort((a,b)=>a[1]-b[1]);
       const mx=Math.max(...rows.map(r=>Math.abs(r[1])));
       return `<div class="grp">청년 비중 변화 ${YTH.years[0]} → ${YTH.years[YI]}</div>
       <div class="ramp"><span>-11p</span>
        <i style="background:linear-gradient(90deg,#a8380f,#d95926,#e0997c,#6b7280,#3987e5)"></i><span>+1.5p</span></div>
       ${rows.map(([n,d,yc,tc])=>`<div class="mp">
          <b class="mpc" style="background:${d<0?'#d95926':'#3987e5'}">${d<0?'▼':'▲'}</b>
          <div class="mpb"><div class="mpn">${n}</div>
            <div class="bar"><i style="width:${Math.max(3,Math.abs(d)/mx*100)}%;background:${d<0?'#d95926':'#3987e5'}"></i></div></div>
          <div class="mpv">${d>0?'+':''}${d}p</div></div>`).join('')}
       <div class="row tot"><span>사하구 전체</span><b>${SG_R0}% → ${SG_R1}%</b></div>
       <div class="row"><span>청년(20~34세) 증감</span><b>${SG_YCHG}%</b></div>
       <div class="row"><span>총인구 증감</span><b>${SG_TCHG}%</b></div>
       <div class="note">청년 감소율이 총인구 감소율의 <b>약 ${(SG_YCHG/SG_TCHG).toFixed(1)}배</b>입니다.
         인구가 주는 게 아니라 <b>청년이 먼저 빠지는</b> 구조입니다.</div>${q}`;
     }
     if(m==='old'){
       const rows=E.map(([n,v])=>[n,+(v.old[YI]/v.tot[YI]*100).toFixed(1)]).sort((a,b)=>b[1]-a[1]);
       return `<div class="grp">고령(65세+) 비중 · ${YTH.years[YI]}</div>
       <div class="ramp"><span>18%</span>
        <i style="background:linear-gradient(90deg,#f7e7c6,#e3bb72,#c98500,#8a5b00)"></i><span>37%</span></div>
       ${chips(rows.map(([n,v])=>['#c98500',n,v+'%']))}
       <div class="row tot"><span>사하구 전체</span><b>${SG_O0}% → ${SG_O1}%</b></div>
       <div class="note">18년 만에 <b>${(SG_O1/SG_O0).toFixed(1)}배</b>가 됐습니다.
         초고령사회 기준(20%)을 이미 넘겼습니다.</div>${q}`;
     }
     const rows=E.map(([n,v])=>[n,v.r[YI]]).sort((a,b)=>b[1]-a[1]);
     return `<div class="grp">청년(20~34세) 비중 · ${YTH.years[YI]}</div>
       <div class="ramp"><span>11%</span>
        <i style="background:linear-gradient(90deg,#cde2fb,#9ec5f4,#6da7ec,#3987e5,#184f95)"></i><span>25%</span></div>
       ${chips(rows.map(([n,v])=>['#3987e5',n,v+'%']))}
       <div class="row tot"><span>사하구 전체</span><b>${SG_R1}%</b></div>
       <div class="row"><span>청년 인구</span><b>${nf(SG.yth[YI])}명</b></div>
       <div class="note">법정동을 누르면 18년 추이를 볼 수 있습니다.</div>${q}`;},
   extra:`<div class="note">출처: <b>행정안전부 주민등록인구현황</b>(연말 기준, 5세 단위, ${YTH.years[0]}~${YTH.years[YI]}).
      원자료는 행정동 16개이며 지도 경계(법정동 8개)에 맞춰 합산했습니다.
      <b>공장별 재직인원·연령대는 공개 통계에 없습니다</b> — 사업체 단위 미시자료라
      발주처·산단관리공단 자료가 있어야 합니다.${YTH_MISS.length?'<br>⚠ 미매칭: '+YTH_MISS.join(', '):''}</div>`},

 diag:{t:'청년 진단',sub:'왜 줄었나 · 어떻게 올리나',
   show:['l-yth','l-yth-o','l-site-o'],hide:['l-bld','l-zon','l-zon-o','l-fac','l-fac-h'],
   modes:[['coh','왜 줄었나'],['pyr','연령 구조'],['tr','18년 추이'],['goal','얼마나 필요한가']],
   legend(m){
     const q=`<div class="warn2"><b>왜 청년이 머물지 않는가</b> · <b>머물게 하려면</b><br>
       남실장님이 이 툴에 요구한 두 질문입니다. 이 탭이 앞 질문에 답하고, 뒷 질문의 규모를 잽니다.</div>`;
     const src=`<div class="note">출처: <b>행정안전부 주민등록인구현황</b>(연말, 5세 단위, ${YTH.years[0]}~${YTH.years[YI]}).
       모든 수치는 원자료에서 계산한 것이며 추정치가 아닙니다.</div>`;

     if(m==='pyr'){
       const rows=PYR.map(p=>`<div class="pv">
          <span class="pl">${p.k}</span>
          <span class="pb">
            <i style="width:${p.a/PYR_MAX*100}%;background:#4b5563"></i>
            <i style="width:${p.z/PYR_MAX*100}%;background:${p.d<0?'#d95926':'#3987e5'}"></i>
          </span>
          <span class="pd" style="color:${p.d<0?'#f0a882':'#7fd4ff'}">${p.d>0?'+':''}${p.d.toFixed(0)}%</span>
        </div>`).join('');
       return `<div class="grp">연령 구조 ${YTH.years[0]} → ${YTH.years[YI]}</div>
         <div class="lg"><s><i style="background:#4b5563"></i>${YTH.years[0]}</s>
           <s><i style="background:#d95926"></i>${YTH.years[YI]} (감소)</s>
           <s><i style="background:#3987e5"></i>${YTH.years[YI]} (증가)</s></div>
         ${rows}
         <div class="note"><b>모든 연령대가 준 게 아닙니다.</b> 55세 위로는 늘었고,
           50세 아래는 전부 줄었습니다. <b>0~4세가 ${PYR[0].d.toFixed(0)}%</b> 로 가장 크게 빠졌습니다 —
           청년이 빠진 자리에 <b>다음 세대가 태어나지 않은</b> 것입니다.</div>${q}${src}`;
     }

     if(m==='tr'){
       const rs=SG.yth.map((v,i)=>v/SG.tot[i]*100), os=SG.old.map((v,i)=>v/SG.tot[i]*100);
       const bar=(arr,c,hi)=>arr.map((v,i)=>
         `<i title="${YTH.years[i]}년 ${v.toFixed(2)}%" style="height:${v/Math.max(...arr)*100}%;background:${i===arr.length-1?hi:c}"></i>`).join('');
       return `<div class="grp">청년(20~34세) 비중 18년</div>
         <div class="trend">${bar(rs,'#3987e5','#f0a882')}</div>
         <div class="tx"><span>${YTH.years[0]} · ${SG_R0}%</span><span>${YTH.years[YI]} · ${SG_R1}%</span></div>
         <div class="grp">고령(65세+) 비중 18년</div>
         <div class="trend">${bar(os,'#c98500','#f0a882')}</div>
         <div class="tx"><span>${YTH.years[0]} · ${SG_O0}%</span><span>${YTH.years[YI]} · ${SG_O1}%</span></div>
         <div class="kbig">
           <div><span>청년 비중</span><b class="dn">${SG_R0}→${SG_R1}<em>%</em></b></div>
           <div><span>고령 비중</span><b class="up">${SG_O0}→${SG_O1}<em>%</em></b></div>
           <div><span>교차 시점</span><b>${(()=>{for(let i=0;i<rs.length;i++)if(os[i]>rs[i])return YTH.years[i];return '아직';})()}<em>년</em></b></div>
         </div>
         <div class="note">막대는 매년 실측값입니다. <b>고령 비중이 청년 비중을 추월한 해</b>가
           위 세 번째 칸입니다. 한 번 교차하면 되돌아온 사례가 드뭅니다 — 다만 이는 일반론이며
           사하구에 대한 예측이 아닙니다.</div>${q}${src}`;
     }

     if(m==='goal'){
       /* ⚠ '청년과 닿는 사업'을 예산순 상위로 뽑으면 사실과 다르다.
          이름에 '청년'이 든 사업만 청년 사업으로 표시하고 나머지는 그대로 둔다. */
       const prog=MP.programs.slice().sort((a,b)=>b.b-a.b);
       const isY=n=>/청년/.test(n);
       const yb=MP.programs.filter(p=>isY(p.n)).reduce((a,c)=>a+c.b,0);
       return `<div class="grp">${YTH.years[0]}년 수준(${GOAL_R}%)으로 되돌리려면</div>
         <div class="gap">
           <div class="gt">지금 총인구 ${nf(SG.tot[YI])}명 기준</div>
           <div class="gn">청년 ${nf(GOAL_NEED)}명 부족</div>
           <div class="gs">현재 청년 ${nf(SG.yth[YI])}명 → 필요 ${nf(SG.yth[YI]+GOAL_NEED)}명.
             이 숫자는 <b>서부산스마트밸리 고용인원 ${nf(MP.employees)}명의 ${(GOAL_NEED/MP.employees).toFixed(1)}배</b>입니다.
             산단 고용만으로는 메울 수 없는 규모라는 뜻입니다.</div>
         </div>
         <div class="kbig">
           <div><span>현재 청년</span><b>${nf(SG.yth[YI])}<em>명</em></b></div>
           <div><span>부족분</span><b class="dn">${nf(GOAL_NEED)}<em>명</em></b></div>
           <div><span>입주업체</span><b>${nf(MP.firms)}<em>개</em></b></div>
         </div>
         <div class="grp">사업 배치도 단위사업 · 사업비순</div>
         ${prog.map(p=>`<div class="row"><i style="background:${isY(p.n)?'#3987e5':'#4b5563'}"></i>
            <span>${p.c}. ${p.n}${isY(p.n)?' <b style="color:#7fd4ff">청년</b>':''}</span>
            <b>${(p.b/100).toLocaleString('ko-KR')}억</b></div>`).join('')}
         <div class="row tot"><span>이름에 「청년」이 든 사업 합계</span>
           <b>${(yb/100).toLocaleString('ko-KR')}억 / ${MP.budget_eok.toLocaleString('ko-KR')}억
           (${(yb/100/MP.budget_eok*100).toFixed(1)}%)</b></div>
         <div class="warn"><b>여기서부터는 데이터가 답을 주지 않습니다.</b>
           위 숫자는 <b>목표의 크기</b>일 뿐이고, 어떤 사업이 청년을 몇 명 붙잡는지는
           공개 통계로 계산할 수 없습니다. 발주처의 워크숍 결과·입주기업 채용계획이 있어야
           연결이 가능합니다.</div>${q}`;
     }

     const mx=Math.max(...COH.map(c=>c.r));
     return `<div class="grp">코호트 잔존율 · ${COH_FROM} → ${COH_TO} (${COH_YRS}년)</div>
       <div class="lg"><s>같은 세대가 ${COH_YRS}년 뒤 사하구에 몇 % 남았는가</s></div>
       ${COH.map(c=>`<div class="pv">
          <span class="pl">${c.k.replace('세','')}</span>
          <span class="pb"><i style="width:${c.r/mx*100}%;background:${c.r<70?'#d95926':(c.r<80?'#c98500':'#3987e5')}"></i></span>
          <span class="pd">${c.r.toFixed(1)}%</span>
        </div>`).join('')}
       <div class="kbig">
         <div><span>가장 많이 빠진 세대</span><b class="dn">${COH_MIN.k.replace('세','')}<em>세</em></b></div>
         <div><span>그 세대 잔존율</span><b class="dn">${COH_MIN.r.toFixed(1)}<em>%</em></b></div>
         <div><span>가장 많이 남은 세대</span><b>${COH_MAX.k.replace('세','')}세 ${COH_MAX.r.toFixed(1)}<em>%</em></b></div>
       </div>
       <div class="warn"><b>이게 "왜 줄었나"의 답입니다.</b>
         ${COH_MAX.k}는 ${COH_MAX.r.toFixed(0)}% 가 남는데,
         <b>${COH_MIN.k}는 ${COH_MIN.r.toFixed(1)}% 만 남습니다.</b>
         고령화 때문에 청년이 준 게 아니라, <b>사회에 나가는 나이에 사하구를 떠납니다.</b>
         빠지는 지점이 특정 연령대에 몰려 있다는 것은 개입 지점도 거기라는 뜻입니다.</div>
       <div class="note">잔존율은 전입·전출·사망을 모두 합친 순변화입니다.
         이 연령대에서 사망은 무시할 수준이므로 <b>사실상 순유출</b>로 읽습니다.
         다만 유출의 <b>사유</b>(취업·진학·주거)는 이 자료로 구분되지 않습니다 — 확인 필요.</div>${q}${src}`;},
   extra:''},

 zon:{t:'용도지역',sub:nf(ZONING.features.length)+'구역',
   show:['l-zon','l-zon-o','l-site-o'],hide:['l-bld','l-fac','l-fac-h','l-yth','l-yth-o'],
   modes:[['all','전체'],['ind','공업계열만']],
   legend(){return `<div class="grp">계열별 구역 수</div>
     ${chips(ZG.map((g,i)=>[g.c,g.k,nf(ZONCNT[i])]))}`;},
   extra:`<div class="note">공업계열(일반·준·전용) 폴리곤을 병합한 것이 <b>대상지 경계</b>입니다.
      원본 산업단지 경계 shp 는 미확보이며 현재는 용도지역 기반 근사입니다.</div>`},

 site:{t:'대상지',sub:SITE.geometry.coordinates.length+'폴리곤',
   show:['l-site','l-site-o','l-bld'],hide:['l-zon','l-zon-o','l-fac','l-fac-h','l-yth','l-yth-o'],
   modes:[['fill','면']],
   legend(){return `<div class="grp">대상지 (공업지역 병합)</div>
     ${chips([['#d95926','공업계열 폴리곤',SITE.geometry.coordinates.length+'개']])}
     <div class="row"><span>대상지 내 건물</span><b>${nf(NSITE)}동</b></div>
     <div class="row"><span>대상지 내 필지</span><b>${nf(SITEPAR.length)}필지</b></div>
     <div class="row"><span>개별공시지가 중위</span><b>${JIGA_MED?nf(JIGA_MED)+'원/㎡':'미상'}</b></div>`;},
   extra:`<div class="note">사업 배치도 사업면적은 <b>${nf(MP.area_m2)}㎡</b>(원문 기준)입니다.
      위 폴리곤은 용도지역 기반 근사라 이 수치와 정확히 일치하지 않습니다.</div>`},

 mp:{t:'사업 배치도',sub:'A~G '+MP.programs.length+'개',   /* 명칭 확정: 마스터플랜 → 사업 배치도 (2026-07-31) */
   show:['l-site','l-site-o','l-bld'],hide:['l-zon','l-zon-o','l-fac','l-fac-h','l-yth','l-yth-o'],
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
let shown=false;
function selectLayer(k){
  /* 활성 탭을 다시 누르면 접힌다 — V5 동작(기장·서구와 동일).
     ⚠ setMode 는 selectLayer 가 아니라 renderLayer 를 부른다. 안 그러면 모드 클릭이 패널을 접는다. */
  if(shown&&cur===k){toggleFold();return;}
  cur=k; shown=true;
  const dt=document.getElementById('detail'); if(dt)dt.classList.remove('fold');
  renderLayer(k);
}
function renderLayer(k){
  Object.keys(LAYERS).forEach(kk=>{const el=document.getElementById('lb-'+kk);if(el)el.classList.toggle('on',kk===k);});
  const L=LAYERS[k];
  L.hide.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');});
  L.show.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','visible');});
  if(!curMode[k])curMode[k]=L.modes[0][0];
  document.getElementById('vhead').innerHTML=
    `<div class="vt">${L.t}</div><div class="vs">${L.sub}</div>
     <div id="fsz"><b>글자</b>${FSZ.map(([k,t])=>
        `<button class="fsb ${curFs===k?'on':''}" onclick="setFs('${k}')">${t}</button>`).join('')}</div>
     <button class="fold" onclick="toggleFold()">▲ 접기</button>`;
  document.getElementById('vmode').innerHTML=L.modes.length>1
    ? L.modes.map(([v,t])=>`<button class="mode ${curMode[k]===v?'on':''}" onclick="setMode('${v}')">${t}</button>`).join('')
    : `<div class="onemode">${L.modes[0][1]}</div>`;
  applyMode();
  document.getElementById('vbody').innerHTML=L.legend(curMode[k])+(L.extra||'');
  document.getElementById('vbody').scrollTop=0;
}
function setMode(v){curMode[cur]=v;renderLayer(cur);}
function applyMode(){
  const m=curMode[cur];
  if(cur==='bld'&&map.getLayer('l-bld'))map.setPaintProperty('l-bld','fill-extrusion-color',bldColor(m));
  if(cur==='fac'){
    map.setLayoutProperty('l-fac','visibility',m==='heat'?'none':'visible');
    map.setLayoutProperty('l-fac-h','visibility',m==='heat'?'visible':'none');
  }
  if(cur==='yth'&&map.getLayer('l-yth'))map.setPaintProperty('l-yth','fill-color',ythColor(m));
  if(cur==='zon'){
    const f=m==='ind'?['in',['get','u'],['literal',IND_ZONES]]:null;
    map.setFilter('l-zon',f);map.setFilter('l-zon-o',f);
  }
}
const FSZ=[['s','작게'],['m','보통'],['l','크게']];
let curFs='m';
const FSBASE={s:1.0,m:1.24,l:1.55};
/* ★ 배율은 화면 폭에 비례한다.
   1440px 에서 맞춘 크기를 2400px 모니터에 그대로 쓰면 60% 로 줄어 보인다(실측 2026-08-01).
   지자체 고위직이 회의실 대형 화면으로 본다 — 넓은 화면일수록 더 키워야 한다. */
function fsScale(){return Math.min(2.0,Math.max(1,(window.innerWidth||1440)/1440));}
function setFs(k){
  curFs=k;
  const d=document.getElementById('detail');if(!d)return;
  const z=+(FSBASE[k]*fsScale()).toFixed(3);
  d.style.zoom=z;
  d.style.maxHeight='calc((100vh - 118px)/'+z+')';
  const nv=document.getElementById('navlist'); if(nv)nv.style.zoom=+(1+(z-1)*0.62).toFixed(3);
  d.querySelectorAll('.fsb').forEach((b,i)=>b.classList.toggle('on',FSZ[i][0]===k));
  setTimeout(doFit,220);
}
window.addEventListener('resize',()=>{clearTimeout(window.__fsz);
  window.__fsz=setTimeout(()=>setFs(curFs),260);});
function toggleFold(){
  const d=document.getElementById('detail');if(!d)return;
  d.classList.toggle('fold');
  const b=d.querySelector('.fold');if(b)b.textContent=d.classList.contains('fold')?'▼ 펼치기':'▲ 접기';
  setTimeout(doFit,180);
}
window.setMode=setMode;window.selectLayer=selectLayer;window.toggleFold=toggleFold;window.setFs=setFs;

function renderShell(){
  document.getElementById('vkpi').innerHTML=[
    ['건축물',nf(NB),'동'],['등록공장',nf(NIND),'개'],['용도지역',nf(ZONING.features.length),'구역'],
    ['청년 비중',SG_R1,'%'],['청년 18년',SG_YCHG,'%']
  ].map(([a,b,c])=>`<div class="k"><span>${a}</span><b>${b}<em>${c}</em></b></div>`).join('');
  /* 긴 제목 자동 2줄 — 10자 초과 시 가운데에 가장 가까운 공백에서 나눈다 (V5 규격) */
  const br=t=>{if(t.length<=10||t.indexOf(' ')<0)return t;
    const m=t.length/2;let bi=-1,bd=99;
    for(let i=0;i<t.length;i++)if(t[i]===' '&&Math.abs(i-m)<bd){bd=Math.abs(i-m);bi=i;}
    return bi<0?t:t.slice(0,bi)+'\n'+t.slice(bi+1);};
  document.getElementById('navlist').innerHTML=Object.entries(LAYERS).map(([k,v])=>
    `<button id="lb-${k}" class="navitem" onclick="selectLayer('${k}')">
       <span class="nt">${br(v.t)}</span><span class="ns">${v.sub}</span></button>`).join('');
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
map.on('mousemove','l-yth',e=>{
  const p=e.features[0].properties;map.getCanvas().style.cursor='pointer';
  if(!p.has){pop.setLngLat(e.lngLat).setHTML(`<div class="pp"><b>${p.n}</b>
    <div class="pg na">인구 자료 미매칭</div></div>`).addTo(map);return;}
  const v=YTH.emd[p.n];
  const spark=v.r.map((x,i)=>`<i style="height:${Math.max(6,(x-8)/20*30)}px;background:${i===YI?'#f0a882':'#3987e5'}"></i>`).join('');
  pop.setLngLat(e.lngLat).setHTML(
   `<div class="pp"><b>${p.n}</b>
     <div class="ps">청년 비중 ${p.r0}% → <b>${p.r}%</b> (${p.dr>0?'+':''}${p.dr}p)</div>
     <div class="spark">${spark}</div>
     <div class="pu">청년 ${nf(v.yth[Y0])} → ${nf(p.yth)}명 (${p.ychg>0?'+':''}${p.ychg}%)</div>
     <div class="pu">총인구 ${nf(v.tot[Y0])} → ${nf(p.tot)}명 (${p.tchg>0?'+':''}${p.tchg}%)</div>
     <div class="pg"><i style="background:#c98500"></i>고령 ${p.oldr}%</div></div>`).addTo(map);
});
map.on('mouseleave','l-yth',()=>{map.getCanvas().style.cursor='';pop.remove();});

/* 3D 체감을 위해 첫 진입에 살짝 기울인다.
   ⚠ fitBounds 는 현재 pitch 를 반영한다. 기울인 뒤 다시 물려야 화면이 헐렁해지지 않는다.
      (pitch 를 주면 가시영역이 넓어져 대상지가 작아 보인다 — 실측) */
setTimeout(()=>{if(!ready)return;
  map.easeTo({pitch:28,duration:1200});
  setTimeout(doFit,1260);
},1600);
window.resetView=()=>{map.easeTo({pitch:0,bearing:0,duration:500});setTimeout(doFit,540);};
window.tilt=()=>{map.easeTo({pitch:map.getPitch()>10?0:40,duration:500});setTimeout(doFit,540);};
