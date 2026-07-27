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
    align-self:flex-start; margin-top:${10*s}px; margin-bottom:${20*s}px;
    font-size:${40*s}px; font-weight:900; color:#fff; background:#ff3b30;
    padding:${10*s}px ${28*s}px; border-radius:${14*s}px; transform:rotate(-2deg);
    box-shadow:0 ${8*s}px ${20*s}px rgba(255,59,48,0.45);
  }

  .spacer { flex:1 1 auto; }

  .waCta {
    display:flex; align-items:center; gap:${16*s}px; background:#04240f; color:#fff;
    border-radius:${20*s}px; padding:${20*s}px ${36*s}px; align-self:stretch; justify-content:center;
    box-shadow:0 ${10*s}px ${26*s}px rgba(0,0,0,0.35); border:${3*s}px solid #25D366; margin-bottom:${18*s}px;
  }
  .waCta .icon {
    width:${52*s}px; height:${52*s}px; border-radius:50%; background:#25D366; display:flex; align-items:center;
    justify-content:center; font-size:${28*s}px; flex:0 0 auto;
  }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:${17*s}px; font-weight:700; color:#bdf5d3; }
  .waCta .txt .l2 { font-size:${32*s}px; font-weight:900; color:#fff; }

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
      <div class="spacer"></div>
      <div class="waCta">
        <div class="icon">&#128172;</div>
        <div class="txt">
          <div class="l1">WhatsApp Karein</div>
          <div class="l2">0320-0045364</div>
        </div>
      </div>
      <div class="fine">Independent GoHighLevel affiliate offer. Terms apply.</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildHtml };
