/**
 * Shopping Cart Store
 * Zustand store for managing cart state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

// Mirrors MAX_DIAMOND_QUANTITY_PER_PACKAGE in
// pages/api/store/create-checkout-session.js. Diamond packages are capped
// server-side, so clamping here keeps the UI from building a cart that
// checkout would reject with INVALID_QUANTITY. Non-diamond items (merch)
// are not capped by the server and are left alone.
const MAX_DIAMOND_QUANTITY_PER_PACKAGE = 10;

const clampQuantity = (item, quantity) => {
    const q = Number(quantity);
    const safe = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
    return item?.type === 'diamonds'
        ? Math.min(safe, MAX_DIAMOND_QUANTITY_PER_PACKAGE)
        : safe;
};

const useCartStore = create(
    persist(
        (set, get) => ({
            items: [],
            isOpen: false,

            // Add item to cart
            addItem: (item) => {
                set((state) => {
                    const existingItem = state.items.find(i => i.id === item.id);

                    if (existingItem) {
                        // Update quantity if item already exists
                        return {
                            items: state.items.map(i =>
                                i.id === item.id
                                    ? { ...i, quantity: clampQuantity(i, (i.quantity || 1) + (item.quantity || 1)) }
                                    : i
                            )
                        };
                    } else {
                        // Add new item
                        return {
                            items: [...state.items, { ...item, quantity: clampQuantity(item, item.quantity || 1) }]
                        };
                    }
                });
            },

            // Remove item from cart
            removeItem: (itemId) => {
                set((state) => ({
                    items: state.items.filter(i => i.id !== itemId)
                }));
            },

            // Update item quantity
            updateQuantity: (itemId, quantity) => {
                if (quantity <= 0) {
                    get().removeItem(itemId);
                    return;
                }

                set((state) => ({
                    items: state.items.map(i =>
                        i.id === itemId ? { ...i, quantity: clampQuantity(i, quantity) } : i
                    )
                }));
            },

            // Replace the entire cart.
            // Used to hydrate the store from cross-device persistence
            // (user_preferences.diamond_cart) without going through addItem,
            // which would merge quantities instead of mirroring the source.
            setItems: (items) => {
                const next = Array.isArray(items)
                    ? items
                        .filter(i => i && i.id != null)
                        .map(i => ({
                            ...i,
                            quantity: clampQuantity(i, i.quantity)
                        }))
                    : [];
                set({ items: next });
            },

            // Clear cart
            clearCart: () => {
                set({ items: [] });
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
                    return total + (item.price * (item.quantity || 1));
                }, 0);
            },

            // Get item count
            getItemCount: () => {
                const items = get().items;
                return items.reduce((count, item) => count + (item.quantity || 1), 0);
            }
        }),
        {
            name: 'smarter-poker-cart',
            storage: getStorage(),
            partialize: (state) => ({ items: state.items })
        }
    )
);

export default useCartStore;
