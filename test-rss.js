const url = "https://www.cardplayer.com/poker-news/feed";
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r=>r.text()).then(txt => {
    const items = txt.split('<item>');
    console.log("Found items:", items.length - 1);
    const first = items[1];
    const linkMatch = first.match(/<link>(.*?)<\/link>/);
    console.log("Link:", linkMatch && linkMatch[1]);
});
