function buildHtml({ width, height, heroHeight, compact, expanded, snug }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${width}px; height:${height}px; overflow:hidden; font-family:'Helvetica Neue', Arial, sans-serif; }
  body { background:#eef5fb; display:flex; flex-direction:column; }

  .urgbar {
    flex:0 0 auto; width:100%; height:56px; background:linear-gradient(90deg,#ff3b30,#ff7a1a);
    display:flex; align-items:center; justify-content:center; color:#fff;
    font-size:23px; font-weight:800; letter-spacing:0.5px;
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

  .brand { position:absolute; top:26px; left:40px; font-size:27px; font-weight:800; letter-spacing:-0.5px; z-index:3; }
  .brand .go{ color:#fff; } .brand .hl{ color:#ffd166; }

  .ribbon {
    position:absolute; top:22px; right:-64px; z-index:3; transform:rotate(38deg);
    background:linear-gradient(90deg,#ff3b30,#ffb020); color:#fff; font-weight:900; font-size:22px;
    padding:10px 80px; box-shadow:0 6px 14px rgba(0,0,0,0.25); letter-spacing:0.5px;
  }

  .kicker {
    position:relative; z-index:2;
    display:inline-block; padding:11px 28px; border-radius:999px;
    background:rgba(255,255,255,0.16); border:1.5px solid rgba(255,255,255,0.5);
    color:#fff; font-size:22px; font-weight:800; letter-spacing:1px; margin-bottom:20px;
  }
  .hero h1 {
    position:relative; z-index:2; font-size:68px; font-weight:900; line-height:1.08; letter-spacing:-1px; margin-bottom:12px;
  }
  .hero h1 .accent { color:#ffd166; }
  .hero p.sub {
    position:relative; z-index:2; font-size:29px; font-weight:600; color:rgba(255,255,255,0.95); max-width:860px;
  }

  .body { flex:1 1 auto; display:flex; flex-direction:column; align-items:center; padding:32px 52px 28px; text-align:center; overflow:hidden; }

  .featrow { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; margin-bottom:26px; }
  .featchip {
    display:flex; align-items:center; gap:9px; padding:14px 22px; border-radius:14px;
    background:#fff; border:1.5px solid #dbe6f0; box-shadow:0 4px 14px rgba(20,30,80,0.06);
    font-size:22px; font-weight:800; color:#233;
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
  .offer-top { font-size:21px; font-weight:800; letter-spacing:1.2px; color:#d7fff0; margin-bottom:10px; }
  .offer-amt-wrap { display:flex; align-items:baseline; justify-content:center; gap:14px; flex-wrap:wrap; margin-bottom:8px; }
  .offer-amt {
    font-size:74px; font-weight:900; color:#fff;
    text-shadow:0 0 26px rgba(255,224,122,0.65);
  }
  .offer-amt span{ color:#ffe27a; }
  .instant-tag {
    display:inline-block; background:#ff3b30; color:#fff; font-weight:900; font-size:21px;
    padding:7px 18px; border-radius:999px; transform:translateY(-4px);
  }
  .offer-list { list-style:none; text-align:left; margin:16px auto 0; max-width:760px; }
  .offer-list li { font-size:26px; font-weight:700; padding:7px 0 7px 42px; position:relative; line-height:1.32; }
  .offer-list li::before { content:"✓"; position:absolute; left:0; top:8px; width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; font-size:17px; font-weight:900; }

  .waCta {
    display:flex; align-items:center; gap:16px; background:#25D366; color:#04240f; border-radius:20px;
    padding:20px 38px; width:100%; max-width:780px; margin-bottom:16px; box-shadow:0 10px 26px rgba(37,211,102,0.4);
    border:3px solid #128c3e;
  }
  .waCta .icon { width:58px; height:58px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:30px; flex:0 0 auto; }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:21px; font-weight:800; opacity:0.9; }
  .waCta .txt .l2 { font-size:36px; font-weight:900; letter-spacing:0.5px; }

  .spacer { flex:1 1 auto; }

  .fine {
    font-size:16px; color:#5c6b7a; line-height:1.5; max-width:900px; margin-top:auto;
  }
  .fine b { color:#33414d; }

  ${compact ? `
  .urgbar { font-size:19px; height:44px; }
  .hero h1 { font-size:52px; margin-bottom:6px; }
  .hero p.sub { font-size:22px; }
  .kicker { margin-bottom:12px; padding:8px 22px; font-size:19px; }
  .body { padding:14px 44px 14px; }
  .featrow { margin-bottom:12px; gap:10px; }
  .featchip { padding:9px 16px; font-size:19px; }
  .offercard { padding:20px 32px; margin-bottom:12px; }
  .offer-top { margin-bottom:5px; font-size:17px; }
  .offer-amt { font-size:52px; }
  .instant-tag { font-size:16px; padding:5px 14px; }
  .offer-list { margin-top:6px; }
  .offer-list li { font-size:20px; padding:4px 0 4px 34px; }
  .offer-list li::before { width:22px; height:22px; font-size:13px; top:5px; }
  .waCta { padding:13px 28px; margin-bottom:10px; }
  .waCta .icon { width:46px; height:46px; font-size:24px; }
  .waCta .txt .l1 { font-size:17px; }
  .waCta .txt .l2 { font-size:28px; }
  .fine { font-size:14px; }
  ` : ''}

  ${expanded ? `
  .body { justify-content:space-between; padding-top:50px; padding-bottom:44px; }
  .spacer { display:none; }
  .fine { margin-top:0; }
  .featchip { padding:19px 28px; font-size:25px; }
  .offercard { padding:46px 54px; }
  .offer-amt { font-size:82px; }
  .offer-list li { font-size:28px; }
  .waCta { padding:26px 44px; }
  .waCta .icon { width:66px; height:66px; font-size:34px; }
  .waCta .txt .l1 { font-size:23px; }
  .waCta .txt .l2 { font-size:40px; }
  ` : ''}

  ${snug ? `
  .body { padding:22px 52px 20px; }
  .featrow { margin-bottom:18px; }
  .offercard { padding:26px 44px; margin-bottom:16px; }
  .offer-top { margin-bottom:6px; }
  .offer-list { margin-top:10px; }
  .offer-list li { padding:5px 0 5px 42px; line-height:1.24; }
  .waCta { padding:16px 38px; margin-bottom:12px; }
  .fine { font-size:14px; }
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
