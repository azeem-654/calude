function buildHtml({ width, height, heroHeight, compact, expanded }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${width}px; height:${height}px; overflow:hidden; font-family:'Helvetica Neue', Arial, sans-serif; }
  body { background:#eef5fb; display:flex; flex-direction:column; }

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

  .brand { position:absolute; top:32px; left:40px; font-size:26px; font-weight:800; letter-spacing:-0.5px; z-index:2; }
  .brand .go{ color:#fff; } .brand .hl{ color:#ffd166; }

  .kicker {
    position:relative; z-index:2;
    display:inline-block; padding:10px 26px; border-radius:999px;
    background:rgba(255,255,255,0.16); border:1.5px solid rgba(255,255,255,0.5);
    color:#fff; font-size:20px; font-weight:700; letter-spacing:1.5px; margin-bottom:22px;
  }
  .hero h1 {
    position:relative; z-index:2; font-size:56px; font-weight:900; line-height:1.12; letter-spacing:-1px; margin-bottom:14px;
  }
  .hero h1 .accent { color:#ffd166; }
  .hero p.sub {
    position:relative; z-index:2; font-size:26px; font-weight:500; color:rgba(255,255,255,0.92); max-width:820px;
  }

  .body { flex:1 1 auto; display:flex; flex-direction:column; align-items:center; padding:36px 56px 30px; text-align:center; overflow:hidden; }

  .featrow { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; margin-bottom:30px; }
  .featchip {
    display:flex; align-items:center; gap:10px; padding:14px 22px; border-radius:14px;
    background:#fff; border:1.5px solid #dbe6f0; box-shadow:0 4px 14px rgba(20,30,80,0.06);
    font-size:20px; font-weight:700; color:#233;
  }
  .featchip .dot { width:10px; height:10px; border-radius:50%; background:#3b4bd8; }

  .offercard {
    width:100%; max-width:900px;
    background:linear-gradient(135deg, #0fae72 0%, #0c8f8c 100%);
    border-radius:26px; padding:34px 44px; color:#fff; margin-bottom:26px;
    box-shadow:0 14px 34px rgba(15,174,114,0.28);
  }
  .offer-top { font-size:19px; font-weight:800; letter-spacing:1.5px; color:#d7fff0; margin-bottom:14px; }
  .offer-amt { font-size:52px; font-weight:900; margin-bottom:6px; }
  .offer-amt span{ color:#ffe27a; }
  .offer-list { list-style:none; text-align:left; margin:18px auto 0; max-width:720px; }
  .offer-list li { font-size:24px; font-weight:600; padding:8px 0 8px 40px; position:relative; line-height:1.35; }
  .offer-list li::before { content:"✓"; position:absolute; left:0; top:8px; width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:900; }

  .waCta {
    display:flex; align-items:center; gap:18px; background:#25D366; color:#04240f; border-radius:20px;
    padding:22px 40px; width:100%; max-width:760px; margin-bottom:20px; box-shadow:0 10px 26px rgba(37,211,102,0.35);
  }
  .waCta .icon { width:56px; height:56px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:30px; flex:0 0 auto; }
  .waCta .txt { text-align:left; }
  .waCta .txt .l1 { font-size:19px; font-weight:700; opacity:0.85; }
  .waCta .txt .l2 { font-size:32px; font-weight:900; letter-spacing:0.5px; }

  .spacer { flex:1 1 auto; }

  .fine {
    font-size:15px; color:#5c6b7a; line-height:1.55; max-width:880px; margin-top:auto;
  }
  .fine b { color:#33414d; }

  ${compact ? `
  .hero h1 { font-size:46px; margin-bottom:10px; }
  .hero p.sub { font-size:21px; }
  .kicker { margin-bottom:16px; padding:8px 22px; font-size:17px; }
  .body { padding:22px 56px 20px; }
  .featrow { margin-bottom:18px; }
  .featchip { padding:10px 18px; font-size:17px; }
  .offercard { padding:24px 36px; margin-bottom:16px; }
  .offer-top { margin-bottom:8px; font-size:16px; }
  .offer-amt { font-size:42px; }
  .offer-list { margin-top:10px; }
  .offer-list li { font-size:19px; padding:5px 0 5px 34px; }
  .offer-list li::before { width:22px; height:22px; font-size:13px; top:6px; }
  .waCta { padding:16px 32px; margin-bottom:14px; }
  .waCta .icon { width:46px; height:46px; font-size:24px; }
  .waCta .txt .l1 { font-size:16px; }
  .waCta .txt .l2 { font-size:26px; }
  .fine { font-size:13px; }
  ` : ''}

  ${expanded ? `
  .body { justify-content:space-between; padding-top:60px; padding-bottom:50px; }
  .spacer { display:none; }
  .fine { margin-top:0; }
  .featchip { padding:18px 28px; font-size:23px; }
  .offercard { padding:44px 52px; }
  .offer-amt { font-size:60px; }
  .offer-list li { font-size:26px; }
  .waCta { padding:26px 44px; }
  .waCta .icon { width:64px; height:64px; font-size:34px; }
  .waCta .txt .l1 { font-size:21px; }
  .waCta .txt .l2 { font-size:36px; }
  ` : ''}
</style>
</head>
<body>
  <div class="hero">
    <div class="brand"><span class="go">Go</span><span class="hl">HighLevel</span></div>
    <div class="kicker">SUMMER OF AI &mdash; LIMITED TIME</div>
    <h1>Enjoy the Summer of AI<br><span class="accent">on us. Ask AI? FREE.</span></h1>
    <p class="sub">Voice AI &bull; 24/7 AI Team &bull; Automations &bull; CRM &mdash; all in one platform</p>
  </div>
  <div class="body" id="body-content"></div>
</body>
</html>`;
}

module.exports = { buildHtml };
