import { serve } from 'inngest/node';
import { inngest } from './inngest.js';
import { auditRun } from './functions/audit-run.js';

// HTTP handler for Inngest — mount at POST /api/inngest in the web app or standalone server.
export const handler = serve({ client: inngest, functions: [auditRun] });
