/**
 * Validate all clips in ClipLibrary.js
 * Identifies which video IDs are fake/broken
 */
const https = require('https');

// Copy the CLIP_LIBRARY from ClipLibrary.js
const CLIP_LIBRARY = [
    // Line 116-130 - verified real
    { id: 'hcl_1', video_id: 'hrcKuXcRhCc' },
    { id: 'hcl_2', video_id: 'ecNLi6z8bSk' },
    { id: 'hcl_3', video_id: '6zCDWw2wskQ' },
    { id: 'lodge_1', video_id: 'YdGQHBDn5Lw' },
    { id: 'lodge_2', video_id: 'K9RjPMqVrKY' },
    { id: 'latb_1', video_id: 'FwWa9CvV_TM' },
    { id: 'latb_2', video_id: 'rh8-RfBewQk' },
    { id: 'tch_1', video_id: '4YAdw3KHJPE' },
    { id: 'tch_2', video_id: 'zQNFCv8QmhY' },
    { id: 'triton_1', video_id: 'lZVS0lxluHg' },
    { id: 'triton_2', video_id: 'gSSo6FBMaLA' },
    { id: 'pokergo_1', video_id: 'dFKzQx8pzME' },
    { id: 'pokergo_2', video_id: 'QBz8YCPr_uQ' },
    // Lines 136-158 - checking
    { id: 'wsop_1', video_id: 'cMzPl7zG8EQ' },
    { id: 'wsop_2', video_id: 'HXrCJ4LwwNE' },
    { id: 'wpt_1', video_id: 'kVy8DDTcDgk' },
    { id: 'wpt_2', video_id: 'gMNbI3pxqe0' },
    { id: 'ept_1', video_id: 'p7H-EKVhMJs' },
    { id: 'ept_2', video_id: 'WKnGQv0m9TU' },
    { id: 'pad_1', video_id: 'mXpEoXO0Qng' },
    { id: 'pad_2', video_id: 'YsMkXaHPD8I' },
    { id: 'party_1', video_id: 'iE3dA1gH7Qw' },
    { id: 'party_2', video_id: 'hD2cB0fG6Pw' },
    { id: 'ggp_1', video_id: 'gC1bA9eF5Ow' },
    { id: 'ggp_2', video_id: 'fB0aZ8dE4Nw' },
    { id: 'stars_1', video_id: 'eA9zY7cD3Mw' },
    { id: 'stars_2', video_id: 'dZ8xX6bC2Lw' },
    { id: 'pnews_1', video_id: 'cY7wW5aB1Kw' },
    { id: 'pnews_2', video_id: 'bX6vV4zA0Jw' },
    // Lines 160-285
    { id: 'brad_1', video_id: 'YdRVU7bMh_w' },
    { id: 'brad_2', video_id: 'p_DuGV22B-s' },
    { id: 'neeme_1', video_id: 'DpZa5j3dYxA' },
    { id: 'neeme_2', video_id: 'h3M8uXOtKpM' },
    { id: 'mariano_1', video_id: 'jK8dJn4p3YE' },
    { id: 'mariano_2', video_id: 'W4cT5dB0hPU' },
    { id: 'rampage_1', video_id: 'DgG7qUF1_mE' },
    { id: 'rampage_2', video_id: 'hP9K7x_W5Go' },
    { id: 'wolf_1', video_id: 'kQp9L5b8dYE' },
    { id: 'wolf_2', video_id: 'rMJ8-C4GvTE' },
    { id: 'jaman_1', video_id: 'aW5uT3yC9Iw' },
    { id: 'jaman_2', video_id: 'zV4tS2xB8Hw' },
    { id: 'johnnie_1', video_id: 'dPw7Gu4QFMM' },
    { id: 'johnnie_2', video_id: 'hL_YvPq3TGQ' },
    { id: 'boski_1', video_id: 'yU3sR1wA7Gw' },
    { id: 'boski_2', video_id: 'xT2rQ0vZ6Fw' },
    { id: 'ryan_1', video_id: 'qPvR7mVH8bY' },
    { id: 'ryan_2', video_id: 'nM2L9pZRvQE' },
    { id: 'lexo_1', video_id: 'wS1qP8uY5Ew' },
    { id: 'lexo_2', video_id: 'vR0pO7tX4Dw' },
    { id: 'frankie_1', video_id: 'uQ9nN6sW3Cw' },
    { id: 'frankie_2', video_id: 'tP8mM5rV2Bw' },
    { id: 'norcal_1', video_id: 'sO7lL4qU1Aw' },
    { id: 'norcal_2', video_id: 'rN6kK3pT0zw' },
    { id: 'greg_1', video_id: 'qM5jJ2oS9yw' },
    { id: 'greg_2', video_id: 'pL4iI1nR8xw' },
    { id: 'brantzen_1', video_id: 'oK3hH0mQ7ww' },
    { id: 'brantzen_2', video_id: 'nJ2gG9lP6vw' },
    { id: 'harry_1', video_id: 'mI1fF8kO5uw' },
    { id: 'harry_2', video_id: 'lH0eE7jN4tw' },
    { id: 'sethy_1', video_id: 'kG9dD6iM3sw' },
    { id: 'sethy_2', video_id: 'jF8cC5hL2rw' },
    { id: 'babo_1', video_id: 'iE7bB4gK1qw' },
    { id: 'babo_2', video_id: 'hD6aA3fJ0pw' },
    { id: 'dougmc_1', video_id: 'gC5zZ2eI9ow' },
    { id: 'dougmc_2', video_id: 'fB4yY1dH8nw' },
    { id: 'charlie_1', video_id: 'eA3xX0cG7mw' },
    { id: 'charlie_2', video_id: 'dZ2wW9bF6lw' },
    { id: 'botez_1', video_id: 'cY1vV8aE5kw' },
    { id: 'botez_2', video_id: 'bX0uU7zD4jw' },
    { id: 'jlittle_1', video_id: 'cH8WJQYoLpQ' },
    { id: 'jlittle_2', video_id: 'M9TgZN8fU7E' },
    { id: 'bart_1', video_id: 'wKyQf8m9rWA' },
    { id: 'bart_2', video_id: 'p4Ry8vM3nZE' },
    { id: 'polk_1', video_id: 'pF8FxT0Z5hU' },
    { id: 'polk_2', video_id: 'r9kYw3cVqME' },
    { id: 'upswing_1', video_id: 'aW9tS6xC3iw' },
    { id: 'upswing_2', video_id: 'zV8sR5wB2hw' },
    { id: 'coach_1', video_id: 'yU7rQ4vA1gw' },
    { id: 'coach_2', video_id: 'xT6pP3uz0fw' },
    { id: 'split_1', video_id: 'wS5oO2ty9ew' },
    { id: 'split_2', video_id: 'vR4nN1sx8dw' },
    { id: 'grip_1', video_id: 'uQ3mM0rw7cw' },
    { id: 'grip_2', video_id: 'tP2lL9qv6bw' },
    { id: 'br79_1', video_id: 'sO1kK8pu5aw' },
    { id: 'br79_2', video_id: 'rN0jJ7ot4zw' },
    { id: 'bank_1', video_id: 'qM9iI6ns3yw' },
    { id: 'bank_2', video_id: 'pL8hH5mr2xw' },
    { id: 'alec_1', video_id: 'oK7gG4lq1ww' },
    { id: 'alec_2', video_id: 'nJ6fF3kp0vw' },
    { id: 'bencb_1', video_id: 'mI5eE2jo9uw' },
    { id: 'bencb_2', video_id: 'lH4dD1in8tw' },
    { id: 'kevin_1', video_id: 'kG3cC0hm7sw' },
    { id: 'kevin_2', video_id: 'jF2bB9gl6rw' },
    { id: 'daniel_1', video_id: 'qc4JX8bz5AY' },
    { id: 'daniel_2', video_id: 'iE1aA8fk5qw' },
    { id: 'hellmuth_1', video_id: 'rMXJg9i3aME' },
    { id: 'hellmuth_2', video_id: 'hD0zZ7ej4pw' },
    { id: 'ivey_1', video_id: 'Xd8Q_2_n4Ws' },
    { id: 'ivey_2', video_id: 'gC9yY6di3ow' },
    { id: 'dwan_1', video_id: 'hTNGGDWVcJE' },
    { id: 'dwan_2', video_id: 'fB8xX5ch2nw' },
    { id: 'antonio_1', video_id: 'eA7wW4bg1mw' },
    { id: 'antonio_2', video_id: 'dZ6vV3af0lw' },
    { id: 'joey_1', video_id: 'cY5uU2ze9kw' },
    { id: 'joey_2', video_id: 'bX4tT1yd8jw' },
    { id: 'lexv_1', video_id: 'aW3sS0xc7iw' },
    { id: 'lexv_2', video_id: 'zV2rR9wb6hw' },
    { id: 'spraggy_1', video_id: 'yU1qQ8va5gw' },
    { id: 'spraggy_2', video_id: 'xT0pP7uz4fw' },
    { id: 'staples_1', video_id: 'wS9oO6ty3ew' },
    { id: 'staples_2', video_id: 'vR8nN5sx2dw' },
    { id: 'garrett_1', video_id: 'uQ7mM4rw1cw' },
    { id: 'garrett_2', video_id: 'tP6lL3qv0bw' },
];

function checkYouTubeVideo(videoId) {
    return new Promise((resolve) => {
        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        https.get(url, (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

async function main() {
    console.log('Validating CLIP_LIBRARY entries...\n');
    
    const broken = [];
    const valid = [];
    
    for (const clip of CLIP_LIBRARY) {
        const isValid = await checkYouTubeVideo(clip.video_id);
        if (isValid) {
            valid.push(clip.id);
        } else {
            broken.push(clip.id);
            console.log(`❌ FAKE: ${clip.id} (${clip.video_id})`);
        }
        await new Promise(r => setTimeout(r, 50));
    }
    
    console.log(`\n✅ Valid: ${valid.length}`);
    console.log(`❌ Broken: ${broken.length}`);
    console.log('\nBroken IDs to remove from ClipLibrary.js:');
    console.log(broken.join(', '));
}

main();
