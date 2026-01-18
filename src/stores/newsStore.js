/**
 * News Store - Zustand State Management
 * God Mode Stack - Global news state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useNewsStore = create(
    persist(
        (set, get) => ({
            // State
            articles: [],
            videos: [],
            trending: [],
            events: [],
            activeCategory: 'all',
            searchQuery: '',
            isLoading: false,
            lastFetched: null,

            // Actions
            setArticles: (articles) => set({ articles, lastFetched: Date.now() }),
            setVideos: (videos) => set({ videos }),
            setTrending: (trending) => set({ trending }),
            setEvents: (events) => set({ events }),
            setActiveCategory: (category) => set({ activeCategory: category }),
            setSearchQuery: (query) => set({ searchQuery: query }),
            setLoading: (loading) => set({ isLoading: loading }),

            // Computed
            getFilteredArticles: () => {
                const { articles, activeCategory, searchQuery } = get();
                return articles.filter(article => {
                    const matchesCategory = activeCategory === 'all' ||
                        article.category?.toLowerCase() === activeCategory.toLowerCase();
                    const matchesSearch = !searchQuery ||
                        article.title?.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesCategory && matchesSearch;
                });
            },

            // Fetch all data
            fetchAllData: async () => {
                set({ isLoading: true });
                try {
                    const [articlesRes, videosRes, eventsRes] = await Promise.all([
                        fetch('/api/news/articles?limit=20'),
                        fetch('/api/news/videos?limit=4'),
                        fetch('/api/news/events?limit=5')
                    ]);

                    const [articlesData, videosData, eventsData] = await Promise.all([
                        articlesRes.json(),
                        videosRes.json(),
                        eventsRes.json()
                    ]);

                    if (articlesData.success) set({ articles: articlesData.data });
                    if (videosData.success) set({ videos: videosData.data });
                    if (eventsData.success) set({ events: eventsData.data });

                    // Sort for trending
                    if (articlesData.success && articlesData.data) {
                        const sorted = [...articlesData.data]
                            .sort((a, b) => (b.views || 0) - (a.views || 0))
                            .slice(0, 5);
                        set({ trending: sorted });
                    }

                    set({ lastFetched: Date.now() });
                } catch (error) {
                    console.error('Failed to fetch news data:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            // Clear cache
            clearCache: () => set({
                articles: [],
                videos: [],
                trending: [],
                events: [],
                lastFetched: null
            })
        }),
        {
            name: 'news-storage',
            partialize: (state) => ({
                articles: state.articles,
                videos: state.videos,
                trending: state.trending,
                events: state.events,
                lastFetched: state.lastFetched
            })
        }
    )
);
