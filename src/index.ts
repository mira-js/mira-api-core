import 'dotenv/config'
import { serve } from '@hono/node-server'
import { app } from './app.js'
import { startWorker } from './worker.js'

const port = Number(process.env.PORT) || 3000

startWorker()

serve({ fetch: app.fetch, port }, () =>
  console.log(`MIRA running on http://localhost:${port}`),
)
