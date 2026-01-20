/**
 * Simple in-memory cache utility
 * For production with multiple server instances, consider Redis/Upstash
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class SimpleCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Clean up expired entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    /**
     * Get cached data if it exists and hasn't expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set cache entry with TTL in seconds
     */
    set<T>(key: string, data: T, ttlSeconds: number): void {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { data, expiresAt });
    }

    /**
     * Delete a specific cache entry
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Delete cache entries matching a pattern (prefix)
     */
    deletePattern(pattern: string): void {
        const keys = Array.from(this.cache.keys());
        keys.forEach(key => {
            if (key.startsWith(pattern)) {
                this.cache.delete(key);
            }
        });
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        const keys = Array.from(this.cache.keys());
        
        keys.forEach(key => {
            const entry = this.cache.get(key);
            if (entry && now > entry.expiresAt) {
                this.cache.delete(key);
            }
        });
    }

    /**
     * Cleanup on shutdown
     */
    destroy(): void {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
    }
}

// Singleton instance
export const cache = new SimpleCache();

// Helper function to generate cache keys
export const generateCacheKey = (...parts: (string | number | boolean | undefined)[]): string => {
    return parts.filter(p => p !== undefined).join(':');
};

