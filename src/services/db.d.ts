import type { Result } from '@mia/shared-core';
export declare function query<T extends object>(text: string, params?: unknown[]): Promise<Result<T[]>>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=db.d.ts.map