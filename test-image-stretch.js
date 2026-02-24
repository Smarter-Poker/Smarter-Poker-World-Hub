const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/hub/social-media', { waitUntil: 'networkidle2' });
    
    const results = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const jaqk = imgs.find(i => i.src && i.src.includes('jaqk'));
        if (!jaqk) return 'JAQK image not found';
        
        const computed = window.getComputedStyle(jaqk);
        return {
            src: jaqk.src,
            width: computed.width,
            height: computed.height,
            maxWidth: computed.maxWidth,
            maxHeight: computed.maxHeight,
            objectFit: computed.objectFit
        };
    });
    console.log(results);
    await browser.close();
})();
