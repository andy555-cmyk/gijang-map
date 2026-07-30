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

/* ── 업종 대분류 ─────────────────────────────────────────────
   공장등록현황의 업종명(467종)을 8개 축으로 묶는다. 순서가 우선순위다.  */
const SECTORS=[
 ['수산·식품', /수산|식품|곡물|조리|냉동|훈제|어묵|육류|음료|도시락|제빵|장류|과자|두부|김치|절임|소금|얼음|건조|수産|떡|면류|커피|차류|사료/],
 ['조선·선박', /선박|조선|해양|항해|어선|기관실|갑판/],
 ['금속·도금', /도금|금속|주조|단조|열처리|절삭|강관|압연|철강|주물|용접|표면처리|알루미늄|비철|판금|구조용|철물|나사|볼트|스프링|단열재/],
 ['기계·장비', /기계|밸브|펌프|베어링|공구|금형|장비|엔진|압축기|기어|하역|건설기계|동력|유압|공조|냉난방|산업용/],
 ['전기·전자', /전기|전자|배전|반도체|케이블|전선|조명|음향|통신|축전지|변압기|제어반|계측|반도체|디스플레이/],
 ['화학·플라스틱', /화학|플라스틱|고무|도료|페인트|접착|비누|세제|수지|잉크|비료|폴리|합성|왁스|화장품|의약/],
 ['섬유·의복', /섬유|염색|의복|편조|신발|가죽|피복|봉제|모자|가방|원단|직물|양말|자수|재봉/],
 ['인쇄·종이·목재', /인쇄|출판|종이|지류|판지|목재|합판|가구|박스|포장|제책/],
 ['비금속·건자재', /시멘트|콘크리트|유리|도자|석재|벽돌|아스팔트|골재|내화/],
 ['자동차·운송장비', /자동차|차량|철도|항공|자전거|타이어|부품 제조업$/],
 ['기타', /./]
];
const SECOL=['#3aa0ff','#00c2a8','#ffb020','#e0574a','#b07cff','#3fc46b','#ff7ac0',
             '#c9a227','#7f95a8','#f0793a','#68788a'];
function sectorOf(u){for(let i=0;i<SECTORS.length;i++){if(SECTORS[i][1].test(u))return i;}return SECTORS.length-1;}

/* ── 용도지역 색 ─────────────────────────────────────────── */
const ZCOL={};
ZONING.features.forEach(f=>{ZCOL[f.properties.u]=f.properties.col;});
const IND_ZONES=['일반공업지역','준공업지역','전용공업지역'];

/* ── 파생 데이터 ─────────────────────────────────────────── */
const BUILDINGS={type:'FeatureCollection',features:BD.f.map((r,i)=>({
  type:'Feature',id:i,
  properties:{lv:r[0],ab:r[1],yr:r[2],site:r[3],z:BD.zk[r[4]]||'미지정',u:BD.uk[r[5]]||'',
              a:r[6],hh:r[7],ind:IND_ZONES.indexOf(BD.zk[r[4]])>=0?1:0},
  geometry:{type:'MultiPolygon',coordinates:r[9]}}))};

const FACTORIES={type:'FeatureCollection',features:IND.f.map((r,i)=>{
  const u=IND.ik[r[2]]||'';const s=sectorOf(u);
  return {type:'Feature',id:i,properties:{n:r[0],d:r[1],u:u,s:s,sn:SECTORS[s][0]},
          geometry:{type:'Point',coordinates:[r[3],r[4]]}};})};

const PARCELS={type:'FeatureCollection',features:[]};   // 필지는 표로만 (기하 미보유)

const TGT=EMDV.features.map(f=>f.properties.n);
const NB=BD.f.length, NSITE=BD.f.filter(r=>r[3]).length, NIND=IND.f.length;
const ZCNT={};BD.f.forEach(r=>{const z=BD.zk[r[4]]||'미지정';ZCNT[z]=(ZCNT[z]||0)+1;});
const SECCNT=new Array(SECTORS.length).fill(0);
FACTORIES.features.forEach(f=>SECCNT[f.properties.s]++);
const LVN=BD.f.filter(r=>r[0]>0).length;
const JIGA=SITEPAR.map(p=>+p.z).filter(v=>v>0);
const JIGA_MED=JIGA.length?JIGA.sort((a,b)=>a-b)[Math.floor(JIGA.length/2)]:0;

/* ── 지도 ────────────────────────────────────────────────── */
const ATTR='Imagery (c) Esri | 건물·용도지역·법정동 (c) VWorld | 등록공장 (c) 부산광역시 제조업 공장등록현황(2025-12-31) | 개별공시지가 (c) VWorld';
const map=new maplibregl.Map({container:'map',
  style:{version:8,sources:{sat:{type:'raster',
    tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize:256,maxzoom:19,attribution:ATTR}},
  layers:[{id:'sat',type:'raster',source:'sat'}]},
  center:[128.968,35.072],zoom:12.6,attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
map.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:'metric'}),'bottom-right');
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');

let ready=false;
function boot(){
  if(ready)return; ready=true;
  addSources(); addLayers(); fitTarget(); renderStats(); selectLayer('bld');
}
/* rAF 는 백그라운드 탭에서 발화하지 않는다(실측). 타이머로도 한 번 더 건다. */
map.on('load',boot); setTimeout(boot,1200); setTimeout(boot,3000);
setTimeout(()=>{if(ready)doFit();},1600); map.once('idle',()=>doFit());

function addSources(){
  map.addSource('emd',{type:'geojson',data:EMD});
  map.addSource('emdv',{type:'geojson',data:EMDV});
  map.addSource('zon',{type:'geojson',data:ZONING});
  map.addSource('site',{type:'geojson',data:{type:'FeatureCollection',features:[SITE]}});
  map.addSource('bld',{type:'geojson',data:BUILDINGS});
  map.addSource('fac',{type:'geojson',data:FACTORIES});
}

function zonPaint(){
  const e=['match',['get','u']];
  Object.keys(ZCOL).forEach(k=>{e.push(k,ZCOL[k]);});
  e.push('#9aa5b1');return e;
}
function bldPaint(mode){
  if(mode==='zone'){const e=['match',['get','z']];
    Object.keys(ZCOL).forEach(k=>{e.push(k,ZCOL[k]);});e.push('#8899aa');return e;}
  if(mode==='lv')return ['interpolate',['linear'],['get','lv'],0,'#2b3442',1,'#2f6f9e',3,'#3aa0ff',6,'#ffb020',12,'#e0574a'];
  return ['case',['==',['get','ind'],1],'#c07cff','#5b6673'];   // 공업지역 내 건물 강조
}

function addLayers(){
  map.addLayer({id:'l-zon',type:'fill',source:'zon',paint:{'fill-color':zonPaint(),'fill-opacity':0.42},layout:{visibility:'none'}});
  map.addLayer({id:'l-zon-o',type:'line',source:'zon',paint:{'line-color':'#0b1017','line-width':0.5,'line-opacity':0.6},layout:{visibility:'none'}});

  map.addLayer({id:'l-site',type:'fill',source:'site',paint:{'fill-color':'#a855f7','fill-opacity':0.22}});
  map.addLayer({id:'l-site-o',type:'line',source:'site',paint:{'line-color':'#d8b4fe','line-width':1.8}});

  map.addLayer({id:'l-bld',type:'fill',source:'bld',paint:{'fill-color':bldPaint('zone'),'fill-opacity':0.9}});
  map.addLayer({id:'l-bld-o',type:'line',source:'bld',minzoom:15,paint:{'line-color':'#0b1017','line-width':0.3,'line-opacity':0.5}});

  map.addLayer({id:'l-emd',type:'line',source:'emd',paint:{'line-color':'#7f8c9b','line-width':0.8,'line-dasharray':[3,2],'line-opacity':0.7}});
  map.addLayer({id:'l-emdv',type:'line',source:'emdv',paint:{'line-color':'#ffffff','line-width':2.2,'line-opacity':0.95}});

  map.addLayer({id:'l-fac-h',type:'heatmap',source:'fac',maxzoom:16,
    paint:{'heatmap-weight':0.9,'heatmap-intensity':0.9,'heatmap-radius':26,'heatmap-opacity':0.75,
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',0.2,'#1d3f66',0.4,'#2f7fb5',0.6,'#3fc46b',0.8,'#ffb020',1,'#e0574a']},
    layout:{visibility:'none'}});
  const sc=['match',['get','s']];SECOL.forEach((c,i)=>{sc.push(i,c);});sc.push('#8899aa');
  map.addLayer({id:'l-fac',type:'circle',source:'fac',
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,2.2,14,4,17,7],
      'circle-color':sc,'circle-stroke-width':0.7,'circle-stroke-color':'#0b1017','circle-opacity':0.95}});
}

/* ⚠ 다대동 법정동 경계에는 앞바다 섬 37개가 들어 있다(실측).
   전체 폴리곤으로 fitBounds 하면 남북 24km 로 잡혀 산단이 점으로 보인다.
   면적 1% 이상인 본섬 폴리곤만으로 범위를 잡는다. */
function ringArea(r){let s=0;for(let i=0;i<r.length-1;i++){s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];}return Math.abs(s)/2;}
function mainlandPolys(fc){
  const ps=[];
  fc.features.forEach(f=>f.geometry.coordinates.forEach(poly=>{if(poly&&poly[0])ps.push([ringArea(poly[0]),poly]);}));
  const tot=ps.reduce((a,p)=>a+p[0],0);
  return ps.filter(p=>p[0]>=tot*0.01).map(p=>p[1]);
}
function fitTarget(){
  let x1=180,y1=90,x2=-180,y2=-90;
  mainlandPolys(EMDV).forEach(poly=>poly.forEach(r=>r.forEach(c=>{
    if(c[0]<x1)x1=c[0];if(c[0]>x2)x2=c[0];if(c[1]<y1)y1=c[1];if(c[1]>y2)y2=c[1];})));
  TGT_BB=[[x1,y1],[x2,y2]];
  doFit();
}
let TGT_BB=null;
function doFit(){
  if(!TGT_BB)return;
  /* 컨테이너 크기가 확정되기 전에 fitBounds 를 호출하면 패딩이 폭을 잡아먹어
     필요보다 넓게 물린다(실측: 7.3km 를 18km 로 잡았다). resize 를 먼저 준다. */
  map.resize();
  const w=map.getCanvas().clientWidth||1440;
  const pad=w<920?{top:96,bottom:40,left:20,right:20}
                 :{top:112,bottom:56,left:230,right:290};
  map.fitBounds(TGT_BB,{padding:pad,duration:0});
}
window.addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(doFit,180);});

/* ── 레이어 정의 (좌: 선택 / 우: 값) — 남실장님 2026-07-27 지시 ── */
const LAYERS={
 bld:{t:'건축물',sub:NB.toLocaleString()+'동',
   on:['l-bld','l-bld-o'],off:['l-zon','l-zon-o','l-fac-h'],
   modes:[['zone','용도지역별'],['lv','층수별'],['ind','공업지역 내외']],
   panel:()=>{
     const rows=Object.entries(ZCNT).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
       `<div class="row"><i style="background:${ZCOL[k]||'#8899aa'}"></i><span>${k}</span><b>${v.toLocaleString()}</b></div>`).join('');
     return `<div class="grp">용도지역별 건물 수</div>${rows}
       <div class="grp">층수</div>
       <div class="row"><span>층수 확보</span><b>${LVN.toLocaleString()} / ${NB.toLocaleString()}</b></div>
       <div class="row"><span>미상(0층)</span><b>${(NB-LVN).toLocaleString()}</b></div>
       <div class="warn">준공연도·건축물용도·연면적은 <b>미확보</b>입니다.
         원천인 건축HUB(국토부 건축물대장 오픈API)가 공공데이터포털 개편(2026-07-29~08-02)으로 응답하지 않습니다.
         <b>노후도 30년 판정은 이 값이 들어온 뒤에만 표시됩니다.</b></div>`;}},

 fac:{t:'등록공장',sub:NIND.toLocaleString()+'개',
   on:['l-fac'],off:['l-zon','l-zon-o'],
   modes:[['pt','개별 위치'],['heat','밀도(열분포)']],
   panel:()=>{
     const rows=SECTORS.map((s,i)=>SECCNT[i]?
       `<div class="row"><i style="background:${SECOL[i]}"></i><span>${s[0]}</span><b>${SECCNT[i]}</b></div>`:'').join('');
     const dong=Object.entries(IND.by_dong).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
       `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
     return `<div class="grp">업종 대분류</div>${rows}
       <div class="grp">법정동별</div>${dong}
       <div class="note">출처: 부산광역시 제조업 공장등록현황(2025-12-31 기준, 파일데이터).
         지오코딩 성공 ${NIND.toLocaleString()}건 / 실패 ${IND.failed}건.
         <b>이 자료에는 종업원수·용지면적 항목이 없습니다.</b></div>`;}},

 zon:{t:'용도지역',sub:ZONING.features.length+'개 구역',
   on:['l-zon','l-zon-o'],off:['l-fac-h'],
   modes:[['all','전체'],['ind','공업계열만']],
   panel:()=>{
     const c={};ZONING.features.forEach(f=>{c[f.properties.u]=(c[f.properties.u]||0)+1;});
     const rows=Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
       `<div class="row"><i style="background:${ZCOL[k]||'#8899aa'}"></i><span>${k}</span><b>${v}</b></div>`).join('');
     return `<div class="grp">용도지역 구역 수</div>${rows}
       <div class="note">공업계열(일반·준·전용) 폴리곤을 병합한 것이 <b>대상지 경계</b>입니다.
         원본 산업단지 경계 shp 는 미확보 상태이며, 현재는 용도지역 기반 근사입니다.</div>`;}},

 site:{t:'대상지',sub:SITE.geometry.coordinates.length+'개 폴리곤',
   on:['l-site','l-site-o'],off:['l-zon','l-zon-o','l-fac-h'],
   modes:[['fill','면']],
   panel:()=>`<div class="grp">대상지 (공업지역 병합)</div>
     <div class="row"><span>구성 용도지역</span><b>${IND_ZONES.join(' · ')}</b></div>
     <div class="row"><span>폴리곤</span><b>${SITE.geometry.coordinates.length}개</b></div>
     <div class="row"><span>대상지 내 건물</span><b>${NSITE.toLocaleString()}동</b></div>
     <div class="row"><span>대상지 내 필지</span><b>${SITEPAR.length.toLocaleString()}필지</b></div>
     <div class="row"><span>개별공시지가 중위</span><b>${JIGA_MED?JIGA_MED.toLocaleString()+'원/㎡':'미상'}</b></div>
     <div class="note">마스터플랜 사업면적은 <b>2,815,006㎡</b>(원문 기준)입니다.
       위 폴리곤은 용도지역 기반 근사라 이 수치와 정확히 일치하지 않습니다.</div>`},

 mp:{t:'마스터플랜',sub:'A~G '+MP.programs.length+'개 사업',
   on:[],off:['l-zon','l-zon-o','l-fac-h'],
   modes:[['list','사업 목록']],
   panel:()=>{
     const rows=MP.programs.map(p=>
       `<div class="row"><b class="mpc">${p.c}</b><span>${p.n}</span><b>${(p.b/100).toLocaleString()}억</b></div>`).join('');
     return `<div class="grp">${MP.name}</div>
       <div class="row"><span>사업면적</span><b>${MP.area_m2.toLocaleString()}㎡</b></div>
       <div class="row"><span>입주업체</span><b>${MP.firms.toLocaleString()}개</b></div>
       <div class="row"><span>고용인원</span><b>${MP.employees.toLocaleString()}인</b></div>
       <div class="row"><span>총 사업비</span><b>${MP.budget_eok.toLocaleString()}억원</b></div>
       <div class="grp">단위사업</div>${rows}
       <div class="warn">A~G 사업의 <b>위치 좌표는 원문(이미지)에만 있어 지도에 올리지 못했습니다.</b>
         도면화하려면 남실장님의 구역도 원본(shp/dwg 또는 좌표)이 필요합니다.</div>`;}}
};

let cur='bld', curMode={};
function selectLayer(k){
  cur=k;
  Object.keys(LAYERS).forEach(kk=>{
    const el=document.getElementById('lb-'+kk); if(el)el.classList.toggle('on',kk===k);});
  const L=LAYERS[k];
  L.off.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');});
  L.on.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','visible');});
  if(!curMode[k])curMode[k]=L.modes[0][0];
  const mm=L.modes.map(([v,t])=>
    `<button class="mode ${curMode[k]===v?'on':''}" onclick="setMode('${v}')">${t}</button>`).join('');
  document.getElementById('vhead').innerHTML=`<div class="vt">${L.t}</div><div class="vs">${L.sub}</div>`;
  document.getElementById('vmode').innerHTML=mm;
  document.getElementById('vbody').innerHTML=L.panel();
  applyMode();
}
function setMode(v){curMode[cur]=v;selectLayer(cur);}
function applyMode(){
  const m=curMode[cur];
  if(cur==='bld'&&map.getLayer('l-bld'))map.setPaintProperty('l-bld','fill-color',bldPaint(m));
  if(cur==='fac'){
    if(map.getLayer('l-fac'))map.setLayoutProperty('l-fac','visibility',m==='heat'?'none':'visible');
    if(map.getLayer('l-fac-h'))map.setLayoutProperty('l-fac-h','visibility',m==='heat'?'visible':'none');
  }
  if(cur==='zon'&&map.getLayer('l-zon')){
    map.setFilter('l-zon',m==='ind'?['in',['get','u'],['literal',IND_ZONES]]:null);
    map.setFilter('l-zon-o',m==='ind'?['in',['get','u'],['literal',IND_ZONES]]:null);
  }
}
window.setMode=setMode; window.selectLayer=selectLayer;

function renderStats(){
  document.getElementById('kpi').innerHTML=[
    ['건축물',NB.toLocaleString(),'동'],
    ['대상지 내',NSITE.toLocaleString(),'동'],
    ['등록공장',NIND.toLocaleString(),'개'],
    ['용도지역',ZONING.features.length,'구역'],
    ['필지',SITEPAR.length.toLocaleString(),'필지']
  ].map(([a,b,c])=>`<div class="k"><span>${a}</span><b>${b}</b><em>${c}</em></div>`).join('');
  document.getElementById('lbox').innerHTML=Object.entries(LAYERS).map(([k,v])=>
    `<button id="lb-${k}" class="lb" onclick="selectLayer('${k}')">
       <span>${v.t}</span><em>${v.sub}</em></button>`).join('');
}

/* ── 호버 / 클릭 ─────────────────────────────────────────── */
const pop=new maplibregl.Popup({closeButton:false,closeOnClick:false,maxWidth:'300px'});
map.on('mousemove','l-fac',e=>{
  const p=e.features[0].properties;
  map.getCanvas().style.cursor='pointer';
  pop.setLngLat(e.lngLat).setHTML(
    `<div class="pp"><b>${p.n}</b><div class="ps">${p.d}</div>
     <div class="pu">${p.u}</div><div class="pg" style="color:${SECOL[p.s]}">${p.sn}</div></div>`).addTo(map);
});
map.on('mouseleave','l-fac',()=>{map.getCanvas().style.cursor='';pop.remove();});
map.on('mousemove','l-bld',e=>{
  if(curMode[cur]==='heat')return;
  const p=e.features[0].properties;
  pop.setLngLat(e.lngLat).setHTML(
    `<div class="pp"><b>건축물</b>
      <div class="ps">${p.z}</div>
      <div class="pu">지상 ${p.lv>0?p.lv+'층':'미상'} · ${p.site==1?'대상지 내':'대상지 외'}</div>
      <div class="pg" style="color:#8899aa">준공연도 미확보(건축HUB 대기)</div></div>`).addTo(map);
});
map.on('mouseleave','l-bld',()=>pop.remove());
