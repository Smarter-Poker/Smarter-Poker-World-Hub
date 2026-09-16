import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { crc32, inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));

function pngInfo(path, data = bytes(path)) {
  assert.ok(data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${path} must be PNG`);
  let offset = 8;
  let header;
  let ended = false;
  const compressed = [];
  while (offset < data.length) {
    assert.ok(offset + 12 <= data.length, `${path} has a truncated chunk`);
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= data.length, `${path} has truncated chunk data`);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, end - 4);
    assert.equal(crc32(data.subarray(offset + 4, end - 4)), data.readUInt32BE(end - 4), `${path} ${type} checksum`);
    if (offset === 8) {
      assert.equal(type, 'IHDR');
      assert.equal(length, 13);
      header = payload;
    } else {
      assert.notEqual(type, 'IHDR', `${path} has a duplicate header`);
    }
    if (type === 'IDAT') compressed.push(payload);
    offset = end;
    if (type === 'IEND') {
      assert.equal(length, 0);
      assert.equal(offset, data.length, `${path} has trailing data`);
      ended = true;
      break;
    }
  }
  assert.ok(header && ended && compressed.length, `${path} has incomplete image data`);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const colorType = header[9];
  assert.ok(width > 0 && height > 0);
  assert.equal(header[8], 8, `${path} must retain 8-bit artwork`);
  assert.ok([4, 6].includes(colorType), `${path} must preserve alpha`);
  assert.deepEqual([...header.subarray(10)], [0, 0, 0], `${path} encoding changed`);
  const rowSize = 1 + width * (colorType === 6 ? 4 : 2);
  const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: rowSize * height });
  assert.equal(pixels.length, rowSize * height, `${path} has incomplete pixel rows`);
  for (let y = 0; y < height; y += 1) assert.ok(pixels[y * rowSize] <= 4, `${path} has an invalid row filter`);
  return { width, height, colorType, sha256: createHash('sha256').update(data).digest('hex') };
}

// Pin the reviewed lossless crops: PNG compression size is not painted detail.
const ICON_ASSETS = Object.freeze({
  'alert': '6c4cf353631f35035b37574c652248de1d1591d1c73b17b78bcda9f5948e45ee',
  'back': 'aa937bb4fcb8d76ab8af2dba49d417ccb518c9985dbd6873fb86fc5df2a49ae0',
  'calendar': 'e5af208ef1e1308ab5570b2f3078f9b01a778bab4ddc11efa20a8947c7f4ac76',
  'close': '24b554862ca90da6a33d68485bfa2730c3fcb9de13174f09cff32ae54723135e',
  'community': 'b0a35caf804848c2d3900f43150d9005037cd0be010b29226dbe804521547eba',
  'directions': 'f181229131d316644419c74e6bad7b323e83115afdd3b176c341a4678285e7d2',
  'edit': '8b6719bb16de8fc62d5225c3732503e59c2cf053d089d9210378ba43a2457432',
  'event-ticket': '74af497bbbaaa50befaa682233c06d878b173ea14149c3ef8bbcfb5ee77ea677',
  'filter': 'c61e956506c997ea542290fedfcdfd909966fa4d8667c99ccabc6caea51eb56c',
  'fullscreen': '32d449b5db0011bc483d914c40cb2027a253c35d2d24f029198ae97b8eeccf60',
  'globe': 'f144cbd561a73661bbd32187b15f801beafec4a8444feb8dd9ad013b7d35d83b',
  'home': 'e56365835ecffd3dcf53620fd444a64ea31461567ccff91fbc76829314b9b508',
  'info': '83e8ccc398163825dcd4988fbfa32de75c4dd1acc7a1b7da29981cc07e7d0047',
  'live-games': '411c3aa3173dca53292f767181810d37e85d7d949161f866a512d142f6712c7e',
  'location': '616892b900a540c602a210fdbc2e4610bb62ecb5676ab16ff1969526e2078c5a',
  'menu': 'bf1a3a598572ec2aaa9a0a32b7c883bc7957107b9861a974cbfde3c50b646267',
  'more': 'e90e5085391db2459e3f7d27209fbbf8c601e6a5af407875c8504a562219fdff',
  'phone': 'f91a032534e543e76aa89e62b22290f00605129d4848d0fb4fee8009100b537a',
  'review': '480f281f105d22c4cacf77a458f2262554c3691894d1528a2034a646aa7dbc62',
  'roadtrip': '08832eef05df42d1f6512b8dd54783008c0e70af4b427b9701bdb874c9292158',
  'saved': 'a278b96a680c530e94467574a61d62b995a87f9914a21c08cc7d6ad41fb97468',
  'search': 'ec84e8cf591a656527d719668b720a5ad02ebee77a2715538790de5193b39982',
  'share': 'f8992bb5998612260edc81a0f696fa2e671bb74e190569b01b4babe27aa44824',
  'trophy': '4d748265ec83585aa038d78460de75e5005cc484dd63dbfea8ffb710b78f14c5',
});

const PANEL_ASSETS = Object.freeze({
  'panel-head.png': [1000, 112, 'e457613763aa85109cf163cf98fd7de0c472c67f2408f717bda7a865d6be863e'],
  'panel-mid.png': [1000, 8, '3643e1688ff20e0383d8c14acf17e848731765b8fd38f69af5afa4d57e4fa6e3'],
  'panel-foot.png': [1000, 72, '9e68d4067af5b1caaa69d73de2dd14d28c9301d41ee17f56b83af686e7d4e138'],
});

test('painted console masters retain exact native geometry and immutable hashes', () => {
  for (const [name, [width, height, sha256]] of Object.entries(PANEL_ASSETS)) {
    const path = `public/images/pnm-console/painted-panels-v1/${name}`;
    const info = pngInfo(path);
    assert.deepEqual([info.width, info.height], [width, height], `${name} geometry drifted`);
    assert.equal(info.sha256, sha256, `${name} pixels drifted`);
    assert.ok([4, 6].includes(info.colorType), `${name} must preserve alpha transparency`);
  }

  const head = pngInfo('public/images/pnm-console/painted-chassis-v1/top-locator.png');
  const plates = pngInfo('public/images/pnm-console/painted-chassis-v1/bottom-plates.png');
  assert.deepEqual([head.width, head.height], [1000, 348]);
  assert.deepEqual([plates.width, plates.height], [1000, 277]);
});

test('every reusable pictogram is a substantial transparent painted object', () => {
  const icons = [
    'search', 'location', 'fullscreen', 'back', 'close', 'saved',
    'share', 'phone', 'globe', 'directions', 'calendar', 'home',
    'menu', 'edit', 'event-ticket', 'live-games', 'roadtrip', 'trophy',
    'alert', 'filter', 'community', 'info', 'review', 'more',
  ];
  for (const icon of icons) {
    const path = `public/images/pnm-console/painted-controls-v1/icon-${icon}.png`;
    assert.equal(existsSync(new URL(path, root)), true, `${icon} holder is missing`);
    const info = pngInfo(path);
    assert.ok(info.width >= 280 && info.height >= 280, `${icon} holder is too small`);
    assert.ok([4, 6].includes(info.colorType), `${icon} holder must have true alpha`);
    assert.equal(info.sha256, ICON_ASSETS[icon], `${icon} painted artwork changed`);
  }
});

test('painted artwork validation rejects truncated and corrupt PNG data', () => {
  const path = 'public/images/pnm-console/painted-controls-v1/icon-info.png';
  const original = bytes(path);
  assert.throws(() => pngInfo(path, original.subarray(0, -7)), /truncated/);
  const corrupt = Buffer.from(original);
  let offset = 8;
  while (corrupt.toString('ascii', offset + 4, offset + 8) !== 'IDAT') offset += 12 + corrupt.readUInt32BE(offset);
  corrupt[offset + 8] ^= 1;
  assert.throws(() => pngInfo(path, corrupt), /checksum/);
  const wrongSignature = Buffer.from(original);
  wrongSignature[0] = 0;
  assert.throws(() => pngInfo(path, wrongSignature), /must be PNG/);
});

test('console components keep master slices separate and live values in DOM zones', () => {
  const component = read('src/components/poker-near-me/PokerNearMeConsole.jsx');
  const css = read('src/styles/worlds/poker-near-me-console.css');

  assert.match(component, /data-pnm-console="painted-chassis-v1"/);
  assert.match(component, /data-pnm-console="painted-panel-v1"/);
  assert.match(component, /pnc-panel__head[\s\S]*pnc-panel__body[\s\S]*pnc-panel__foot/);
  assert.match(component, /completePlatePair/);
  assert.match(component, /ResizeObserver/);
  assert.match(css, /panel-head\.png/);
  assert.match(css, /panel-mid\.png[^;]*repeat-y/);
  assert.match(css, /panel-foot\.png/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(css, /:hover/i);
});

test('final Poker Near Me console layers load after legacy visual compatibility layers', () => {
  const app = read('pages/_app.js');
  const legacy = app.indexOf("import '../src/styles/worlds/poker-near-me-command-surfaces.css';");
  const required = [
    'poker-near-me-console.css',
    'poker-near-me-console-deep.css',
    'poker-near-me-console-search.css',
    'poker-near-me-console-nav.css',
    'poker-near-me-console-dialogs.css',
    'poker-near-me-console-surfaces.css',
    'poker-near-me-console-map.css',
    'poker-near-me-console-cards.css',
    'poker-near-me-console-tools.css',
    'poker-near-me-console-menu.css',
  ];
  for (const file of required) {
    const at = app.indexOf(`import '../src/styles/worlds/${file}';`);
    assert.ok(at > legacy, `${file} must be a final console cascade layer`);
  }
});

test('Poker Near Me hamburger drawer uses complete painted controls without generic vector chrome', () => {
  const menu = read('src/components/ui/HamburgerMenu.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-menu.css');
  const source = pngInfo('public/images/pnm-console/painted-controls-v1/source/icon-sheet-command.png');

  assert.deepEqual([source.width, source.height], [1448, 1086]);
  assert.equal(source.sha256, '3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e');
  assert.match(menu, /data-pnm-console=.*painted-command-drawer-v1/);
  assert.match(menu, /sp-command-item-icon--\$\{pokerNearMeCommandIcon/);
  assert.doesNotMatch(menu, /data-world-command-menu='poker-near-me'[\s\S]{0,240}(?:linear|radial|conic)-gradient/i);
  for (const asset of ['icon-menu.png', 'icon-edit.png', 'icon-close.png', 'button-primary.png', 'button-secondary.png', 'search-well.png']) {
    assert.match(css, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('lobby, daily listings, discovery tools and location indexes use painted controls', () => {
  const lobby = read('src/components/poker-near-me/lobby/LobbyOverlay.jsx');
  const daily = read('src/components/poker-near-me/DailyTournamentsTabPanel.jsx');
  const more = read('src/components/poker-near-me/MoreTabPanel.jsx');
  const locations = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-surfaces.css');

  for (const [name, source] of Object.entries({ lobby, daily, more })) {
    assert.doesNotMatch(source, /<svg\b/i, `${name} cannot draw generic vector controls`);
    assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient\(/i, `${name} cannot fake materials`);
  }
  assert.match(lobby, /PokerNearMeConsoleIcon/);
  assert.match(lobby, /PokerNearMePanelShell/);
  assert.match(daily, /PokerNearMePanelShell/);
  assert.match(more, /PokerNearMePanelShell/);
  assert.match(locations, /PokerNearMePanelShell/);
  assert.match(css, /search-well\.png/);
  assert.match(css, /button-primary\.png/);
  assert.match(css, /button-secondary\.png/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\[data-global-bottom-nav='true'\][\s\S]*?position:\s*relative !important/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('console artwork provenance and no-baked-data policy ship with the assets', () => {
  for (const path of [
    'public/images/pnm-console/painted-chassis-v1/source/README.md',
    'public/images/pnm-console/painted-controls-v1/source/README.md',
    'public/images/pnm-console/painted-panels-v1/README.md',
  ]) {
    const provenance = read(path);
    assert.match(provenance, /SHA-256|SHA-256|hash/i);
    assert.match(provenance, /dynamic|live value|DOM content/i);
  }
});

test('the deep-route console preserves the caller status instead of inventing verification', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /pill=\{status\}/);
  assert.doesNotMatch(deck, /pill=\{[^\n]*'Verified'/);
  assert.match(deck, /pnm-deep-deck__status[^>]*role="status"[\s\S]*?\{status\}/);
  // These real consumers include catalog-only venues and unverified private
  // group records; a neutral tone must never become a verification claim.
  assert.match(read('pages/hub/venues/[id].js'), /Catalog games listed, live count unknown/);
  assert.match(read('pages/home-game/[code].js'), /Private group · membership required/);
});
