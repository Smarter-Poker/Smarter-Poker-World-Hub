fetch("https://smarter.poker/club/4fed1703-766c-45c7-8d4f-6637ed0ceea4")
  .then(r => console.log("Club Page Status:", r.status))
  .catch(console.error);
fetch("https://smarter.poker/hub/home-games/the-midway-club")
  .then(r => console.log("Home Game Page Status:", r.status))
  .catch(console.error);
