import React from 'react';
import MerchCatalogAdmin from '../admin/MerchCatalogAdmin';

/**
 * Stable Admin lazy-panel seam for the already self-contained catalog.
 * MerchCatalogAdmin owns its loaders, mutation guards, drafts and responsive
 * console UI; the shell supplies only the authenticated operator fetcher.
 */
export default function MerchPanel({ authFetch }) {
  return <MerchCatalogAdmin authFetch={authFetch} />;
}
