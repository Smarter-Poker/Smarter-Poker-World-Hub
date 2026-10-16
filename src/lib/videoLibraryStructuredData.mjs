/** Serialize catalog text as inert JSON in an HTML script raw-text element. */
export function serializeVideoLibraryStructuredData(jsonLd) {
    const document = Array.isArray(jsonLd)
        ? { '@context': 'https://schema.org', '@graph': jsonLd }
        : { '@context': 'https://schema.org', ...jsonLd };
    const escapes = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };
    return JSON.stringify(document).replace(/[<>&\u2028\u2029]/g, character => escapes[character]);
}
