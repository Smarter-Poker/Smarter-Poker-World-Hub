const UNSAFE_EXTENSION_LINE =
  "const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];";
const SAFE_EXTENSION_LINE =
  'const ext = inferNextFontFileExtension(googleFontFileUrl, fontFileBuffer);';
const LOADER_START = 'const nextFontGoogleFontLoader = async';

/**
 * Google normally returns a URL ending in `.woff2`, but the CSS endpoint may
 * also return an extensionless `/l/font?...` URL. Next already downloaded the
 * bytes at this point, so use their file signature when the URL has no usable
 * suffix instead of assuming a terminal extension and dereferencing `null`.
 */
function inferNextFontFileExtension(googleFontFileUrl, fontFileBuffer) {
  const urlMatch = /\.(woff2?|eot|ttf|otf)(?:$|[?#])/i.exec(googleFontFileUrl);
  if (urlMatch) return urlMatch[1].toLowerCase();

  const bytes = Buffer.from(fontFileBuffer);
  const signature = bytes.subarray(0, 4).toString('ascii');

  if (signature === 'wOF2') return 'woff2';
  if (signature === 'wOFF') return 'woff';
  if (signature === 'OTTO') return 'otf';
  if (
    bytes.length >= 4 &&
    (bytes.readUInt32BE(0) === 0x00010000 || signature === 'true' || signature === 'typ1')
  ) {
    return 'ttf';
  }
  if (bytes.length >= 36 && bytes.readUInt16LE(34) === 0x504c) return 'eot';

  throw new Error('Unable to determine the downloaded Google font file extension.');
}

function patchNextGoogleFontLoaderSource(source) {
  const alreadyPatched =
    source.includes(SAFE_EXTENSION_LINE) &&
    source.includes('function inferNextFontFileExtension(');
  if (alreadyPatched) {
    return { source, changed: false, status: 'already-patched' };
  }

  const occurrences = source.split(UNSAFE_EXTENSION_LINE).length - 1;
  if (occurrences === 0) {
    return { source, changed: false, status: 'upstream-safe-or-unknown' };
  }
  if (occurrences !== 1) {
    throw new Error(
      `Expected one unsafe Next Google font extension lookup, found ${occurrences}.`
    );
  }
  if (!source.includes(LOADER_START)) {
    throw new Error('Next Google font loader entry point was not found.');
  }

  const helperSource = inferNextFontFileExtension.toString();
  const withHelper = source.replace(LOADER_START, `${helperSource}\n${LOADER_START}`);
  const patched = withHelper.replace(UNSAFE_EXTENSION_LINE, SAFE_EXTENSION_LINE);

  return { source: patched, changed: true, status: 'patched' };
}

module.exports = {
  inferNextFontFileExtension,
  patchNextGoogleFontLoaderSource,
};
