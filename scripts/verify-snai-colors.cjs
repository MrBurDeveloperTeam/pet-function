// Local CSS regression fixture only: no account, database or AI requests.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'dist/styles.css'), 'utf8');
const hosts = {superapp:'snabb-superapp/index.css',inventory:'inventory/index.css',calculator:'calculator/index.css',todo:'todo/src/index.css'};
const markup = `<div class="snabbb-molar-experience" data-molar-theme="light"><section class="molar-chat-panel"><div class="molar-chat-header">SNAI</div><div class="molar-chat-messages"><h3 class="molar-chat-empty-title">How can I help you today?</h3></div><div class="molar-chat-extra-footer"><a class="snai-support-link" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40snabbb.com&su=Customer%20Inquiry"><span class="snai-support-icon">✉</span><span class="snai-support-copy"><span class="snai-support-title">Email Support</span><span class="snai-support-meta">Contact support@snabbb.com</span></span></a></div><div class="molar-chat-footer"><form class="molar-chat-input-form"><div class="molar-chat-input-shell"><input aria-label="Ask SNAI" class="molar-chat-input" placeholder="Ask SNAI..."><button type="button" disabled class="molar-chat-send-btn molar-chat-send-btn--inactive">➤</button></div></form></div></section></div>`;
const selectors=['.molar-chat-panel','.molar-chat-header','.molar-chat-empty-title','.snai-support-link','.snai-support-icon','.snai-support-title','.snai-support-meta','.molar-chat-input-shell','.molar-chat-input','.molar-chat-send-btn'];
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('**/*',route=>route.abort());
    let baseline;
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:900});
      baseline = undefined;
      for (const [host,file] of Object.entries(hosts)) for (const theme of ['light','dark']) for (const order of ['before','after']) {
        const hostCss=fs.readFileSync(path.resolve(root,'..',file),'utf8');
        await page.setContent(`<html class="${theme==='dark'?'dark':''}" data-theme="${theme}"><head><style>${order==='before'?hostCss:shared}</style><style>${order==='before'?shared:hostCss}</style></head><body style="background:${theme==='dark'?'#101010':'#ffffff'}">${markup}</body></html>`);
        const paints = await page.evaluate(selectors=>selectors.map(selector=>{
          const s=getComputedStyle(document.querySelector(selector));
          return [selector,s.backgroundColor,s.backgroundImage,s.color,s.borderColor,s.boxShadow];
        }),selectors);
        baseline ??= paints;
        assert.deepEqual(paints,baseline,`${host}/${theme}/${order}/${width}`);
        assert.equal(paints[0][1],'rgb(255, 255, 255)');
        assert.equal(paints[3][1],'rgb(51, 65, 85)');
        assert.equal(paints[8][1],'rgba(0, 0, 0, 0)');
        await page.locator('.molar-chat-input').focus();
        assert.equal(await page.locator('.molar-chat-input').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
        console.log(`PASS ${host}/${theme}/${order}/${width}`);
      }
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
