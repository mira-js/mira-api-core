import type { CollectedItem, OpenVikingFindOptions } from '@mia/shared-core';
export declare const openVikingClient: {
    /**
     * Ingest a collected item into OpenViking's hierarchical resource store.
     * URI format: viking://resources/<source>/<subreddit|category>
     */
    addResource(item: CollectedItem): Promise<any>;
    /**
     * Semantic + structural search across all collected sources.
     */
    find(query: string, options?: Partial<OpenVikingFindOptions>): Promise<any>;
};
//# sourceMappingURL=openviking.d.ts.map