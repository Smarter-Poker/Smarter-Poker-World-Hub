const { BroadcastChannel } = require('node:worker_threads');

const bc1 = new BroadcastChannel('smarter_poker_diamond_sync');
const bc2 = new BroadcastChannel('smarter_poker_diamond_sync');

bc2.onmessage = (event) => {
  console.log('Received raw msg:', event.data);
};

// Send a raw message mimicking the old way
bc1.postMessage('refresh');

setTimeout(() => {
  // Send a JSON serialized message mimicking the new broadcastSync way
  bc1.postMessage(JSON.stringify({ type: 'smarter_poker_diamond_sync', payload: 'refresh' }));
}, 500);

setTimeout(() => {
  bc1.close();
  bc2.close();
}, 1000);
