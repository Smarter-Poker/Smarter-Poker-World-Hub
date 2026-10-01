import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const component = readFileSync(resolve(root, 'src/components/store/MerchStore.jsx'), 'utf8');
const styles = readFileSync(resolve(root, 'src/components/store/MerchStore.module.css'), 'utf8');

test('merch discovery renders a bounded first page and expands without discarding filters', () => {
  assert.match(component, /const MERCH_PAGE_SIZE = 12/);
  assert.match(component, /visibleProducts\.slice\(0, visibleLimit\)/);
  assert.match(component, /setVisibleLimit\(MERCH_PAGE_SIZE\)/);
  assert.match(component, /categoryFilter, focusProductId, searchQuery, sortMode/);
  assert.match(component, /Load More Products \(\{visibleProducts\.length - pagedProducts\.length\} Remaining\)/);
  assert.match(component, /catalog_page_loaded/);
});

test('detail mode remains a single-product surface and the load control is accessible', () => {
  assert.match(component, /detailMode \? visibleProducts : visibleProducts\.slice/);
  assert.match(component, /!detailMode && pagedProducts\.length < visibleProducts\.length/);
  assert.match(component, /type="button"[\s\S]*loadMoreControl/);
  assert.match(styles, /\.loadMoreControl/);
});
