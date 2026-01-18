/**
 * Article Store - Zustand State Management
 * God Mode Stack - Individual article state
 */
import { create } from 'zustand';

export const useArticleStore = create((set, get) => ({
    // State
    currentArticle: null,
    relatedArticles: [],
    isLoading: false,
    isBookmarked: false,
    readProgress: 0,

    // Actions
    setArticle: (article) => set({ currentArticle: article }),
    setRelatedArticles: (articles) => set({ relatedArticles: articles }),
    setLoading: (loading) => set({ isLoading: loading }),
    toggleBookmark: () => set((state) => ({ isBookmarked: !state.isBookmarked })),
    setReadProgress: (progress) => set({ readProgress: progress }),

    // Fetch article by ID or slug
    fetchArticle: async (id, slug) => {
        set({ isLoading: true });
        try {
            const params = new URLSearchParams();
            if (id) params.set('id', id);
            if (slug) params.set('slug', slug);

            const res = await fetch(`/api/news/articles?${params}&limit=1`);
            const { success, data } = await res.json();

            if (success && data?.length) {
                const article = data[0];
                set({ currentArticle: article });

                // Increment view count
                await fetch('/api/news/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: article.id })
                });

                // Fetch related articles
                const relatedRes = await fetch(
                    `/api/news/articles?category=${article.category}&limit=3`
                );
                const relatedData = await relatedRes.json();
                if (relatedData.success) {
                    const filtered = relatedData.data.filter(a => a.id !== article.id);
                    set({ relatedArticles: filtered.slice(0, 3) });
                }
            }
        } catch (error) {
            console.error('Failed to fetch article:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    // Clear current article
    clearArticle: () => set({
        currentArticle: null,
        relatedArticles: [],
        readProgress: 0
    })
}));
