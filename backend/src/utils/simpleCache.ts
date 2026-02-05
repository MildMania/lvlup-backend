/**
 * Simple in-memory cache utility
 * For production with multiple server instances, consider Redis/Upstash
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
    sizeBytes: number;
}

class SimpleCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private cleanupInterval: NodeJS.Timeout;
    private totalBytes: number = 0;
    private maxEntries: number;
    private maxBytes: number | null;

    constructor() {
        this.maxEntries = parseInt(process.env.SIMPLE_CACHE_MAX_ENTRIES || '500', 10);
        const maxBytesEnv = process.env.SIMPLE_CACHE_MAX_BYTES;
        this.maxBytes = maxBytesEnv ? parseInt(maxBytesEnv, 10) : null;

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
            this.removeEntry(key, entry);
            return null;
        }

        // Mark as recently used (LRU)
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.data as T;
    }

    /**
     * Set cache entry with TTL in seconds
     */
    set<T>(key: string, data: T, ttlSeconds: number): void {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        const sizeBytes = this.estimateSizeBytes(data);

        const existing = this.cache.get(key);
        if (existing) {
            this.totalBytes -= existing.sizeBytes;
            this.cache.delete(key);
        }

        this.cache.set(key, { data, expiresAt, sizeBytes });
        this.totalBytes += sizeBytes;

        this.evictIfNeeded();
    }

    /**
     * Delete a specific cache entry
     */
    delete(key: string): void {
        const entry = this.cache.get(key);
        if (!entry) return;
        this.removeEntry(key, entry);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.totalBytes = 0;
    }

    /**
     * Delete cache entries matching a pattern (prefix)
     */
    deletePattern(pattern: string): void {
        const keys = Array.from(this.cache.keys());
        keys.forEach(key => {
            if (key.startsWith(pattern)) {
                const entry = this.cache.get(key);
                if (entry) {
                    this.removeEntry(key, entry);
                }
            }
        });
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[]; totalBytes: number; maxEntries: number; maxBytes: number | null } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            totalBytes: this.totalBytes,
            maxEntries: this.maxEntries,
            maxBytes: this.maxBytes
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
                this.removeEntry(key, entry);
            }
        });
    }

    private estimateSizeBytes(data: unknown): number {
        try {
            return Buffer.byteLength(JSON.stringify(data), 'utf8');
        } catch {
            return 0;
        }
    }

    private evictIfNeeded(): void {
        while (this.cache.size > this.maxEntries) {
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (!oldestKey) break;
            const entry = this.cache.get(oldestKey);
            if (entry) {
                this.removeEntry(oldestKey, entry);
            } else {
                this.cache.delete(oldestKey);
            }
        }

        if (this.maxBytes !== null) {
            while (this.totalBytes > this.maxBytes) {
                const oldestKey = this.cache.keys().next().value as string | undefined;
                if (!oldestKey) break;
                const entry = this.cache.get(oldestKey);
                if (entry) {
                    this.removeEntry(oldestKey, entry);
                } else {
                    this.cache.delete(oldestKey);
                }
            }
        }
    }

    private removeEntry(key: string, entry: CacheEntry<any>): void {
        this.cache.delete(key);
        this.totalBytes -= entry.sizeBytes;
        if (this.totalBytes < 0) {
            this.totalBytes = 0;
        }
    }

    /**
     * Cleanup on shutdown
     */
    destroy(): void {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
        this.totalBytes = 0;
    }
}

// Singleton instance
export const cache = new SimpleCache();

// Helper function to generate cache keys
export const generateCacheKey = (...parts: (string | number | boolean | undefined)[]): string => {
    return parts.filter(p => p !== undefined).join(':');
};
