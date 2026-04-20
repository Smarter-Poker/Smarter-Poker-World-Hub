fetch("https://smarter.poker/api/proxy?url=https%3A%2F%2Fwww.cardplayer.com%2Fpoker-news%2F27808-poker-strategy-with-jonathan-little-a-costly-preflop-mistake")
  .then(res => res.text())
  .then(html => {
    if (html.includes("Smarter.Poker Reader")) {
      console.log("SUCCESS: Smarter.Poker Reader view found!");
      console.log(html.substring(0, 500) + "...");
    } else if (html.includes("Article Unavailable")) {
      console.log("FALLBACK HIT (Article not in RSS):", html);
    } else {
      console.log("FAILURE: Unexpected output:", html);
    }
  }).catch(e => console.error(e));
