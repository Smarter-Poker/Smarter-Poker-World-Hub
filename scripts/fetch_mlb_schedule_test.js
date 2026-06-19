async function run() {
    const res = await fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=probablePitcher');
    const json = await res.json();
    console.log(json.dates[0].games[0].teams.away);
}
run();
