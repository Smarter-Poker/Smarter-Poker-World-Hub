async function test() {
    const rss = await fetch("https://www.cardplayer.com/poker-news/feed").then(r=>r.text());
    return rss.length;
}
test().then(console.log);
