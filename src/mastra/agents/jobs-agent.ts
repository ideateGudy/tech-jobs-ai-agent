import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { rssTool } from '../tools/rss-tool.js';
import { scorers } from '../scorers/jobs-scorer.js';

// An AI agent that fetches the most recent remote or tech-related job postings from free public rss feeds. Users can query it like: Find 5 latest Flutter jobs or Show backend developer roles.
export const jobsAgent = new Agent({
  name: 'Jobs Agent',
  description: "Fetches recent remote and tech-related job listings from public RSS feeds",
  instructions: `
You are a jobs search assistant. Your job is to find job postings matching user queries.

STRICT REQUIREMENTS:
1. ALWAYS use the fetch-jobs tool to search for jobs
2. Extract the technology/role keywords from the user query
3. Call fetch-jobs tool with:
   - query: The exact technology/role (e.g., "flutter", "react developer", "python backend")
   - limit: Number of results requested by user (default 10)
4. Display ONLY the jobs returned by the tool
5. If the tool returns 0 jobs, clearly state no matching jobs were found
6. Format each job with: Title, Company, Location, Description, Posted Date

CRITICAL: If results don't match the query (e.g., showing "QA Engineer" for "flutter"), 
that means no matching jobs were found - say so clearly. Never show unrelated jobs.

Example:
- User: "I want latest 2 flutter jobs"
- You: Call fetch-jobs(query="flutter", limit=2)
- If returns: [Flutter Dev, Flutter Engineer] → Show both
- If returns: [] → Say "No Flutter jobs found in feeds"
- Never: Show QA jobs when user asked for Flutter jobs
  `,

  model: 'openai/gpt-4o-mini',
  tools: { rssTool },
  scorers: {
    jobsQuality: {
      scorer: scorers.jobsScorer,
      sampling: {
        type: 'ratio',
        rate: 1,
      },
    },
    keywordRelevance: {
      scorer: scorers.keywordRelevanceScorer,
      sampling: {
        type: 'ratio',
        rate: 1,
      },
    },
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});