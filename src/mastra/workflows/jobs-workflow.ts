import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const jobSchema = z.object({
  title: z.string(),
  link: z.string(),
  description: z.string(),
  pubDate: z.string().optional(),
  source: z.string(),
});

const jobSearchResultSchema = z.object({
  jobs: z.array(jobSchema),
  total: z.number(),
  query: z.string(),
});

const searchJobs = createStep({
  id: 'search-jobs',
  description: 'Searches for job listings based on a query',
  inputSchema: z.object({
    query: z.string().describe('Job search query (e.g., "React developer", "Python jobs")'),
    limit: z.number().default(10).describe('Maximum number of results to return'),
  }),
  outputSchema: jobSearchResultSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const agent = mastra?.getAgent('jobsAgent');
    if (!agent) {
      throw new Error('Jobs agent not found');
    }

    const { query, limit } = inputData;

    // Call the jobs agent with the search query
    const response = await agent.generate(query);
    
    console.log(`\n📋 SearchJobs Step Execution`);
    console.log(`   Query: "${query}"`);
    console.log(`   Agent Response keys:`, Object.keys(response));
    console.log(`   Response:`, JSON.stringify(response, null, 2).substring(0, 500));

    // Parse the tool results from the response
    let jobs = [];
    let total = 0;

    if (response.toolResults && response.toolResults.length > 0) {
      console.log(`   📊 Found ${response.toolResults.length} tool results`);
      // Extract job results from tool output
      const toolResult = response.toolResults[0];
      console.log(`   Tool result type:`, typeof toolResult);
      
      if (typeof toolResult === 'string') {
        try {
          const parsed = JSON.parse(toolResult);
          jobs = parsed.jobs || [];
          total = parsed.total || jobs.length;
          console.log(`   ✅ Parsed string: ${jobs.length} jobs found`);
        } catch (e) {
          console.error('   ❌ Failed to parse tool results:', e);
        }
      } else if (typeof toolResult === 'object' && toolResult !== null) {
        // Check nested structure: payload.result.jobs
        let jobData = null;
        
        if ((toolResult as any).payload?.result?.jobs) {
          jobData = (toolResult as any).payload.result;
          console.log(`   ✅ Found jobs in payload.result.jobs`);
        } else if ((toolResult as any).jobs) {
          jobData = toolResult as any;
          console.log(`   ✅ Found jobs in top-level`);
        } else {
          console.log(`   ⚠️ Jobs not found in expected locations`);
          console.log(`   Tool result structure:`, JSON.stringify(toolResult, null, 2).substring(0, 500));
        }
        
        if (jobData) {
          jobs = jobData.jobs || [];
          total = jobData.total || jobs.length;
          console.log(`   ✅ Extracted: ${jobs.length} jobs found`);
        }
      }
    } else {
      console.log(`   ⚠️ No tool results found in response`);
    }

    console.log(`   ✨ Final output: ${jobs.length} jobs, limit: ${limit}\n`);

    return {
      jobs: jobs.slice(0, limit),
      total: Math.min(total, limit),
      query,
    };
  },
});

const formatJobResults = createStep({
  id: 'format-job-results',
  description: 'Formats job search results into a readable summary',
  inputSchema: jobSearchResultSchema,
  outputSchema: z.object({
    summary: z.string(),
    jobCount: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Result data not found');
    }

    const { jobs, query, total } = inputData;

    if (jobs.length === 0) {
      return {
        summary: `No jobs found matching "${query}". Try different keywords or check back later for new postings.`,
        jobCount: 0,
      };
    }

    // Format jobs into a readable summary
    const jobsFormatted = jobs
      .map((job, index) => {
        const publishedDate = job.pubDate ? new Date(job.pubDate).toLocaleDateString() : 'Unknown date';
        return `${index + 1}. ${job.title}
   Posted: ${publishedDate}
   Source: ${new URL(job.source).hostname}
   Link: ${job.link}
   Description: ${job.description.substring(0, 200)}...`;
      })
      .join('\n\n');

    const summary = `Found ${jobs.length} job(s) matching "${query}":

${jobsFormatted}

Total matches available: ${total}`;

    return {
      summary,
      jobCount: jobs.length,
    };
  },
});

const jobsWorkflow = createWorkflow({
  id: 'jobs-workflow',
  inputSchema: z.object({
    query: z.string().describe('Job search query'),
    limit: z.number().default(10).describe('Maximum number of results'),
  }),
  outputSchema: z.object({
    summary: z.string(),
    jobCount: z.number(),
  }),
})
  .then(searchJobs)
  .then(formatJobResults);

jobsWorkflow.commit();

export { jobsWorkflow };
