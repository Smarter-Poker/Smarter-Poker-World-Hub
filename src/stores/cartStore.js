/**
 * Shopping Cart Store
 * Zustand store for managing cart state
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

// Both Stripe checkout and Diamond merchandise purchase accept quantities
// from 1..10 per line. Clamp every cart line to that shared contract so the
// cart cannot build an order the server must reject at checkout.
const MAX_STORE_QUANTITY_PER_LINE = 10;

const clampQuantity = (_item, quantity) => {
  const q = Number(quantity);
  const safe = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  return Math.min(safe, MAX_STORE_QUANTITY_PER_LINE);
};

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      // Persist the authenticated owner with the cart. An ownerless legacy
      // cart is treated as guest-only and is never imported into an account.
      ownerId: 'guest',
      isOpen: false,
      // A local cart mutation remains authoritative until its exact snapshot is
      // mirrored to user_preferences. This prevents a paid, now-empty cart from
      // being repopulated by an older cross-device snapshot on the next visit.
      syncPending: false,

      setOwner: (ownerId) => {
        const nextOwner = ownerId || 'guest';
        set((state) => state.ownerId === nextOwner
          ? state
          : { ownerId: nextOwner, items: [], syncPending: false });
      },

      // Add item to cart
      addItem: (item) => {
        set((state) => {
          const existingItem = state.items.find((i) => i.id === item.id);

          if (existingItem) {
            // Update quantity if item already exists
            return {
              items: state.items.map((i) =>
                i.id === item.id
                  ? { ...i, quantity: clampQuantity(i, (i.quantity || 1) + (item.quantity || 1)) }
                  : i
              ),
              syncPending: true,
            };
          } else {
            // Add new item
            return {
              items: [
                ...state.items,
                { ...item, quantity: clampQuantity(item, item.quantity || 1) },
              ],
              syncPending: true,
            };
          }
        });
      },

      // Remove item from cart
      removeItem: (itemId) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== itemId),
          syncPending: true,
        }));
      },

      // Update item quantity
      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, quantity: clampQuantity(i, quantity) } : i
          ),
          syncPending: true,
        }));
      },

      // Replace the entire cart.
      // Used to hydrate the store from cross-device persistence
      // (user_preferences.diamond_cart) without going through addItem,
      // which would merge quantities instead of mirroring the source.
      setItems: (items) => {
        const next = Array.isArray(items)
          ? items
              .filter((i) => i && i.id != null)
              .map((i) => ({
                ...i,
                quantity: clampQuantity(i, i.quantity),
              }))
          : [];
        set({ items: next, syncPending: true });
      },

      // Remote hydration is not a local mutation and must not immediately
      // mirror the same snapshot back to the server.
      replaceFromServer: (items) => {
        const next = Array.isArray(items)
          ? items
              .filter((i) => i && i.id != null)
              .map((i) => ({ ...i, quantity: clampQuantity(i, i.quantity) }))
          : [];
        set({ items: next, syncPending: false });
      },

      markSynced: () => set({ syncPending: false }),

      // Clear cart
      clearCart: () => {
        set({ items: [], syncPending: true });
      },

      // Toggle cart open/closed
      toggleCart: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      // Open cart
      openCart: () => {
        set({ isOpen: true });
      },

      // Close cart
      closeCart: () => {
        set({ isOpen: false });
      },

      // Get cart total
      getTotal: () => {
        const items = get().items;
        return items.reduce((total, item) => {
          return total + item.price * (item.quantity || 1);
        }, 0);
      },

      // Get item count
      getItemCount: () => {
        const items = get().items;
        return items.reduce((count, item) => count + (item.quantity || 1), 0);
      },
    }),
    {
      name: 'smarter-poker-cart',
      // Zustand 5 expects a PersistStorage implementation here. Passing raw
      // localStorage writes the state object as "[object Object]", so a reload
      // silently loses the cart. Keep the existing SSR-safe storage selector,
      // but wrap it with Zustand's JSON adapter.
      storage: createJSONStorage(() => getStorage()),
      partialize: (state) => ({
        items: state.items,
        ownerId: state.ownerId,
        syncPending: state.syncPending,
      }),
      version: 3,
      migrate: (persisted, version) => {
        if (version < 2) return { ...persisted, items: [], ownerId: 'guest', syncPending: false };
        if (version < 3) {
          return {
            ...persisted,
            syncPending: Array.isArray(persisted?.items) && persisted.items.length > 0,
          };
        }
        return persisted;
      },
    }
  )
);

export default useCartStore;
