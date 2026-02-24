const https = require('https');
const sizeOf = require('image-size');
const url = "https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/logos/005cddc8-ecd9-4cd9-aca1-b809609d1239/1771287317552_club%20jaqk.jpeg";
https.get(url, function (response) {
  const chunks = [];
  response.on('data', function (chunk) { chunks.push(chunk); }).on('end', function() {
    const buffer = Buffer.concat(chunks);
    const dimensions = sizeOf(buffer);
    console.log(dimensions);
  });
});
