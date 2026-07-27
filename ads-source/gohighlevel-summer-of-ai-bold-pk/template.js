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
    background: radial-gradient(1000px 800px at 15% -5%, #3b4bd8 0%, transparent 55%),
                radial-gradient(1000px 900px at 100% 105%, #c23fd0 0%, transparent 55%),
                linear-gradient(160deg, #14183f 0%, #1a1f6e 45%, #4a2a9e 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; color:#fff; padding:0 ${64 * s}px;
  }
  .stage::before, .stage::after { content:""; position:absolute; border-radius:50%; filter:blur(90px); }
  .stage::before { width:${460*s}px; height:${460*s}px; background:rgba(255,255,255,0.14); top:${-140*s}px; left:${-120*s}px; }
  .stage::after { width:${420*s}px; height:${420*s}px; background:rgba(255,190,80,0.3); bottom:${-160*s}px; right:${-100*s}px; }

  .brand { position:absolute; top:${34*s}px; left:${44*s}px; font-size:${24*s}px; font-weight:800; z-index:3; }
  .brand .go{ color:#fff; } .brand .hl{ color:#ffd166; }

  .kicker {
    position:relative; z-index:2; display:inline-block; padding:${11*s}px ${28*s}px; border-radius:999px;
    background:rgba(255,255,255,0.14); border:${1.5*s}px solid rgba(255,255,255,0.5);
    color:#fff; font-size:${20*s}px; font-weight:800; letter-spacing:1px; margin-bottom:${26*s}px;
  }

  h1 {
    position:relative; z-index:2; font-size:${80*s}px; font-weight:900; line-height:1.05; letter-spacing:-1.5px;
    margin-bottom:${18*s}px;
  }
  h1 .accent { color:#ffd166; }

  .subline {
    position:relative; z-index:2; font-size:${26*s}px; font-weight:600; color:rgba(255,255,255,0.9);
    margin-bottom:${44*s}px;
  }

  .badge {
    position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center;
    width:${300*s}px; height:${300*s}px; border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #14e0a4, #0c8f8c 70%);
    box-shadow:0 0 0 ${8*s}px rgba(255,255,255,0.08), 0 ${20*s}px ${50*s}px rgba(15,174,114,0.45);
    margin-bottom:${40*s}px;
  }
  .badge .lbl { font-size:${17*s}px; font-weight:800; letter-spacing:1px; color:#d7fff0; margin-bottom:${4*s}px; }
  .badge .amt { font-size:${58*s}px; font-weight:900; color:#fff; line-height:1; }
  .badge .amt span { color:#ffe27a; }
  .badge .tag {
    margin-top:${10*s}px; background:#ff3b30; color:#fff; font-weight:900; font-size:${15*s}px;
    padding:${5*s}px ${16*s}px; border-radius:999px;
  }

  .waCta {
    position:relative; z-index:2; display:flex; align-items:center; gap:${16*s}px; background:#25D366; color:#04240f;
    border-radius:${20*s}px; padding:${20*s}px ${40*s}px; box-shadow:0 ${10*s}px ${26*s}px rgba(37,211,102,0.4);
    border:${3*s}px solid #128c3e; margin-bottom:${28*s}px;
  }
  .waCta .icon {
    width:${52*s}px; height:${52*s}px; border-radius:50%; background:#fff; display:flex; align-items:center;
    justify-content:center; font-size:${28*s}px; flex:0 0 auto;
  }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:${16*s}px; font-weight:800; opacity:0.9; }
  .waCta .txt .l2 { font-size:${30*s}px; font-weight:900; }

  .fine { position:relative; z-index:2; font-size:${14*s}px; color:rgba(255,255,255,0.55); }
</style>
</head>
<body>
  <div class="stage">
    <div class="brand"><span class="go">Go</span><span class="hl">HighLevel</span></div>
    <div class="kicker">FREE AI SKILL CHALLENGE</div>
    <h1>AI Skills Seekhein<br><span class="accent">Bilkul FREE!</span></h1>
    <p class="subline">GoHighLevel AI &mdash; Free Trial Sign Up</p>
    <div class="badge">
      <div class="lbl">SIGN UP KAREIN &amp; PAAYEIN</div>
      <div class="amt">Rs <span>1000</span></div>
      <div class="tag">INSTANT</div>
    </div>
    <div class="waCta">
      <div class="icon">&#128172;</div>
      <div class="txt">
        <div class="l1">WhatsApp Karein</div>
        <div class="l2">0320-0045364</div>
      </div>
    </div>
    <div class="fine">Independent GoHighLevel affiliate offer. Terms apply.</div>
  </div>
</body>
</html>`;
}

module.exports = { buildHtml };
