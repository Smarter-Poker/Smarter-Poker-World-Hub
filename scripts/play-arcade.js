const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to login...");
  await page.goto('https://smarter.poker/auth/login');
  
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', 'Bek454545!!');
  await page.click('button[type="submit"]');

  console.log("Waiting for login to complete...");
  await page.waitForURL('**/hub**', { timeout: 15000 });
  console.log("Logged in successfully.");

  console.log("Navigating to Arcade Trivia...");
  await page.goto('https://smarter.poker/hub/trivia/arcade?serverGrading=1');
  
  let submitDetected = false;
  page.on('response', response => {
    if (response.url().includes('/api/trivia/session-submit') && response.status() === 200) {
      console.log("✅ Success! Caught /api/trivia/session-submit returning 200 OK!");
      submitDetected = true;
    }
  });

  console.log("Waiting for game to load...");
  
  // Click start game button if it exists
  try {
    const startBtn = await page.waitForSelector('.start-btn, .lobby-image-wrapper', { timeout: 5000 });
    if (startBtn) {
       console.log("Clicking start button...");
       await startBtn.click();
    }
  } catch(e) {
    console.log("No start button found, assuming game auto-started.");
  }
  
  await page.waitForSelector('text=Question', { timeout: 15000 });

  // Arcade is typically 20 questions. Let's play up to 25 just in case.
  for (let i = 1; i <= 25; i++) {
    try {
      console.log(`Answering Question ${i}...`);
      
      // Wait for at least one enabled answer button to appear
      const optionButton = await page.waitForSelector('button[data-trivia-answer="true"]:not([disabled])', { timeout: 15000 });
      if (optionButton) {
         await optionButton.click();
      } else {
         throw new Error("No answer buttons found");
      }
      
      // Wait a moment for the click to register and network to start
      await page.waitForTimeout(500);
      
      if (submitDetected) {
        break;
      }
      
      // Sometimes there's a "Next" button in some modes, or it auto-advances.
      const isGameOver = await page.$('text=Game Over');
      if (isGameOver || submitDetected) {
        console.log("Game over screen detected.");
        break;
      }
    } catch (e) {
      console.log("Game finished or no more questions. Error:", e.message);
      break;
    }
  }

  // Wait a moment for any final network requests
  await page.waitForTimeout(3000);
  
  if (submitDetected) {
    console.log("PLAYWRIGHT_TEST:PASS");
    await browser.close();
    process.exit(0);
  } else {
    console.error("PLAYWRIGHT_TEST:FAIL - Did not detect a successful submission to /api/trivia/session-submit");
    await browser.close();
    process.exit(1);
  }
})();
