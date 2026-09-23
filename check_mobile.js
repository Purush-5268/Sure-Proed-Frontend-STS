const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set mobile viewport
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  
  await page.goto('http://localhost:5173/');
  
  // wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
