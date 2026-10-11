(function(){
  "use strict";
  const TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rng(seed){let n=seed>>>0;return function(){n=(n*1664525+1013904223)>>>0;return n/4294967296;}}
  function mount(canvas){
    if(!canvas||!canvas.getContext)return function(){};
    const host=canvas.closest(".hero")||canvas.parentElement;
    const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
    if(!ctx)return function(){};
    const reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    let w=0,h=0,dpr=1,raf=0,observer=null,disposed=false,last=0,elapsed=0;
    let pointerX=0,pointerY=0,targetX=0,targetY=0,stars=[];
    let count=620,scale=0.9,centerX=0,centerY=0,roll=-0.14,tilt=0.38;
    function buildStars(){
      const random=rng(20261011);
      const small=window.matchMedia&&window.matchMedia("(max-width: 720px)").matches;
      count=small?260:Math.max(420,Math.min(920,Math.round(w*1.55)));
      scale=clamp(Math.min(w*0.48,h*0.94),78,260);
      stars=[];
      for(let i=0;i<count;i++){
        const r=Math.pow(random(),0.77);
        const arm=Math.floor(random()*3);
        const theta=arm*TAU/3 + r*TAU*1.72 + (random()-0.5)*(0.12+0.7*(1-r));
        const radius=clamp(r+(random()-0.5)*0.055,0.025,1.04);
        const drift=(random()-0.5)*0.14;
        stars.push({
          r:radius,theta,drift,size:0.35+Math.pow(random(),5)*1.3,
          phase:random()*TAU,brightness:0.28+random()*0.72,
          warm:random()>0.91
        });
      }
    }
    function resize(){
      if(disposed)return;
      const rect=host.getBoundingClientRect();
      w=Math.max(1,rect.width);h=Math.max(1,rect.height);
      dpr=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      canvas.style.width="100%";canvas.style.height="100%";
      ctx.setTransform(dpr,0,0,dpr,0,0);
      centerX=w*0.72;centerY=h*0.52;
      buildStars();draw(elapsed);
    }
    function draw(t){
      if(disposed||!ctx)return;
      ctx.clearRect(0,0,w,h);
      const dx=pointerX*w*0.025,dy=pointerY*h*0.025;
      const cx=centerX+dx,cy=centerY+dy;
      const cos=Math.cos(roll),sin=Math.sin(roll);
      const glow=ctx.createRadialGradient(cx,cy,1,cx,cy,scale*0.76);
      glow.addColorStop(0,"rgba(202,255,154,0.16)");
      glow.addColorStop(0.18,"rgba(139,202,125,0.08)");
      glow.addColorStop(1,"rgba(139,202,125,0)");
      ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(cx,cy,scale*0.78,scale*0.78*tilt,roll,0,TAU);ctx.fill();
      for(let i=0;i<stars.length;i++){
        const s=stars[i];
        const a=s.theta+t*(0.045+0.055/(s.r+0.22))+s.drift*Math.sin(t*0.17+s.phase);
        const rr=s.r*scale;
        const gx=Math.cos(a)*rr,gy=Math.sin(a)*rr*tilt;
        const x=cx+gx*cos-gy*sin,y=cy+gx*sin+gy*cos;
        if(x<-2||y<-2||x>w+2||y>h+2)continue;
        const twinkle=0.72+0.28*Math.sin(t*(0.7+s.brightness)+s.phase);
        const alpha=clamp(s.brightness*twinkle*(1-s.r*0.48),0.12,0.88);
        ctx.fillStyle=s.warm?"rgba(255,224,164,"+alpha.toFixed(3)+")":"rgba(201,246,177,"+alpha.toFixed(3)+")";
        const size=s.size*(0.65+s.r*0.7);
        ctx.fillRect(x-size/2,y-size/2,size,size);
      }
      const core=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(5,scale*0.13));
      core.addColorStop(0,"rgba(255,255,219,0.34)");
      core.addColorStop(0.2,"rgba(207,255,159,0.22)");
      core.addColorStop(1,"rgba(178,236,137,0)");
      ctx.fillStyle=core;ctx.beginPath();ctx.ellipse(cx,cy,scale*0.15,scale*0.15*tilt,roll,0,TAU);ctx.fill();
    }
    function tick(now){
      raf=0;if(disposed)return;
      if(document.hidden){last=now;return;}
      if(last)elapsed+=Math.min(0.1,Math.max(0,now-last)/1000);
      last=now;
      pointerX+=(targetX-pointerX)*0.035;
      pointerY+=(targetY-pointerY)*0.035;
      draw(elapsed);
      raf=requestAnimationFrame(tick);
    }
    function start(){
      if(disposed||reduced||coarse||w<720||document.hidden)return;
      if(!raf){last=0;raf=requestAnimationFrame(tick);}
    }
    function stop(){if(raf){cancelAnimationFrame(raf);raf=0;}}
    function move(e){
      if(reduced||coarse)return;
      const r=host.getBoundingClientRect();
      targetX=clamp((e.clientX-r.left)/Math.max(1,r.width)-0.5,-0.5,0.5);
      targetY=clamp((e.clientY-r.top)/Math.max(1,r.height)-0.5,-0.5,0.5);
    }
    function leave(){targetX=0;targetY=0;}
    function visibility(){
      if(document.hidden)stop();
      else start();
    }
    host.addEventListener("pointermove",move,{passive:true});
    host.addEventListener("pointerleave",leave,{passive:true});
    document.addEventListener("visibilitychange",visibility);
    if(window.ResizeObserver){observer=new ResizeObserver(resize);observer.observe(host);}
    else window.addEventListener("resize",resize,{passive:true});
    resize();
    start();
    return function(){
      disposed=true;stop();
      if(observer)observer.disconnect();else window.removeEventListener("resize",resize);
      host.removeEventListener("pointermove",move);host.removeEventListener("pointerleave",leave);
      document.removeEventListener("visibilitychange",visibility);
      ctx.clearRect(0,0,w,h);
    };
  }
  window.BarelyBinaryOrbits={mount};
})();