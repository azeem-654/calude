function buildHtml({ width, height, scale }) {
  const s = scale || 1;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${width}px; height:${height}px; overflow:hidden; font-family:'Helvetica Neue', Arial, sans-serif; }

  .stage {
    position:relative; width:100%; height:100%; overflow:hidden;
    background: linear-gradient(160deg, #12163c 0%, #1a1f6e 55%, #3b2a9e 100%);
    color:#fff;
  }
  .diag {
    position:absolute; left:0; right:0; bottom:0; height:46%;
    background: linear-gradient(100deg, #ff3b30 0%, #ff7a1a 55%, #ffb020 100%);
    clip-path: polygon(0 38%, 100% 0%, 100% 100%, 0% 100%);
  }
  .glow { position:absolute; border-radius:50%; filter:blur(90px); }
  .glow1 { width:${420*s}px; height:${420*s}px; background:rgba(255,255,255,0.14); top:${-140*s}px; left:${-100*s}px; }

  .content { position:relative; z-index:2; height:100%; display:flex; flex-direction:column; padding:${48*s}px ${56*s}px; }

  .brand { font-size:${24*s}px; font-weight:800; margin-bottom:${18*s}px; }
  .brand .go{ color:#fff; } .brand .hl{ color:#ffd166; }

  .kicker {
    display:inline-flex; align-self:flex-start; padding:${10*s}px ${24*s}px; border-radius:999px;
    background:rgba(255,255,255,0.14); border:${1.5*s}px solid rgba(255,255,255,0.5);
    color:#fff; font-size:${18*s}px; font-weight:800; letter-spacing:0.5px; margin-bottom:${22*s}px;
  }

  .headline { text-align:left; margin-bottom:${16*s}px; }
  .headline .l1 { font-size:${72*s}px; font-weight:900; line-height:1.02; letter-spacing:-1.5px; color:#fff; }
  .headline .l2 { font-size:${72*s}px; font-weight:900; line-height:1.05; letter-spacing:-1.5px; color:#ffd166; }
  .headline .l3 { font-size:${44*s}px; font-weight:800; line-height:1.15; letter-spacing:-0.5px; color:#fff; margin-top:${6*s}px; }

  .punch {
    align-self:flex-start; margin-top:${10*s}px; margin-bottom:${22*s}px;
    font-size:${40*s}px; font-weight:900; color:#fff; background:#ff3b30;
    padding:${10*s}px ${28*s}px; border-radius:${14*s}px; transform:rotate(-2deg);
    box-shadow:0 ${8*s}px ${20*s}px rgba(255,59,48,0.45);
  }

  .courseinfo { text-align:left; margin-bottom:${8*s}px; }
  .courseinfo .c1 { font-size:${25*s}px; font-weight:700; color:#fff; line-height:1.32; }
  .courseinfo .c1 b { color:#ffd166; }
  .courseinfo .c2 { font-size:${25*s}px; font-weight:700; color:rgba(255,255,255,0.88); line-height:1.32; }

  .spacer { flex:1 1 auto; }

  .waCta {
    display:flex; align-items:center; gap:${18*s}px; background:#04240f; color:#fff;
    border-radius:${20*s}px; padding:${22*s}px ${36*s}px; align-self:stretch; justify-content:center;
    box-shadow:0 ${10*s}px ${26*s}px rgba(0,0,0,0.35); border:${3*s}px solid #25D366; margin-bottom:${18*s}px;
  }
  .waCta .icon {
    width:${60*s}px; height:${60*s}px; border-radius:50%; background:#25D366; display:flex; align-items:center;
    justify-content:center; font-size:${32*s}px; flex:0 0 auto;
  }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:${18*s}px; font-weight:700; color:#bdf5d3; }
  .waCta .txt .l2 { font-size:${46*s}px; font-weight:900; color:#fff; letter-spacing:0.5px; }

  .fine { position:relative; z-index:2; font-size:${13*s}px; color:rgba(255,255,255,0.7); text-align:center; }
</style>
</head>
<body>
  <div class="stage">
    <div class="glow glow1"></div>
    <div class="diag"></div>
    <div class="content">
      <div class="brand"><span class="go">Go</span><span class="hl">HighLevel</span></div>
      <div class="kicker">SUMMER OF AI &mdash; LIMITED TIME</div>
      <div class="headline">
        <div class="l1">FREE AI Skills</div>
        <div class="l1">Seekhein</div>
        <div class="l2">+ Rs 1000 Gift</div>
        <div class="l3">+ Course Joining Motivation bhi!</div>
      </div>
      <div class="punch">Abhi Hasil Karein!</div>
      <div class="courseinfo">
        <div class="c1">Seekhein: <b>Voice AI, Automation, CRM &amp; AI Employees</b></div>
        <div class="c2">Practical training se apna AI career shuru karein</div>
      </div>
      <div class="spacer"></div>
      <div class="waCta">
        <div class="icon"><svg viewBox="0 0 24 24" width="60%" height="60%" fill="#fff"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.71.45 3.38 1.3 4.85L2 22l5.36-1.4a9.9 9.9 0 0 0 4.68 1.19h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.06h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.57.12.17 1.75 2.67 4.25 3.74.59.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28z"/></svg></div>
        <div class="txt">
          <div class="l1">WhatsApp Karein</div>
          <div class="l2">0302-1202000</div>
        </div>
      </div>
      <div class="fine">Independent GoHighLevel affiliate offer. Terms apply.</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildHtml };
