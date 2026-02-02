/**
 * Shopping Cart Store
 * Zustand store for managing cart state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
                                    ? { ...i, quantity: (i.quantity || 1) + (item.quantity || 1) }
                                    : i
                            )
                        };
                    } else {
                        // Add new item
                        return {
                            items: [...state.items, { ...item, quantity: item.quantity || 1 }]
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
                        i.id === itemId ? { ...i, quantity } : i
                    )
                }));
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
            partialize: (state) => ({ items: state.items })
        }
    )
);

export default useCartStore;
