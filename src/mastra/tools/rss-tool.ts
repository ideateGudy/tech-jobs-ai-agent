import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { rssFeeds } from '../data/rss-feeds.js';
import { extractKeywords } from '../utils/keyword-extractor.js';
import { fetchFeedWithCache, deduplicateJobs } from '../utils/feed-cache.ts';


const jobListingSchema = z.object({
  title: z.string(),
  link: z.string(),
  description: z.string(),
  pubDate: z.string().optional(),
  source: z.string(),
});

export const rssTool = createTool({
  id: 'fetch-jobs',
  description: 'Fetches remote and tech job postings from RSS feeds and filters by keywords',
  inputSchema: z.object({
    query: z.string().describe('User query to search for jobs (e.g., "Flutter developer" or "backend roles")'),
    limit: z.number().default(10).describe('Maximum number of job results to return'),
  }),
  outputSchema: z.object({
    jobs: z.array(jobListingSchema),
    total: z.number(),
    query: z.string(),
  }),
  execute: async ({ context }) => {
    const { query, limit } = context;
    const keywords = extractKeywords(query);
    
    console.log(`\n🔍 RSS Tool Execution`);
    console.log(`   Query: "${query}"`);
    console.log(`   Limit: ${limit}`);
    console.log(`   Extracted keywords: [${keywords.join(', ')}]`);
    
    if (keywords.length === 0) {
      console.log(`   ⚠️ No keywords extracted from query!`);
      return {
        jobs: [],
        total: 0,
        query,
      };
    }

    let allJobs: Array<{ title: string; link: string; description: string; pubDate: string | undefined; source: string }> = [];

    console.log(`   📡 Loading ${rssFeeds.length} feeds from cache...`);
    // Fetch from cache (no more live fetching in execute)
    for (const feedUrl of rssFeeds) {
      try {
        const feedJobs = await fetchFeedWithCache(feedUrl);
        console.log(`      ✅ ${feedUrl}: ${feedJobs.length} jobs`);
        allJobs = allJobs.concat(feedJobs);
      } catch (error) {
        console.error(`      ❌ Error loading ${feedUrl}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    console.log(`   📊 Total jobs from all feeds: ${allJobs.length}`);


    // Deduplicate by URL
    const uniqueJobs = deduplicateJobs(allJobs);
    console.log(`   🔗 After deduplication: ${uniqueJobs.length} unique jobs`);

    // Filter by keywords
    const matchedJobs = uniqueJobs.filter(job => {
      const title = (job.title || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      
      const titleMatches = keywords.filter(kw => title.includes(kw)).length;
      const descMatches = keywords.filter(kw => description.includes(kw)).length;
      
      return (titleMatches + descMatches) > 0;
    });
    
    console.log(`   🎯 After keyword filter: ${matchedJobs.length} matched jobs`);


    // Score jobs by relevance: prefer title matches > description matches
    const scoredJobs = matchedJobs.map(job => {
      const title = (job.title || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      
      // Count keyword matches (case-insensitive)
      const titleMatches = keywords.filter(kw => title.includes(kw)).length;
      const descMatches = keywords.filter(kw => description.includes(kw)).length;
      
      // Score: title matches count 2x, description matches count 1x
      const relevanceScore = (titleMatches * 2) + descMatches;
      
      return {
        ...job,
        relevanceScore,
        titleMatches,
        descMatches,
      };
    });

    // Sort by: relevance (high to low), then by date (newest first)
    const sortedJobs = scoredJobs
      .sort((a, b) => {
        // Primary sort: by relevance score (descending)
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Secondary sort: by date (newest first)
        const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit)
      .map(({ relevanceScore, titleMatches, descMatches, ...job }) => job); // Remove scoring fields

    console.log(`   ✨ Final results: ${sortedJobs.length} jobs returned (limit: ${limit})`);
    console.log(`✅ RSS Tool complete\n`);
    return {
      jobs: sortedJobs,
      total: sortedJobs.length,
      query,
    };
  },
});
