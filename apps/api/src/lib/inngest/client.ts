/**
 * Inngest client configuration
 */
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'leadgen-findr',
  eventKey: process.env.INNGEST_EVENT_KEY || 'dev-key',
});
