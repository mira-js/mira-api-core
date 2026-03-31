"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapWithConcurrency = mapWithConcurrency;
async function mapWithConcurrency(items, concurrency, fn) {
    const limit = Math.max(1, Math.floor(concurrency));
    if (!items.length)
        return [];
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length)
                return;
            const item = items[currentIndex];
            results[currentIndex] = await fn(item, currentIndex);
        }
    }
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}
//# sourceMappingURL=concurrency.js.map