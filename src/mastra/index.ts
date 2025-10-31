
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow.js';
import { jobsWorkflow } from './workflows/jobs-workflow.js';
import { weatherAgent } from './agents/weather-agent.js';
import { jobsAgent } from './agents/jobs-agent.js';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer.js';
import { a2aAgentRoute } from './routes/a2a-agent-route.js';
import { startFeedScheduler } from './utils/feed-scheduler.ts';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, jobsWorkflow },
  agents: { weatherAgent, jobsAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false, 
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true }, 
  },
  bundler: {
    externals: ['axios', '@rowanmanning/feed-parser', 'node-cron'],
  },
  server: {
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
    apiRoutes: [a2aAgentRoute]
  }
});

// Register A2A route

// Start the feed scheduler on initialization
// Refreshes all feeds every 30 minutes
startFeedScheduler(30);
