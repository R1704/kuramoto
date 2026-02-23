export function createElementAccessor() {
    const cache = new Map();

    const getEl = (id) => {
        if (!id) return null;
        const cached = cache.get(id);
        if (cached && cached.isConnected) return cached;
        const el = document.getElementById(id);
        if (el) cache.set(id, el);
        return el;
    };

    const clearElementCache = () => {
        cache.clear();
    };

    return { getEl, clearElementCache };
}
