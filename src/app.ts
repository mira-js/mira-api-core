import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { researchRoutes } from './routes/research.js'
import type { AppEnv } from './types.js'

export const app = new Hono<AppEnv>()

if (process.env.NODE_ENV !== 'test') {
  app.use('*', logger())
}

app.use('*', cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
  credentials: true,
}))

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.route('/api/v1/research', researchRoutes)
