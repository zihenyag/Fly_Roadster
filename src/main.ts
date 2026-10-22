import './style.css';
import { FUNCTION_KEYS, controlsFromKeys } from './core';
import { SimulationClient, type GameState } from './drivingState';
import { View, type Quality } from './render';
import { AudioSystem } from './audio';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <canvas id="world" aria-label="Roadster 第一人称驾驶世界"></canvas>
  <header class="topbar"><a class="wordmark" href="#" aria-label="FLY! Roadster">FLY<span>!</span> Roadster</a><div class="journey"><span id="journey" hidden>沿海公路</span><b id="distance">0.00 KM</b></div><div class="top-actions"><button id="settings-button" aria-label="游戏设置" title="游戏设置">⚙</button><button id="pause-button" aria-label="暂停游戏" title="暂停游戏">Ⅱ</button></div></header>
  <div class="control-legend"><span><kbd>WASD / ↑↓←→</kbd> 驾驶</span><span><kbd>SPACE / 右CTRL</kbd> 起飞</span><span><kbd>SHIFT</kbd> 抓地</span><span class="quiet">固定推力 · 无轻重档</span><span><kbd>E / ESC</kbd> 暂停</span></div>
  <section id="intro" class="intro">
    <div class="start-card"><div class="card-top"><span>驾驶准备</span></div><p class="start-note">跟随导航，留意后视镜。<br>避开车辆与护栏，平稳落地。</p><div class="key-grid"><div><kbd>W A S D</kbd><span>左手驾驶</span></div><div><kbd>↑ ← ↓ →</kbd><span>右手驾驶 · 可混用</span></div><div><kbd>SPACE / 右CTRL</kbd><span>起飞 · 固定推力</span></div><div><kbd>左 / 右 SHIFT</kbd><span>抓地 · 固定推力</span></div></div><div class="space-note"><kbd>E / ESC</kbd><span>暂停 · 其他非功能键也会暂停</span></div><button id="start-button" class="primary" disabled><span id="loading-label">准备道路与驾驶舱…</span><span>↗</span></button><div class="start-footer"><span>80 km/h 滚动起步</span><span>桌面键盘</span></div></div>
  </section>
  <div id="loading-error" class="error" hidden></div>
  <div id="overlay" class="overlay" hidden><section class="modal"><div class="eyebrow" id="modal-eyebrow">TAKE A BREATH</div><h2 id="modal-title">旅程暂停</h2><p id="modal-description">路况与燃料已冻结。准备好后，继续驾驶。</p><div id="result-stats" hidden><div><span>本次旅程</span><strong id="result-distance">0.00<small>km</small></strong></div></div><div id="settings" hidden><label>车辆音效<input id="effects" type="checkbox" checked></label><label>导航语音<input id="voice" type="checkbox" checked></label><label>画面质量<select id="quality"><option value="high">高 · 镜面30 FPS</option><option value="low">低 · 镜面15 FPS</option></select></label><button id="fullscreen" class="secondary">切换全屏 ↗</button></div><button id="resume-button" class="primary"><span>继续驾驶</span><span>→</span></button><button id="restart-button" class="secondary">开启新的旅程 ↗</button><p class="modal-footnote">继续、重开与设置请用鼠标操作。</p></section></div>
  <div id="desktop-hint">本游戏需要桌面键盘。请使用横向宽屏体验完整驾驶舱。</div>
`;

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
$<HTMLSelectElement>('quality').insertAdjacentHTML('afterbegin','<option value="auto" selected>自动 · 自适应画质</option>');
const keys=new Set<string>();const blockedUntilRelease=new Set<string>();
const autoplay=/\/auto\/?$/.test(location.pathname)||(import.meta.env.DEV&&new URLSearchParams(location.search).get('autoplay')==='1');
let firstSeed=true,autoRestart=true;
let state:'loading'|'ready'|'running'|'paused'|'failed'='loading';let sim:GameState,view:View,client:SimulationClient;
const audio=new AudioSystem();let lastUI=0;let needsRender=true;
const seed=()=>{const fixed=new URLSearchParams(location.search).get('seed');if(import.meta.env.DEV&&autoplay&&firstSeed&&fixed!==null){firstSeed=false;return Number(fixed)>>>0;}firstSeed=false;return crypto.getRandomValues(new Uint32Array(1))[0];};
function sendInput(){client?.send({type:'input',controls:controlsFromKeys(keys)});}
function clearInput(){for(const k of keys)blockedUntilRelease.add(k);keys.clear();if(sim){sim.rawInput=controlsFromKeys(keys);sim.input=controlsFromKeys(keys);}sendInput();needsRender=true;}
function openOverlay(mode:'pause'|'settings'|'failure') {
  $('overlay').hidden=false;$('settings').hidden=mode!=='settings';$('result-stats').hidden=mode!=='failure';
  $('resume-button').hidden=mode==='failure';$('restart-button').hidden=mode==='settings';
  $('modal-eyebrow').textContent='FLY! Roadster';
  $('modal-title').textContent=mode==='failure'?sim.failure?.reason||'旅程结束':mode==='settings'?'驾驶设置':'旅程暂停';
  $('modal-description').textContent=mode==='failure'?sim.failure?.detail||'':mode==='settings'?'保持你的节奏。音效、导航和画质分别控制。':'路况与燃料已冻结。准备好后，继续驾驶。';
}
function pause(settings=false) {autoRestart=false;if(state!=='running'&&state!=='paused'&&!(settings&&state==='ready'))return;state='paused';clearInput();client.send({type:'pause'});audio.silence();openOverlay(settings?'settings':'pause');}
function resume(){if(state==='failed'||state==='loading')return;autoRestart=true;$('overlay').hidden=true;$('intro').hidden=true;clearInput();state='running';client.send({type:'resume'});audio.start();}
async function prepareSimulation(){
  client=new SimulationClient(seed());await client.ready;sim=client.state;if(autoplay)await client.enableAutoplay();
  client.onUpdate=()=>{if(sim.failure&&state==='running')fail();if(state!=='running')needsRender=true;};
  client.onError=error=>{pause();$('modal-description').textContent=`驾驶线程发生错误：${error.message}`;};
}
async function restart() {if(state==='loading')return;clearInput();audio.reset();client.dispose();state='loading';$<HTMLButtonElement>('restart-button').disabled=true;$('modal-title').textContent='准备新的道路…';try{await prepareSimulation();view.setSimulation(sim);state='paused';resume();}catch(error){$('modal-description').textContent=String(error);}finally{$<HTMLButtonElement>('restart-button').disabled=false;}}
function fail() {
  state='failed';clearInput();audio.silence();
  $('result-distance').innerHTML=`${(sim.distance/1000).toFixed(2)}<small>km</small>`;openOverlay('failure');
  if(autoplay)setTimeout(()=>{if(state==='failed'&&autoRestart)$('restart-button').click();},2500);
}
window.addEventListener('keydown',e=>{
  if(state!=='loading')e.preventDefault();
  if(!FUNCTION_KEYS.has(e.code)){pause();return;}
  if(!e.repeat)blockedUntilRelease.delete(e.code);
  if(state==='running'&&!blockedUntilRelease.has(e.code)){keys.add(e.code);sendInput();}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);blockedUntilRelease.delete(e.code);sendInput();});
window.addEventListener('blur',()=>{if(!autoplay)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!autoplay)pause();});
$('start-button').onclick=resume;$('resume-button').onclick=resume;$('restart-button').onclick=restart;
$('pause-button').onclick=()=>pause();$('settings-button').onclick=()=>pause(true);
$<HTMLInputElement>('effects').onchange=e=>{audio.effects=(e.target as HTMLInputElement).checked;};
$<HTMLInputElement>('voice').onchange=e=>{audio.voice=(e.target as HTMLInputElement).checked;if(!audio.voice&&'speechSynthesis'in window)speechSynthesis.cancel();};
$<HTMLSelectElement>('quality').onchange=e=>{view.setQuality((e.target as HTMLSelectElement).value as Quality);needsRender=true;};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen();};
document.querySelector('.wordmark')!.addEventListener('click',e=>{e.preventDefault();pause();});
window.addEventListener('resize',()=>{view?.resize();needsRender=true;});

async function boot() {
  try {
    await prepareSimulation();view=new View($<HTMLCanvasElement>('world'),sim);view.render();
    state='ready';$<HTMLButtonElement>('start-button').disabled=false;$('loading-label').textContent='开始驾驶';
    // Read-only telemetry and deterministic harness for local verification; omitted from production.
    if(import.meta.env.DEV)Object.defineProperty(window,'__roadster',{get:()=>({sim,view,state,keys,controlsFromKeys,pause,resume,client})});
    requestAnimationFrame(loop);
    if(autoplay)$('start-button').click();
  } catch(error) {console.error(error);$('loading-error').hidden=false;$('loading-error').textContent=`驾驶舱未能启动：${String(error)}。请使用支持 WebGL 2 的浏览器。`; $('loading-label').textContent='启动失败';}
}
function loop(now:number) {
  if(state==='running')audio.update(sim);
  if(now-lastUI>100){$('distance').textContent=`${(sim.distance/1000).toFixed(2)} KM`;document.querySelector<HTMLElement>('.control-legend')!.hidden=sim.s>300;lastUI=now;}
  if(state==='running'||needsRender){view.render(now,state==='running');needsRender=false;}requestAnimationFrame(loop);
}
void boot();

