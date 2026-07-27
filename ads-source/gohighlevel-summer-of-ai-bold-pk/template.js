function buildHtml({ width, height, heroHeight, compact, expanded }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${width}px; height:${height}px; overflow:hidden; font-family:'Helvetica Neue', Arial, sans-serif; }
  body { background:#eef5fb; display:flex; flex-direction:column; }

  .urgbar {
    flex:0 0 auto; width:100%; height:52px; background:linear-gradient(90deg,#ff3b30,#ff7a1a);
    display:flex; align-items:center; justify-content:center; color:#fff;
    font-size:20px; font-weight:800; letter-spacing:0.5px;
  }

  .hero {
    position:relative; width:100%; height:${heroHeight}px; flex:0 0 auto;
    background: linear-gradient(120deg, #1a1f6e 0%, #3b4bd8 38%, #7b3fe4 72%, #c23fd0 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; color:#fff; overflow:hidden; padding:0 60px;
  }
  .hero::before, .hero::after {
    content:""; position:absolute; border-radius:50%; filter:blur(70px);
  }
  .hero::before { width:420px; height:420px; background:rgba(255,255,255,0.18); top:-140px; left:-100px; }
  .hero::after { width:380px; height:380px; background:rgba(255,190,80,0.35); bottom:-160px; right:-80px; }

  .brand { position:absolute; top:26px; left:40px; font-size:24px; font-weight:800; letter-spacing:-0.5px; z-index:3; }
  .brand .go{ color:#fff; } .brand .hl{ color:#ffd166; }

  .ribbon {
    position:absolute; top:22px; right:-64px; z-index:3; transform:rotate(38deg);
    background:linear-gradient(90deg,#ff3b30,#ffb020); color:#fff; font-weight:900; font-size:19px;
    padding:10px 80px; box-shadow:0 6px 14px rgba(0,0,0,0.25); letter-spacing:0.5px;
  }

  .kicker {
    position:relative; z-index:2;
    display:inline-block; padding:10px 26px; border-radius:999px;
    background:rgba(255,255,255,0.16); border:1.5px solid rgba(255,255,255,0.5);
    color:#fff; font-size:19px; font-weight:800; letter-spacing:1px; margin-bottom:20px;
  }
  .hero h1 {
    position:relative; z-index:2; font-size:58px; font-weight:900; line-height:1.1; letter-spacing:-1px; margin-bottom:12px;
  }
  .hero h1 .accent { color:#ffd166; }
  .hero p.sub {
    position:relative; z-index:2; font-size:25px; font-weight:600; color:rgba(255,255,255,0.95); max-width:860px;
  }

  .body { flex:1 1 auto; display:flex; flex-direction:column; align-items:center; padding:32px 52px 28px; text-align:center; overflow:hidden; }

  .featrow { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; margin-bottom:26px; }
  .featchip {
    display:flex; align-items:center; gap:9px; padding:13px 20px; border-radius:14px;
    background:#fff; border:1.5px solid #dbe6f0; box-shadow:0 4px 14px rgba(20,30,80,0.06);
    font-size:19px; font-weight:800; color:#233;
  }
  .featchip .dot { width:10px; height:10px; border-radius:50%; background:#3b4bd8; }
  .featchip.hot { background:#fff4e5; border-color:#ffb020; color:#a03d00; }
  .featchip.hot .dot { background:#ff7a1a; }

  .offercard {
    position:relative; width:100%; max-width:920px;
    background:linear-gradient(135deg, #0fae72 0%, #0c8f8c 100%);
    border-radius:26px; padding:32px 44px; color:#fff; margin-bottom:22px;
    box-shadow:0 14px 34px rgba(15,174,114,0.3); border:3px solid rgba(255,224,122,0.7);
  }
  .offer-top { font-size:18px; font-weight:800; letter-spacing:1.2px; color:#d7fff0; margin-bottom:10px; }
  .offer-amt-wrap { display:flex; align-items:baseline; justify-content:center; gap:14px; flex-wrap:wrap; margin-bottom:8px; }
  .offer-amt {
    font-size:64px; font-weight:900; color:#fff;
    text-shadow:0 0 26px rgba(255,224,122,0.65);
  }
  .offer-amt span{ color:#ffe27a; }
  .instant-tag {
    display:inline-block; background:#ff3b30; color:#fff; font-weight:900; font-size:18px;
    padding:6px 16px; border-radius:999px; transform:translateY(-4px);
  }
  .offer-list { list-style:none; text-align:left; margin:16px auto 0; max-width:740px; }
  .offer-list li { font-size:23px; font-weight:700; padding:7px 0 7px 40px; position:relative; line-height:1.35; }
  .offer-list li::before { content:"✓"; position:absolute; left:0; top:7px; width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:900; }

  .waCta {
    display:flex; align-items:center; gap:16px; background:#25D366; color:#04240f; border-radius:20px;
    padding:20px 38px; width:100%; max-width:780px; margin-bottom:16px; box-shadow:0 10px 26px rgba(37,211,102,0.4);
    border:3px solid #128c3e;
  }
  .waCta .icon { width:54px; height:54px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; flex:0 0 auto; }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:18px; font-weight:800; opacity:0.9; }
  .waCta .txt .l2 { font-size:32px; font-weight:900; letter-spacing:0.5px; }

  .spacer { flex:1 1 auto; }

  .fine {
    font-size:14px; color:#5c6b7a; line-height:1.5; max-width:900px; margin-top:auto;
  }
  .fine b { color:#33414d; }

  ${compact ? `
  .urgbar { font-size:16px; height:42px; }
  .hero h1 { font-size:44px; margin-bottom:8px; }
  .hero p.sub { font-size:19px; }
  .kicker { margin-bottom:14px; padding:8px 20px; font-size:16px; }
  .body { padding:18px 48px 16px; }
  .featrow { margin-bottom:14px; }
  .featchip { padding:9px 16px; font-size:16px; }
  .offercard { padding:22px 32px; margin-bottom:14px; }
  .offer-top { margin-bottom:6px; font-size:15px; }
  .offer-amt { font-size:44px; }
  .instant-tag { font-size:14px; padding:4px 12px; }
  .offer-list { margin-top:8px; }
  .offer-list li { font-size:17px; padding:4px 0 4px 32px; }
  .offer-list li::before { width:20px; height:20px; font-size:12px; top:5px; }
  .waCta { padding:14px 28px; margin-bottom:12px; }
  .waCta .icon { width:42px; height:42px; font-size:22px; }
  .waCta .txt .l1 { font-size:15px; }
  .waCta .txt .l2 { font-size:24px; }
  .fine { font-size:12px; }
  ` : ''}

  ${expanded ? `
  .body { justify-content:space-between; padding-top:54px; padding-bottom:46px; }
  .spacer { display:none; }
  .fine { margin-top:0; }
  .featchip { padding:17px 26px; font-size:22px; }
  .offercard { padding:42px 50px; }
  .offer-amt { font-size:72px; }
  .offer-list li { font-size:25px; }
  .waCta { padding:24px 42px; }
  .waCta .icon { width:62px; height:62px; font-size:32px; }
  .waCta .txt .l1 { font-size:20px; }
  .waCta .txt .l2 { font-size:36px; }
  ` : ''}
</style>
</head>
<body>
  <div class="urgbar">&#128293; SIRF LIMITED TIME &mdash; SUMMER OF AI OFFER &#128293;</div>
  <div class="hero">
    <div class="brand"><span class="go">Go</span><span class="hl">HighLevel</span></div>
    <div class="ribbon">FREE Rs 1000</div>
    <div class="kicker">PAKISTAN'S FREE AI SKILL CHALLENGE</div>
    <h1>AI Skills Seekhein<br><span class="accent">Bilkul FREE!</span></h1>
    <p class="sub">Voice AI &bull; 24/7 AI Team &bull; Automations &bull; CRM &mdash; sab kuch seekhein, ek hi platform mein</p>
  </div>
  <div class="body" id="body-content"></div>
</body>
</html>`;
}

module.exports = { buildHtml };
