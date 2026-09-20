import React, { useCallback, useEffect, useMemo, useState } from 'react';
import OperatorGlyph from './OperatorGlyph';
import styles from './MerchCatalogAdmin.module.css';

const Archive = props => <OperatorGlyph kind="archive" {...props} />;
const Box = props => <OperatorGlyph kind="box" {...props} />;
const Check = props => <OperatorGlyph kind="check" {...props} />;
const CircleAlert = props => <OperatorGlyph kind="alert" {...props} />;
const Eye = props => <OperatorGlyph kind="eye" {...props} />;
const Glasses = props => <OperatorGlyph kind="glasses" {...props} />;
const Layers3 = props => <OperatorGlyph kind="layers" {...props} />;
const PackagePlus = props => <OperatorGlyph kind="package-plus" {...props} />;
const RefreshCw = props => <OperatorGlyph kind="refresh" {...props} />;
const Save = props => <OperatorGlyph kind="save" {...props} />;
const Search = props => <OperatorGlyph kind="search" {...props} />;
const Shirt = props => <OperatorGlyph kind="shirt" {...props} />;
const Sparkles = props => <OperatorGlyph kind="spark" {...props} />;
const Tags = props => <OperatorGlyph kind="tag" {...props} />;
const Undo2 = props => <OperatorGlyph kind="undo" {...props} />;

const EMPTY_ITEM = {
  id: '', name: '', description: '', category: 'apparel', image_url: '',
  price_usd: '29.99', price_diamonds: '2999', sort_order: '0', stock: '',
  is_active: true, has_variants: false,
  metadata: {
    made_to_order: true, fulfillment_provider: 'printful', fulfillment_status: 'mapping_required',
    design_collection: 'Neural Steel', product_type: '', sync_variant_id: '', external_variant_id: '',
  },
};

const EMPTY_VARIANT = {
  sku: '', size: '', color: 'Black', stock: '50', sort_order: '10',
  price_usd: '', price_diamonds: '', is_active: true,
  metadata: { sync_variant_id: '', external_variant_id: '', fulfillment_status: 'mapping_required' },
};

function toForm(item) {
  const metadata = item?.metadata || {};
  return {
    id: item?.id || '',
    name: item?.name || '',
    description: item?.description || '',
    category: item?.category || 'accessories',
    image_url: item?.image_url || '',
    price_usd: item?.price_usd ?? '',
    price_diamonds: item?.price_diamonds ?? '',
    sort_order: item?.sort_order ?? 0,
    stock: item?.stock ?? '',
    is_active: item?.is_active !== false,
    has_variants: item?.has_variants === true,
    metadata: {
      made_to_order: metadata.made_to_order === true,
      fulfillment_provider: metadata.fulfillment_provider || '',
      fulfillment_status: metadata.fulfillment_status || '',
      design_collection: metadata.design_collection || '',
      product_type: metadata.product_type || '',
      sync_variant_id: metadata.sync_variant_id ?? '',
      external_variant_id: metadata.external_variant_id || '',
    },
  };
}

function statusLabel(item, printfulReady) {
  if (!item.is_active) return { tone: 'archived', label: 'Archived' };
  if (item.fulfillment_ready) return { tone: 'ready', label: 'Live And Ready' };
  if (item.fulfillment_mapped && !printfulReady) return { tone: 'warning', label: 'Provider Disabled' };
  if (item.metadata?.fulfillment_provider === 'provider_pending') return { tone: 'warning', label: 'Provider Required' };
  if (!item.fulfillment_mapped) return { tone: 'warning', label: 'Mapping Required' };
  return { tone: 'warning', label: 'Setup Required' };
}

function Input({ label, hint, className, ...props }) {
  return (
    <label className={`${styles.field}${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      <input {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

function ProductThumbnail({ item, Icon }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [item.image_url]);

  if (!item.image_url || failed) return <Icon size={25} aria-hidden="true" />;
  return <img src={item.image_url} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function VariantRow({ variant, busy, onSave, onArchive }) {
  const [draft, setDraft] = useState(() => ({
    id: variant.id,
    sku: variant.sku || '', size: variant.size || '', color: variant.color || '',
    stock: variant.stock ?? 0, sort_order: variant.sort_order ?? 0,
    price_usd: variant.price_usd ?? '', price_diamonds: variant.price_diamonds ?? '',
    is_active: variant.is_active !== false,
    metadata: {
      sync_variant_id: variant.metadata?.sync_variant_id ?? '',
      external_variant_id: variant.metadata?.external_variant_id || '',
      fulfillment_status: variant.metadata?.fulfillment_status || 'mapping_required',
    },
  }));

  useEffect(() => {
    setDraft({
      id: variant.id,
      sku: variant.sku || '', size: variant.size || '', color: variant.color || '',
      stock: variant.stock ?? 0, sort_order: variant.sort_order ?? 0,
      price_usd: variant.price_usd ?? '', price_diamonds: variant.price_diamonds ?? '',
      is_active: variant.is_active !== false,
      metadata: {
        sync_variant_id: variant.metadata?.sync_variant_id ?? '',
        external_variant_id: variant.metadata?.external_variant_id || '',
        fulfillment_status: variant.metadata?.fulfillment_status || 'mapping_required',
      },
    });
  }, [variant]);

  const set = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setMeta = (field, value) => setDraft(current => ({
    ...current, metadata: { ...current.metadata, [field]: value },
  }));

  return (
    <div className={`${styles.variantRow} ${variant.is_active ? '' : styles.variantArchived}`}>
      <div className={styles.variantStatus}>
        <strong>{variant.sku}</strong>
        <span className={variant.fulfillment_mapped ? styles.mapped : styles.unmapped}>
          {variant.fulfillment_mapped ? 'Mapped' : 'Mapping Required'}
        </span>
      </div>
      <div className={styles.variantGrid}>
        <Input label="SKU" value={draft.sku} onChange={event => set('sku', event.target.value.toUpperCase())} />
        <Input label="Size" value={draft.size} onChange={event => set('size', event.target.value)} />
        <Input label="Color" value={draft.color} onChange={event => set('color', event.target.value)} />
        <Input label="Stock" type="number" min="0" value={draft.stock} onChange={event => set('stock', event.target.value)} />
        <Input label="USD Override" type="number" min="0.01" step="0.01" value={draft.price_usd} onChange={event => set('price_usd', event.target.value)} />
        <Input label="Sort Order" type="number" value={draft.sort_order} onChange={event => set('sort_order', event.target.value)} />
        <Input label="Printful Sync Variant ID" type="number" min="1" value={draft.metadata.sync_variant_id} onChange={event => setMeta('sync_variant_id', event.target.value)} />
        <Input label="External Variant ID" value={draft.metadata.external_variant_id} onChange={event => setMeta('external_variant_id', event.target.value)} />
      </div>
      <div className={styles.rowActions}>
        <button className={styles.secondaryButton} disabled={busy} onClick={() => onSave(draft)}>
          <Save size={15} /> Save Option
        </button>
        {variant.is_active ? (
          <button className={styles.archiveButton} disabled={busy} onClick={() => onArchive(variant)}>
            <Archive size={15} /> Archive Option
          </button>
        ) : (
          <button className={styles.secondaryButton} disabled={busy} onClick={() => onSave({ ...draft, is_active: true })}>
            <Undo2 size={15} /> Restore Option
          </button>
        )}
      </div>
    </div>
  );
}

export default function MerchCatalogAdmin({ authFetch }) {
  const [catalog, setCatalog] = useState({
    items: [], categories: [], providers: [], fulfillmentStatuses: [], printfulReady: false,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => ({ ...EMPTY_ITEM, metadata: { ...EMPTY_ITEM.metadata } }));
  const [creating, setCreating] = useState(false);
  const [newVariant, setNewVariant] = useState(() => ({ ...EMPTY_VARIANT, metadata: { ...EMPTY_VARIANT.metadata } }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    try {
      const body = await authFetch('/api/horses/merch-catalog-admin');
      setCatalog({
        items: body.items || [], categories: body.categories || [], providers: body.providers || [],
        fulfillmentStatuses: body.fulfillmentStatuses || [], printfulReady: body.printfulReady === true,
      });
      const nextId = keepSelection && selectedId && (body.items || []).some(item => item.id === selectedId)
        ? selectedId
        : body.items?.[0]?.id || null;
      if (!creating) {
        setSelectedId(nextId);
        const next = (body.items || []).find(item => item.id === nextId);
        if (next) setForm(toForm(next));
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error.message || 'Could Not Load The Merch Catalog' });
    } finally {
      setLoading(false);
    }
  }, [authFetch, creating, selectedId]);

  useEffect(() => { load({ keepSelection: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(
    () => catalog.items.find(item => item.id === selectedId) || null,
    [catalog.items, selectedId],
  );

  const filtered = useMemo(() => catalog.items.filter(item => {
    const haystack = `${item.name} ${item.id} ${item.description || ''}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (visibility === 'active' && !item.is_active) return false;
    if (visibility === 'archived' && item.is_active) return false;
    if (visibility === 'mapping' && item.fulfillment_mapped) return false;
    return true;
  }), [catalog.items, category, query, visibility]);

  const metrics = useMemo(() => ({
    total: catalog.items.length,
    active: catalog.items.filter(item => item.is_active).length,
    mapped: catalog.items.filter(item => item.fulfillment_mapped).length,
    ready: catalog.items.filter(item => item.fulfillment_ready).length,
  }), [catalog.items]);

  const selectItem = (item) => {
    setCreating(false);
    setSelectedId(item.id);
    setForm(toForm(item));
    setNotice(null);
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setForm({ ...EMPTY_ITEM, metadata: { ...EMPTY_ITEM.metadata }, sort_order: String((catalog.items.length + 1) * 10) });
    setNotice(null);
  };

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const setMeta = (field, value) => setForm(current => ({
    ...current, metadata: { ...current.metadata, [field]: value },
  }));

  const mutate = async (url, options, successMessage) => {
    setBusy(true);
    setNotice(null);
    try {
      await authFetch(url, options);
      setNotice({ tone: 'success', message: successMessage });
      await load();
      return true;
    } catch (error) {
      setNotice({ tone: 'error', message: error.message || 'Catalog Update Failed' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async () => {
    const payload = { ...form, entity: 'item' };
    const success = await mutate('/api/horses/merch-catalog-admin', {
      method: creating ? 'POST' : 'PATCH', body: JSON.stringify(payload),
    }, creating ? 'Product Created And Added To The Catalog' : 'Product Changes Saved');
    if (success && creating) {
      setCreating(false);
      setSelectedId(form.id);
    }
  };

  const archiveItem = async () => {
    if (!selected) return;
    await mutate('/api/horses/merch-catalog-admin', {
      method: 'DELETE', body: JSON.stringify({ entity: 'item', id: selected.id }),
    }, 'Product Archived And Removed From The Public Store');
  };

  const restoreItem = async () => {
    if (!selected) return;
    await mutate('/api/horses/merch-catalog-admin', {
      method: 'PATCH', body: JSON.stringify({ entity: 'item', id: selected.id, is_active: true }),
    }, 'Product Restored To The Public Catalog');
  };

  const saveVariant = async draft => {
    await mutate('/api/horses/merch-catalog-admin', {
      method: 'PATCH', body: JSON.stringify({ ...draft, entity: 'variant' }),
    }, 'Product Option Saved');
  };

  const archiveVariant = async variant => {
    await mutate('/api/horses/merch-catalog-admin', {
      method: 'DELETE', body: JSON.stringify({ entity: 'variant', id: variant.id }),
    }, 'Product Option Archived');
  };

  const addVariant = async () => {
    if (!selected) return;
    const success = await mutate('/api/horses/merch-catalog-admin', {
      method: 'POST', body: JSON.stringify({ ...newVariant, entity: 'variant', item_id: selected.id }),
    }, 'Product Option Added');
    if (success) setNewVariant({ ...EMPTY_VARIANT, metadata: { ...EMPTY_VARIANT.metadata } });
  };

  const status = selected ? statusLabel(selected, catalog.printfulReady) : null;

  return (
    <section className={styles.shell} aria-labelledby="merch-catalog-title">
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Neural Steel Commerce Control</p>
          <h2 id="merch-catalog-title">Merch Catalog</h2>
          <p>Manage Products, Prices, Artwork, Visibility, Stock, And Print-On-Demand Mappings.</p>
        </div>
        <div className={styles.heroActions}>
          <span className={`${styles.providerState} ${catalog.printfulReady ? styles.providerReady : styles.providerBlocked}`}>
            {catalog.printfulReady ? <Check size={15} /> : <CircleAlert size={15} />}
            {catalog.printfulReady ? 'Printful Enabled' : 'Printful Checkout Locked'}
          </span>
          <button className={styles.secondaryButton} onClick={() => load()} disabled={loading || busy}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className={styles.primaryButton} onClick={startCreate} disabled={busy}>
            <PackagePlus size={16} /> Add Product
          </button>
        </div>
      </header>

      <div className={styles.metrics}>
        <div><Box size={18} /><strong>{metrics.total}</strong><span>Total Products</span></div>
        <div><Eye size={18} /><strong>{metrics.active}</strong><span>Visible Products</span></div>
        <div><Tags size={18} /><strong>{metrics.mapped}</strong><span>Fully Mapped</span></div>
        <div><Sparkles size={18} /><strong>{metrics.ready}</strong><span>Checkout Ready</span></div>
      </div>

      {notice ? (
        <div role="status" className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess}`}>
          {notice.tone === 'error' ? <CircleAlert size={16} /> : <Check size={16} />}{notice.message}
        </div>
      ) : null}

      <div className={styles.workspace}>
        <aside className={styles.catalogRail} aria-label="Merchandise Products">
          <div className={styles.filters}>
            <label className={styles.searchBox}>
              <Search size={16} />
              <input type="search" placeholder="Search Products" value={query} onChange={event => setQuery(event.target.value)} />
            </label>
            <select aria-label="Filter By Category" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="all">All Categories</option>
              {catalog.categories.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
            <select aria-label="Filter By Status" value={visibility} onChange={event => setVisibility(event.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Visible</option>
              <option value="archived">Archived</option>
              <option value="mapping">Mapping Required</option>
            </select>
          </div>

          <div className={styles.productList}>
            {loading ? <div className={styles.loading}><RefreshCw size={18} /> Loading Catalog</div> : null}
            {!loading && filtered.length === 0 ? <div className={styles.empty}>No Products Match These Filters.</div> : null}
            {filtered.map(item => {
              const itemStatus = statusLabel(item, catalog.printfulReady);
              const ProductIcon = item.category === 'apparel' || item.category === 'headwear' ? Shirt
                : item.category === 'eyewear' ? Glasses : Layers3;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.productCard} ${selectedId === item.id && !creating ? styles.productCardActive : ''}`}
                  onClick={() => selectItem(item)}
                >
                  <div className={styles.productImage}>
                    <ProductThumbnail item={item} Icon={ProductIcon} />
                  </div>
                  <div className={styles.productSummary}>
                    <strong>{item.name}</strong>
                    <span>{item.id}</span>
                    <small className={styles[itemStatus.tone]}>{itemStatus.label}</small>
                  </div>
                  <b>${Number(item.price_usd || 0).toFixed(2)}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <div className={styles.editor}>
          <div className={styles.editorHeader}>
            <div>
              <p className={styles.eyebrow}>{creating ? 'New Catalog Record' : 'Product Spec Plate'}</p>
              <h3>{creating ? 'Add Product' : selected?.name || 'Select A Product'}</h3>
            </div>
            {status ? <span className={`${styles.statusBadge} ${styles[status.tone]}`}>{status.label}</span> : null}
          </div>

          {(creating || selected) ? (
            <>
              <div className={styles.formSection}>
                <h4>Product Identity</h4>
                <div className={styles.formGrid}>
                  <Input label="Product ID" value={form.id} disabled={!creating} onChange={event => set('id', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} hint="Stable Lowercase Slug" />
                  <Input label="Product Name" value={form.name} onChange={event => set('name', event.target.value)} />
                  <Select label="Category" value={form.category} onChange={event => set('category', event.target.value)}>
                    {catalog.categories.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
                  </Select>
                  <Input label="Product Type" value={form.metadata.product_type} onChange={event => setMeta('product_type', event.target.value)} placeholder="Hoodie, Tee, Sunglasses" />
                  <label className={`${styles.field} ${styles.fullField}`}>
                    <span>Description</span>
                    <textarea rows="3" value={form.description} onChange={event => set('description', event.target.value)} />
                  </label>
                  <Input className={styles.fullField} label="Image URL" value={form.image_url} onChange={event => set('image_url', event.target.value)} hint="Use /images/merch/... Or An HTTPS Asset" />
                </div>
              </div>

              <div className={styles.formSection}>
                <h4>Pricing And Visibility</h4>
                <div className={styles.formGrid}>
                  <Input label="USD Price" type="number" min="0.01" step="0.01" value={form.price_usd} onChange={event => set('price_usd', event.target.value)} />
                  <Input label="Diamond Price" type="number" min="1" value={form.price_diamonds} onChange={event => set('price_diamonds', event.target.value)} />
                  <Input label="Sort Order" type="number" value={form.sort_order} onChange={event => set('sort_order', event.target.value)} />
                  <Input label="Stock" type="number" min="0" value={form.stock} onChange={event => set('stock', event.target.value)} hint="Blank Means Made To Order" />
                  <label className={styles.checkField}><input type="checkbox" checked={form.is_active} onChange={event => set('is_active', event.target.checked)} /> Visible In Store</label>
                  <label className={styles.checkField}><input type="checkbox" checked={form.metadata.made_to_order} onChange={event => setMeta('made_to_order', event.target.checked)} /> Made To Order</label>
                </div>
              </div>

              <div className={styles.formSection}>
                <h4>Fulfillment Wiring</h4>
                <p className={styles.sectionNote}>Checkout Stays Locked Until The Item Or Every Active Option Has An Exact Provider Mapping.</p>
                <div className={styles.formGrid}>
                  <Select label="Fulfillment Provider" value={form.metadata.fulfillment_provider} onChange={event => setMeta('fulfillment_provider', event.target.value)}>
                    <option value="">No Provider</option>
                    {catalog.providers.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
                  </Select>
                  <Input label="Collection" value={form.metadata.design_collection} onChange={event => setMeta('design_collection', event.target.value)} />
                  <Input label="Item-Level Printful Sync ID" type="number" min="1" value={form.metadata.sync_variant_id} onChange={event => setMeta('sync_variant_id', event.target.value)} hint="Use Only For Products Without Options" />
                  <Input label="External Variant ID" value={form.metadata.external_variant_id} onChange={event => setMeta('external_variant_id', event.target.value)} />
                </div>
              </div>

              <div className={styles.editorActions}>
                <button className={styles.primaryButton} disabled={busy} onClick={saveItem}>
                  <Save size={16} /> {busy ? 'Saving Changes' : creating ? 'Create Product' : 'Save Product'}
                </button>
                {!creating && selected?.is_active ? (
                  <button className={styles.archiveButton} disabled={busy} onClick={archiveItem}><Archive size={16} /> Archive Product</button>
                ) : null}
                {!creating && selected && !selected.is_active ? (
                  <button className={styles.secondaryButton} disabled={busy} onClick={restoreItem}><Undo2 size={16} /> Restore Product</button>
                ) : null}
              </div>

              {!creating && selected ? (
                <div className={styles.formSection}>
                  <div className={styles.sectionHeader}>
                    <div><h4>Product Options</h4><p className={styles.sectionNote}>Sizes, Colors, Stock, Price Overrides, And Exact Printful Variant IDs.</p></div>
                    <span>{selected.variants?.length || 0} Options</span>
                  </div>
                  <div className={styles.variantList}>
                    {(selected.variants || []).map(variant => (
                      <VariantRow key={variant.id} variant={variant} busy={busy} onSave={saveVariant} onArchive={archiveVariant} />
                    ))}
                  </div>

                  <div className={styles.newVariant}>
                    <h5>Add Product Option</h5>
                    <div className={styles.variantGrid}>
                      <Input label="SKU" value={newVariant.sku} onChange={event => setNewVariant(current => ({ ...current, sku: event.target.value.toUpperCase() }))} />
                      <Input label="Size" value={newVariant.size} onChange={event => setNewVariant(current => ({ ...current, size: event.target.value }))} />
                      <Input label="Color" value={newVariant.color} onChange={event => setNewVariant(current => ({ ...current, color: event.target.value }))} />
                      <Input label="Stock" type="number" min="0" value={newVariant.stock} onChange={event => setNewVariant(current => ({ ...current, stock: event.target.value }))} />
                      <Input label="Sort Order" type="number" value={newVariant.sort_order} onChange={event => setNewVariant(current => ({ ...current, sort_order: event.target.value }))} />
                      <Input label="Printful Sync Variant ID" type="number" min="1" value={newVariant.metadata.sync_variant_id} onChange={event => setNewVariant(current => ({ ...current, metadata: { ...current.metadata, sync_variant_id: event.target.value } }))} />
                    </div>
                    <button className={styles.secondaryButton} disabled={busy || !newVariant.sku} onClick={addVariant}><PackagePlus size={15} /> Add Option</button>
                  </div>
                </div>
              ) : null}
            </>
          ) : <div className={styles.emptyEditor}><Box size={34} /><p>Select A Product Or Add A New One.</p></div>}
        </div>
      </div>
    </section>
  );
}
