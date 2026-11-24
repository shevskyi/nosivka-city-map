'use strict';
const el = id => document.getElementById(id);
const map = el('map');
const detail = [885.2774744, 1827.462257, 336.4973031, 252.8318373];
const full = [0, 0, 1930, 3989];
// Satellite world file, EPSG:3857. SVG origin is the upper-left pixel edge.
const resolution = 6.287380680271034;
const west = 3509349.6808400596 - resolution / 2;
const north = 6621467.469377925 + resolution / 2;
const radius = 6378137;
const halfWorld = Math.PI * radius;
const namespace = 'http://www.w3.org/2000/svg';
const key = 'nosivka.manual.features.v1';
let box, frame, vertices = [], features = [], editing = false;
let storageAvailable = true;
try {
  features = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(features)) throw new Error();
} catch {
  features = [];
  storageAvailable = false;
}
function svg(tag, attrs, parent) {
  const node = document.createElementNS(namespace, tag);
  for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
  parent.append(node);
  return node;
}
function screenPoint(x,y) {
  return new DOMPoint(x,y).matrixTransform(map.getScreenCTM().inverse());
}
function show(next) {
  box = next;
  map.setAttribute('viewBox',box.join(' '));
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(updateTiles);
}
function zoom(factor, anchor) {
  const w = Math.min(7000,Math.max(map.clientWidth * .024,box[2]*factor));
  const k = w/box[2];
  show([anchor.x+(box[0]-anchor.x)*k,anchor.y+(box[1]-anchor.y)*k,w,box[3]*k]);
}
const tileNodes = new Map();
function updateTiles() {
  const scale = map.getScreenCTM().a;
  const lod = Math.log2(halfWorld*2/256 * scale/resolution);
  const z = Math.min(18, Math.ceil(lod));
  const span = 2*halfWorld/2**z;
  const start = screenPoint(0,0), end = screenPoint(map.clientWidth,map.clientHeight);
  const tx = x => Math.floor((west+x*resolution+halfWorld)/span);
  const ty = y => Math.floor((halfWorld-north+y*resolution)/span);
  const used = new Set();
  if(!el('offline').checked && z>=15) {
    for(let x=tx(Math.max(0,start.x));x<=tx(Math.min(full[2],end.x));x++){
      for(let y=ty(Math.max(0,start.y));y<=ty(Math.min(full[3],end.y));y++){
        const id = [z,y,x].join('/');
        used.add(id);
        if(tileNodes.has(id)) continue;
        const tile = svg('image',{x:(x*span-halfWorld-west)/resolution,
          y:(north-halfWorld+y*span)/resolution,width:span/resolution,height:span/resolution,
          preserveAspectRatio:'none'},el('tiles'));
        tile.addEventListener('error',()=>{tile.style.display='none';tileStatus();});
        tileNodes.set(id,tile);
        tile.setAttribute('href','https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+id+'?blankTile=false');
      }
    }
  }
  for(const [id,node] of tileNodes) if(!used.has(id)){node.remove();tileNodes.delete(id);}
  tileStatus();
}
function tileStatus() {
  const missing = [...tileNodes.values()].some(n=>n.style.display==='none');
  el('status').textContent = !storageAvailable ? 'Для збереження завантажте GeoJSON' :
    missing ? 'Частина знімків недоступна · показано локальну основу' :
    'Позначок: '+features.length;
}
function toGeo(p) {
  return [(west+p.x*resolution)/radius*180/Math.PI,
    Math.atan(Math.sinh((north-p.y*resolution)/radius))*180/Math.PI];
}
function fromGeo([lon,lat]) {
  return {x:(radius*lon*Math.PI/180-west)/resolution,
    y:(north-radius*Math.asinh(Math.tan(lat*Math.PI/180)))/resolution};
}
function paint(points, parent, color, closed) {
  if(!points.length) return;
  if(points.length===1) {
    svg('circle',{cx:points[0].x,cy:points[0].y,r:0.38,fill:color,stroke:color,'stroke-width':5,'vector-effect':'non-scaling-stroke'},parent);
  } else {
    svg(closed?'polygon':'polyline',{points:points.map(p=>p.x+','+p.y).join(' '),
      stroke:color,'stroke-width':2.5,'vector-effect':'non-scaling-stroke',fill:closed?color:'none',
      'fill-opacity':.25},parent);
  }
}
function render() {
  el('marks').replaceChildren();
  for(const f of features) {
    const g=f.geometry, coords=g.type==='Point'?[g.coordinates]:g.coordinates[0];
    paint(coords.map(fromGeo),el('marks'),f.properties.kind==='Будівля'?'#ffcf62':'#65e6d2',g.type==='Polygon');
  }
  el('draft').replaceChildren();
  paint(vertices,el('draft'),'#ffdc7c',vertices.length>=3);
  const point=el('kind').value==='Точка';
  el('hint').textContent=point?'Торкніться потрібного місця.':'Позначте кути по черзі (щонайменше 3).';
  el('undo').disabled=!vertices.length;
  el('save').disabled=point?!vertices.length:vertices.length<3;
  tileStatus();
}
function editor(open) {
  editing=open;vertices=[];el('editor').hidden=!open;
  el('newmark').disabled=open;map.classList.toggle('drawing',open);
  el('titleField').value='';render();
}
el('newmark').onclick=()=>editor(true);
el('cancel').onclick=()=>editor(false);
el('kind').onchange=()=>{vertices=[];render();};
el('undo').onclick=()=>{vertices.pop();render();};
el('save').onclick=()=>{
  const coords=vertices.map(toGeo), kind=el('kind').value;
  const geometry=kind==='Точка'?{type:'Point',coordinates:coords[0]}:
    {type:'Polygon',coordinates:[[...coords,coords[0]]]};
  features.push({type:'Feature',properties:{kind,name:el('titleField').value.trim()||kind},geometry});
  try {localStorage.setItem(key,JSON.stringify(features));storageAvailable=true;} catch {storageAvailable=false;}
  editor(false);
};
el('download').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({type:'FeatureCollection',features},null,2)],{type:'application/geo+json'}));
  const link=document.createElement('a');link.href=url;link.download='nosivka-zones.geojson';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
el('offline').onchange=()=>{
  el('survey').setAttribute('display',el('offline').checked?'inline':'none');
  updateTiles();
};
el('town').onclick=()=>show(full);el('center').onclick=()=>show(detail);
const middle=()=>({x:box[0]+box[2]/2,y:box[1]+box[3]/2});
el('plus').onclick=()=>zoom(.5,middle());el('minus').onclick=()=>zoom(2,middle());
el('toggle').onchange=()=>el('outlines').style.display=el('toggle').checked?'':'none';
map.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?.8:1.25,screenPoint(e.clientX,e.clientY));};
const fingers=new Map();
let tap=null;
map.onpointerdown=e=>{
  if(e.button!==0)return;
  map.setPointerCapture(e.pointerId);
  fingers.set(e.pointerId,[e.clientX,e.clientY]);
  tap=fingers.size===1?[e.clientX,e.clientY]:null;
};
map.onpointermove=e=>{
  const before=fingers.get(e.pointerId);
  if(!before)return;
  const after=[e.clientX,e.clientY];
  if(tap&&Math.hypot(after[0]-tap[0],after[1]-tap[1])>4)tap=null;
  const other=[...fingers].find(([id])=>id!==e.pointerId)?.[1];
  fingers.set(e.pointerId,after);
  if(other){
    const dist=p=>Math.hypot(p[0]-other[0],p[1]-other[1]);
    if(dist(after)>1&&dist(before)>1)zoom(dist(before)/dist(after),screenPoint(...other));
  } else if(!tap) {
    const a=screenPoint(...before), b=screenPoint(...after);
    show([box[0]+a.x-b.x,box[1]+a.y-b.y,box[2],box[3]]);
  }
};
map.onpointerup=e=>{
  if(editing&&tap&&fingers.has(e.pointerId)){
    const p=screenPoint(e.clientX,e.clientY);
    if(el('kind').value==='Точка')vertices=[p];else vertices.push(p);
    render();
  }
  fingers.delete(e.pointerId);tap=null;
};
map.onpointercancel=e=>{fingers.delete(e.pointerId);tap=null;};
window.addEventListener('resize',()=>show(box));
show(detail);render();
