/**
 * Inngest functions registry for Findr.
 *
 * Import this into your app bootstrap to register all functions
 * with the Hono serve handler.
 */
export { handleInboundReply } from './handleInboundReply'
export { handleNotNowSnooze } from './handleNotNowSnooze'

import { serve } from 'inngest/hono'
import { Inngest } from 'inngest'
const inngest = new Inngest({ id: 'leadgen-findr' })
import { handleInboundReply } from './handleInboundReply'
import { handleNotNowSnooze } from './handleNotNowSnooze'

/**
 * All Findr Inngest functions — register with the Hono router:
 *
 *   import functions, { createInngestHandler } from './lib/inngest/functions'
 *   const handler = createInngestHandler(functions)
 *   app.all('/api/inngest', handler)
 */
export const functions = [handleInboundReply, handleNotNowSnooze]

/**
 * Returns a Hono-compatible request handler for the Inngest API.
 */
export const createInngestHandler = () => {
  return serve({
    client: inngest,
    functions,
  })
}
