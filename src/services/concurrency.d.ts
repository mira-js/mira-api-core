export declare function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
//# sourceMappingURL=concurrency.d.ts.map