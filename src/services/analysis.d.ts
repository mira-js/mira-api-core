import type { CollectedItem, ExtractionResult, PainPointTheme, Result } from '@mia/shared-core';
export declare function extractItem(item: CollectedItem): Promise<Result<ExtractionResult>>;
type ExtractionPair = {
    item: CollectedItem;
    extraction: ExtractionResult;
};
export declare function aggregateThemes(pairs: ExtractionPair[], options?: {
    skipEmbeddings?: boolean;
}): Promise<Result<PainPointTheme[]>>;
export declare function synthesizeReport(query: string, themes: {
    painPoints: PainPointTheme[];
    competitorWeaknesses: PainPointTheme[];
    emergingGaps: PainPointTheme[];
}): Promise<Result<string>>;
export {};
//# sourceMappingURL=analysis.d.ts.map