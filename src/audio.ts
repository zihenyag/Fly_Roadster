import type { DrivingState } from './drivingState';
import { eventText } from './core';

export class AudioSystem {
  effects=true; voice=true;private ctx:AudioContext|null=null;private engine:OscillatorNode|null=null;private engineGain:GainNode|null=null;private jetGain:GainNode|null=null;private spoken=new Set<string>();
  start() {
    if(!this.ctx) {
      this.ctx=new AudioContext();this.engine=this.ctx.createOscillator();this.engine.type='triangle';this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineGain).connect(this.ctx.destination);this.engine.start();
      const noise=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*0.25;
      const source=this.ctx.createBufferSource();source.buffer=noise;source.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;this.jetGain=this.ctx.createGain();this.jetGain.gain.value=0;source.connect(filter).connect(this.jetGain).connect(this.ctx.destination);source.start();
    }
    void this.ctx.resume();
  }
  reset(){this.spoken.clear();if('speechSynthesis'in window)speechSynthesis.cancel();}
  silence(){if(this.ctx){this.engineGain!.gain.setTargetAtTime(0,this.ctx.currentTime,0.05);this.jetGain!.gain.setTargetAtTime(0,this.ctx.currentTime,0.05);}if('speechSynthesis'in window)speechSynthesis.cancel();}
  update(s:DrivingState) {
    if(this.ctx) {
      this.engine!.frequency.setTargetAtTime(45+s.speed*2.7+Math.abs(s.rawInput.gas)*45,this.ctx.currentTime,0.15);
      this.engineGain!.gain.setTargetAtTime(this.effects?0.025+s.speed*0.00022:0,this.ctx.currentTime,0.15);
      this.jetGain!.gain.setTargetAtTime(this.effects?(s.rawInput.lift*0.32+s.rawInput.grip*0.15)*s.fuelFactor:0,this.ctx.currentTime,0.06);
    }
    if(!this.voice||!('speechSynthesis'in window))return;
    for(const e of s.route.nextEvents(s.s)) {
      const distance=e.at-s.s;
      for(const milestone of e.kind==='bump'?[500]:[2000,1000,500,200]) {
        const key=`${e.id}-${e.kind}-${milestone}`;
        if(distance<=milestone&&!this.spoken.has(key)) {
          // Skip milestones already passed when a new run/visibility state starts.
          this.spoken.add(key);if(distance<milestone-120)continue;
          const msg=new SpeechSynthesisUtterance(`${milestone>=1000?milestone/1000+'公里':milestone+'米'}后，${eventText(e).replace('前方','').replace('·','，')}。${e.reserve&&milestone===2000?`建议保留百分之${e.reserve}燃料。`:''}`);
          msg.lang='zh-CN';msg.rate=1.06;const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('zh'));if(voice)msg.voice=voice;speechSynthesis.speak(msg);return;
        }
      }
    }
  }
}
