const { launch } = require('./cdp');
(async () => {
  const b = await launch();
  await b.goto('http://localhost:8080/');
  const out = await b.evalJS(`(async()=>{
    const files=['drills/p1e-01','tests/placement'];
    const items=[];
    for(const f of files){
      const [kind,name]=f.split('/');
      const d=await App.Data.loadFile(kind,name);
      (d.items||[]).filter(x=>x.part===1).forEach(x=>items.push({id:x.id,svg:x.svg,scene:x.sceneTh}));
    }
    const cv=document.createElement('canvas'); cv.width=200; cv.height=150;
    const ctx=cv.getContext('2d');
    const res=[];
    for(const it of items){
      const clean=App.UI.sanitizeSVG(it.svg);
      const blob=new Blob([clean],{type:'image/svg+xml'});
      const url=URL.createObjectURL(blob);
      const info=await new Promise(r=>{
        const img=new Image();
        img.onload=()=>{
          ctx.clearRect(0,0,200,150);
          try{ctx.drawImage(img,0,0,200,150);}catch(e){return r({err:'draw:'+e.message})}
          let data;
          try{data=ctx.getImageData(0,0,200,150).data;}catch(e){return r({err:'read:'+e.message})}
          const seen=new Set(); let opaque=0;
          for(let i=0;i<data.length;i+=4){
            if(data[i+3]>10){opaque++; seen.add((data[i]>>4)+','+(data[i+1]>>4)+','+(data[i+2]>>4));}
          }
          r({nw:img.naturalWidth,nh:img.naturalHeight,colors:seen.size,fill:Math.round(opaque/(200*150)*100)});
        };
        img.onerror=()=>r({err:'load failed'});
        img.src=url;
      });
      res.push({id:it.id, ...info, kids:(clean.match(/<(rect|circle|ellipse|line|polyline|polygon|path|g)\\b/g)||[]).length});
    }
    return JSON.stringify(res);
  })()`);
  const rows = JSON.parse(out);
  let bad = 0;
  for (const r of rows) {
    const problem = r.err || r.colors <= 2 || r.fill < 25 || !r.nw;
    if (problem) { bad++; console.log('❌', r.id, JSON.stringify(r)); }
  }
  console.log(`\nรวม ${rows.length} ภาพ · มีปัญหา ${bad}`);
  console.log('ตัวอย่างที่ปกติ:', JSON.stringify(rows.filter(r=>!r.err && r.colors>2 && r.fill>=25).slice(0,3)));
  b.close(); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
