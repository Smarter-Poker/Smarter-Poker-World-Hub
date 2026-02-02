/**
 * Performance Optimizations for Memory Matrix
 * - Scenario caching
 * - Lazy loading
 * - Memoization
 * - Debouncing
 */

// Scenario cache to avoid re-parsing
const scenarioCache = new Map();

/**
 * Get scenario with caching
 */
export function getCachedScenario(scenarioId, scenarios) {
    if (scenarioCache.has(scenarioId)) {
        return scenarioCache.get(scenarioId);
    }

    const scenario = scenarios.find(s => s.id === scenarioId);
    if (scenario) {
        scenarioCache.set(scenarioId, scenario);
    }

    return scenario;
}

/**
 * Clear scenario cache (call when scenarios update)
 */
export function clearScenarioCache() {
    scenarioCache.clear();
}

/**
 * Preload scenarios for a level
 */
export function preloadLevelScenarios(level, scenarios) {
    const levelScenarios = scenarios.filter(s => s.level === level);
    levelScenarios.forEach(scenario => {
        scenarioCache.set(scenario.id, scenario);
    });
    return levelScenarios.length;
}

/**
 * Debounce function for performance
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function for performance
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Memoize expensive calculations
 */
export function memoize(fn) {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
}

/**
 * Calculate accuracy (memoized)
 */
export const calculateAccuracy = memoize((correct, total) => {
    if (total === 0) return 0;
    return Math.round((correct / total) * 100 * 100) / 100; // 2 decimal places
});

/**
 * Calculate score (memoized)
 */
export const calculateScore = memoize((correct, total, timeBonus, streakBonus) => {
    const baseScore = correct * 100;
    const accuracyBonus = Math.floor((correct / total) * 500);
    return baseScore + accuracyBonus + timeBonus + streakBonus;
});

/**
 * Lazy load images
 */
export function lazyLoadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Batch DOM updates
 */
export function batchDOMUpdates(updates) {
    requestAnimationFrame(() => {
        updates.forEach(update => update());
    });
}

/**
 * Optimize React re-renders with shallow comparison
 */
export function shallowEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    return keys1.every(key => obj1[key] === obj2[key]);
}

/**
 * Create optimized event handler
 */
export function createOptimizedHandler(handler, delay = 100) {
    return debounce(handler, delay);
}

/**
 * Preload critical resources
 */
export async function preloadCriticalResources() {
    const resources = [
        '/images/cards/back.png',
        '/images/table-bg.jpg'
    ];

    const promises = resources.map(src => lazyLoadImage(src));

    try {
        await Promise.all(promises);
        return { success: true };
    } catch (error) {
        console.error('[Performance] Error preloading resources:', error);
        return { success: false, error };
    }
}

/**
 * Monitor performance metrics
 */
export class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
    }

    start(label) {
        this.metrics.set(label, performance.now());
    }

    end(label) {
        const startTime = this.metrics.get(label);
        if (!startTime) {
            console.warn(`[Performance] No start time for ${label}`);
            return null;
        }

        const duration = performance.now() - startTime;
        this.metrics.delete(label);

        console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
        return duration;
    }

    measure(label, fn) {
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    async measureAsync(label, fn) {
        this.start(label);
        const result = await fn();
        this.end(label);
        return result;
    }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Optimize localStorage operations
 */
export class OptimizedStorage {
    constructor(prefix = 'mm_') {
        this.prefix = prefix;
        this.cache = new Map();
    }

    get(key) {
        const fullKey = this.prefix + key;

        // Check cache first
        if (this.cache.has(fullKey)) {
            return this.cache.get(fullKey);
        }

        // Read from localStorage
        try {
            const value = localStorage.getItem(fullKey);
            if (value) {
                const parsed = JSON.parse(value);
                this.cache.set(fullKey, parsed);
                return parsed;
            }
        } catch (error) {
            console.error('[OptimizedStorage] Error reading:', error);
        }

        return null;
    }

    set(key, value) {
        const fullKey = this.prefix + key;

        try {
            const stringified = JSON.stringify(value);
            localStorage.setItem(fullKey, stringified);
            this.cache.set(fullKey, value);
            return true;
        } catch (error) {
            console.error('[OptimizedStorage] Error writing:', error);
            return false;
        }
    }

    remove(key) {
        const fullKey = this.prefix + key;
        localStorage.removeItem(fullKey);
        this.cache.delete(fullKey);
    }

    clear() {
        // Clear all keys with our prefix
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                localStorage.removeItem(key);
            }
        });
        this.cache.clear();
    }
}

// Export singleton instance
export const optimizedStorage = new OptimizedStorage('mm_');
