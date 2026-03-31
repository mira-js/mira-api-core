import type { ResearchJobInput } from '@mia/shared-core';
export declare const orchestrator: {
    enqueue(input: ResearchJobInput): Promise<{
        id: string;
    }>;
    getJob(jobId: string): Promise<{
        jobId: string;
        status: JobStatus;
        query: any;
        sources: any;
        depth: any;
        createdAt: string;
        result: any;
    } | null>;
    listJobs(): Promise<{
        jobId: string;
        query: any;
        status: JobStatus;
    }[]>;
};
//# sourceMappingURL=orchestrator.d.ts.map