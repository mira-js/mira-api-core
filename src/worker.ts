import { Worker } from 'bullmq'
import type { ResearchJobInput, ResearchResult } from '@mira/shared-core'
import { runPipeline } from './services/pipeline.js'
import { redisConnection } from './services/redis.js'

export function startWorker(): void {
  const worker = new Worker<ResearchJobInput, ResearchResult>(
    'research',
    async (job) => {
      const result = await runPipeline(job.data)
      if (!result.ok) throw result.error
      return result.value
    },
    { connection: redisConnection() },
  )

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message)
  })
}
