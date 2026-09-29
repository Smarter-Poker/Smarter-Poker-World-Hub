/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ClubShopItemEditor: edit one Club Shop offer in place (operator only)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the retired Club Arena Manage tab, which could change an offer's
 * commercial terms while the Hub's Club Shop Manage view could only create,
 * hide, activate and delete. Restocking a sold-out drop, ending a sale,
 * shifting a promo window and re-ordering the storefront were all unreachable
 * here until this existed.
 *
 * This component owns the FORM and nothing else. It never talks to the network
 * and never computes a price: it hands `onSave` the body built by
 * src/lib/store/clubShopItemDraft.mjs, and the page performs the request under
 * the same account and club binding its other operator actions use. The server
 * re-reads the row, re-derives the grant from the category, re-checks the
 * Card-funded price ceiling and decides.
 *
 * Blank is a value here, not an omission: blank stock means unlimited, blank
 * sale price ends the sale, blank per-member limit removes the cap, and a blank
 * availability bound clears it. The date controls are local wall-clock and are
 * converted to a real instant before they travel.
 *
 * It is a real form, not a named div: Enter submits it, focus moves into it
 * when it opens, and the page returns focus to the row's own control when it
 * closes. The platform-managed All Throwables Pack is offered only the fields
 * the server will accept from a club, because that guard refuses the whole
 * update without naming a field.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import shellStyles from '../diamond-store/DiamondStoreShell.module.css';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import {
  buildClubShopItemUpdatePayload,
  clubShopEditableCategories,
  clubShopGrantTakesQuantity,
  clubShopGrantTakesReference,
  clubShopItemIsPlatformManaged,
  createClubShopItemDraft,
  MAX_GRANT_QTY,
} from '../../lib/store/clubShopItemDraft.mjs';

const fieldStyle = {
  flex: 1,
  minWidth: 0,
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#E4E6EB',
  fontSize: 14,
  outline: 'none',
};

const rowStyle = { display: 'flex', gap: 10, marginBottom: 10 };

const hintStyle = {
  color: 'rgba(255,255,255,0.62)',
  fontSize: 12,
  lineHeight: 1.6,
  margin: '-2px 0 10px',
};

export default function ClubShopItemEditor({
  item,
  maximumCardFundedPrice = null,
  clubId = null,
  busy = false,
  disabled = false,
  onSave,
  onCancel,
}) {
  const itemId = item?.id || null;
  const [draft, setDraft] = useState(() => createClubShopItemDraft(item));
  const [formError, setFormError] = useState(null);
  const formRef = useRef(null);

  // A different row reuses this editor; its draft must never carry over.
  useEffect(() => {
    setDraft(createClubShopItemDraft(item));
    setFormError(null);
    // The row identity is what decides a reseed. Re-running on every refreshed
    // report object would discard whatever the operator has typed since.
  }, [itemId]);

  // An editor that opens under the row without taking focus leaves a keyboard
  // or screen-reader operator with no way to know it is there.
  useEffect(() => {
    const first = formRef.current?.querySelector(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    if (first && typeof first.focus === 'function') first.focus();
  }, [itemId]);

  const platformManaged = clubShopItemIsPlatformManaged(item);
  const categories = useMemo(
    () => clubShopEditableCategories(draft.category),
    [draft.category]
  );
  const takesQuantity = !platformManaged && clubShopGrantTakesQuantity(draft.category);
  const takesReference = !platformManaged && clubShopGrantTakesReference(draft.category);
  const field = (key) => (event) => {
    const { value } = event.target;
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const locked = busy || disabled;

  const submit = (event) => {
    event?.preventDefault?.();
    if (locked) return;
    const built = buildClubShopItemUpdatePayload({
      clubId,
      item,
      draft,
      maximumCardFundedPrice,
    });
    if (built.error) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    onSave?.(built.payload);
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className={shellStyles.clubAdminCreatePanel}
      aria-label={`Edit ${marketplaceCopy(item?.name || 'Shop Item')}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 20,
        marginTop: 8,
      }}
    >
      <h4 style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', margin: '0 0 14px' }}>
        Edit Shop Item
      </h4>

      <div className={shellStyles.controlRow} style={rowStyle}>
        {!platformManaged && (
          <input
            data-preserve-case="true"
            data-user-content="true"
            aria-label="Item Name"
            value={draft.name}
            onChange={field('name')}
            placeholder="Item Name"
            maxLength={100}
            disabled={locked}
            style={{ ...fieldStyle, flex: 2 }}
          />
        )}
        <input
          type="number"
          aria-label="Price In Diamonds"
          value={draft.price}
          onChange={field('price')}
          placeholder="Price (Diamonds)"
          min="1"
          max={maximumCardFundedPrice || undefined}
          step="1"
          disabled={locked}
          style={fieldStyle}
        />
      </div>

      <div style={hintStyle}>
        {maximumCardFundedPrice
          ? `Current Card-Compatible Price Limit: ${maximumCardFundedPrice.toLocaleString('en-US')} Diamonds.`
          : 'Current Card Price Limit Is Unavailable. Saving Is Paused Until It Returns.'}
      </div>

      {platformManaged && (
        <div style={hintStyle}>
          {marketplaceCopy(item?.name || 'This Offer')} Is Platform Managed. Its Name, Description,
          Category, Image, Uses Delivered And Max Per Member Are Fixed By Smarter.Poker, So Only Its
          Price, Sale Price, Stock, Availability Window And Sort Order Can Be Changed Here.
        </div>
      )}

      {!platformManaged && (
        <input
          data-preserve-case="true"
          data-user-content="true"
          aria-label="Item Description"
          value={draft.description}
          onChange={field('description')}
          placeholder="Description (Optional)"
          maxLength={500}
          disabled={locked}
          style={{ ...fieldStyle, width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
        />
      )}

      {!platformManaged && (
        <div className={shellStyles.controlRow} style={rowStyle}>
          <select
            aria-label="Item Category"
            value={draft.category}
            onChange={field('category')}
            disabled={locked}
            style={{ ...fieldStyle, fontSize: 13, cursor: locked ? 'not-allowed' : 'pointer' }}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            data-preserve-case="true"
            data-user-content="true"
            aria-label="Item Image URL"
            value={draft.imageUrl}
            onChange={field('imageUrl')}
            placeholder="Image URL (Https Only, Optional)"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            disabled={locked}
            style={fieldStyle}
          />
        </div>
      )}

      {takesQuantity && (
        <div className={shellStyles.controlRow} style={rowStyle}>
          <input
            type="number"
            aria-label="Uses Delivered Per Purchase"
            value={draft.grantQty}
            onChange={field('grantQty')}
            placeholder="Uses Delivered"
            min="1"
            max={MAX_GRANT_QTY}
            step="1"
            disabled={locked}
            style={fieldStyle}
          />
          <input
            type="number"
            aria-label="Stock Quantity, Blank For Unlimited"
            value={draft.stock}
            onChange={field('stock')}
            placeholder="Stock (Blank = Unlimited)"
            min="0"
            step="1"
            disabled={locked}
            style={fieldStyle}
          />
        </div>
      )}

      {!takesQuantity && (
        <div className={shellStyles.controlRow} style={rowStyle}>
          <input
            type="number"
            aria-label="Stock Quantity, Blank For Unlimited"
            value={draft.stock}
            onChange={field('stock')}
            placeholder="Stock (Blank = Unlimited)"
            min="0"
            step="1"
            disabled={locked}
            style={fieldStyle}
          />
        </div>
      )}

      {takesReference && (
        <div className={shellStyles.controlRow} style={rowStyle}>
          <input
            data-preserve-case="true"
            data-user-content="true"
            aria-label="Grant Reference Identifier"
            value={draft.grantRef}
            onChange={field('grantRef')}
            placeholder="Grant Reference"
            autoCapitalize="none"
            spellCheck={false}
            disabled={locked}
            style={fieldStyle}
          />
        </div>
      )}

      <div className={shellStyles.controlRow} style={rowStyle}>
        <input
          type="number"
          aria-label="Sale Price, Blank To End The Sale"
          value={draft.salePrice}
          onChange={field('salePrice')}
          placeholder="Sale Price (Blank Ends The Sale)"
          min="0"
          step="1"
          disabled={locked}
          style={fieldStyle}
        />
        {!platformManaged && (
          <input
            type="number"
            aria-label="Maximum Purchases Per Member, Blank For No Cap"
            value={draft.perUserLimit}
            onChange={field('perUserLimit')}
            placeholder="Max Per Member (Blank = No Cap)"
            min="1"
            step="1"
            disabled={locked}
            style={fieldStyle}
          />
        )}
      </div>

      <div className={shellStyles.controlRow} style={rowStyle}>
        <input
          type="datetime-local"
          aria-label="Available From"
          value={draft.availableFrom}
          onChange={field('availableFrom')}
          disabled={locked}
          style={fieldStyle}
        />
        <input
          type="datetime-local"
          aria-label="Available Until"
          value={draft.availableUntil}
          onChange={field('availableUntil')}
          disabled={locked}
          style={fieldStyle}
        />
      </div>

      <div className={shellStyles.controlRow} style={rowStyle}>
        <input
          type="number"
          aria-label="Storefront Sort Order"
          value={draft.sortOrder}
          onChange={field('sortOrder')}
          placeholder="Sort Order (Lower Shows First)"
          step="1"
          disabled={locked}
          style={fieldStyle}
        />
      </div>

      <div style={hintStyle}>
        Stock Is A Limited Drop,{' '}
        {platformManaged ? '' : 'Max Per Member Caps Lifetime Purchases, '}A Sale Price Is What Is
        Actually Charged, And Available Until Ends The Offer Automatically. Leave A Field Blank To
        Clear It.
      </div>

      {formError && (
        <div
          role="alert"
          style={{
            margin: '0 0 12px',
            padding: '10px 12px',
            border: '1px solid rgba(240,40,73,0.55)',
            background: 'rgba(240,40,73,0.10)',
            color: '#FF5B6E',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {marketplaceCopy(formError)}
        </div>
      )}

      <div className={shellStyles.clubAdminActions}>
        <button
          type="submit"
          disabled={locked || !maximumCardFundedPrice}
          aria-busy={busy}
          aria-label={`Save Changes To ${marketplaceCopy(item?.name || 'Shop Item')}`}
        >
          {busy ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => onCancel?.()}
          disabled={busy}
          aria-label={`Cancel Editing ${marketplaceCopy(item?.name || 'Shop Item')}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
