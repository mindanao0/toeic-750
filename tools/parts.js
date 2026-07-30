const { launch } = require('./cdp');
(async () => {
  const b = await launch();
  await b.setMobile(390, 844);
  await b.goto('http://localhost:8080/');
  const out = await b.evalJS(`App.Data.loadTest('placement').then(async t=>{
    const byPart={};
    t.units.forEach(u=>{ (byPart[u.part]=byPart[u.part]||[]).push(u); });
    const res={};
    for(const p of Object.keys(byPart)){
      const u=byPart[p][0];
      App.Quiz.start({units:[u],mode:'practice',title:'p'+p,backTo:'#/',onExit:()=>{},onFinish:()=>{}});
      await new Promise(r=>setTimeout(r,700));
      const app=document.getElementById('app');
      const txt=app.innerText||'';
      res[p]={
        qs:u.qs.length,
        choices:document.querySelectorAll('.choices .choice').length,
        passage:document.querySelectorAll('.passage').length,
        pHead:document.querySelectorAll('.passage .p-head').length,
        marks:document.querySelectorAll('.passage .mark').length,
        scene:!!document.querySelector('.scene-box > svg'),
        audio:!!document.querySelector('.audiobox'),
        script:!!document.querySelector('.script-box'),
        stem:(document.querySelector('.qstem')||{}).innerText||'',
        crashed:/เกิดข้อผิดพลาด/.test(txt),
        len:txt.length
      };
      // ตอบข้อแรกเพื่อดูเฉลย
      const c=document.querySelector('.choices .choice');
      if(c) c.click();
      await new Promise(r=>setTimeout(r,400));
      const exp=document.querySelector('.exp');
      res[p].explain = exp? {
        secs: exp.querySelectorAll('.exp-sec,.exp-point,.exp-trick').length,
        wrong: exp.querySelectorAll('.exp-wrong .w').length,
        vocab: exp.querySelectorAll('.vocab-chip').length,
        evidence: /หลักฐาน/.test(exp.innerText),
        sceneTh: /ในภาพคืออะไร/.test(exp.innerText)
      } : null;
    }
    return JSON.stringify(res);
  })`);
  const r = JSON.parse(out);
  const NAME={1:'Part 1 รูปภาพ',2:'Part 2 ถาม-ตอบ',3:'Part 3 บทสนทนา',4:'Part 4 บทพูด',5:'Part 5 เติมคำ',6:'Part 6 บทความ',7:'Part 7 อ่าน'};
  let bad=0;
  for (const p of Object.keys(r).sort()) {
    const x=r[p];
    const issues=[];
    if(x.crashed) issues.push('หน้าพัง');
    if(!x.choices) issues.push('ไม่มีตัวเลือก');
    if(!x.explain) issues.push('ไม่ขึ้นเฉลย');
    else if(x.explain.secs<2) issues.push('เฉลยไม่ครบ');
    if((p==='6'||p==='7') && !x.passage) issues.push('ไม่แสดงบทความ');
    if(p==='6' && !x.marks) issues.push('ไม่แสดงมาร์กช่องว่าง');
    if((p==='1'||p==='2'||p==='3'||p==='4') && !x.audio) issues.push('ไม่มีปุ่มเสียง');
    if(p==='1' && !x.scene) issues.push('ไม่มีภาพ');
    if(issues.length){bad++;console.log('❌',NAME[p],'—',issues.join(', '),JSON.stringify(x));}
    else console.log('✅',NAME[p].padEnd(20),`คำถาม ${x.qs} · ตัวเลือก ${x.choices} · บทความ ${x.passage} · เฉลย ${x.explain.secs} ส่วน / เหตุผลตัวลวง ${x.explain.wrong}`);
  }
  console.log('\nerrors:', JSON.stringify(b.errors).slice(0,300));
  console.log(bad? `❌ มีปัญหา ${bad} part` : '✅ ทุก part แสดงผลครบ');
  b.close(); process.exit(bad?1:0);
})().catch(e => { console.error(e.message); process.exit(1); });
