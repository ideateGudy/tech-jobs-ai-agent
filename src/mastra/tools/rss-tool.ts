import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { parseFeed } from '@rowanmanning/feed-parser';
import { rssFeeds } from '../data/rss-feeds.js';
import { extractKeywords } from '../../utils/keyword-extractor.js';

console.log('Using RSS Tool from src/mastra/tools/rss-tool.ts');

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
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 RSS Tool Called:`);
    console.log(`   Query: "${query}"`);
    console.log(`   Extracted keywords: ${JSON.stringify(keywords)}`);
    console.log(`   Limit: ${limit}`);
    
    if (keywords.length === 0) {
      console.log(`❌ No keywords extracted (all stopwords?)`);
      return {
        jobs: [],
        total: 0,
        query,
      };
    }

    const allJobs: z.infer<typeof jobListingSchema>[] = [];

    // Fetch and parse each RSS feed
    for (const feedUrl of rssFeeds) {
      try {
        console.log(`\n📡 Fetching: ${feedUrl}`);
        const response = await axios.get(feedUrl, {
          timeout: 5000,
        });

        const feed = await parseFeed(response.data);
        console.log(`   ✓ Got ${feed.items?.length || 0} items from feed`);

        // Extract items from feed
        if (feed.items && Array.isArray(feed.items)) {
          let feedMatches = 0;
          for (const item of feed.items) {
            const title = (item.title || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const fullText = `${title} ${description}`;

            // Check if any keyword matches in title (higher priority) or description
            const titleMatches = keywords.filter(keyword => title.includes(keyword));
            const descriptionMatches = keywords.filter(keyword => description.includes(keyword));
            const totalMatches = titleMatches.length + descriptionMatches.length;

            // Include if at least one keyword matches
            if (totalMatches > 0) {
              feedMatches++;
              console.log(`   ✅ Match #${feedMatches}: "${title.substring(0, 60)}..." (${titleMatches.length} in title, ${descriptionMatches.length} in desc)`);
              allJobs.push({
                title: item.title || 'No title',
                link: item.url || '',
                description: item.description?.substring(0, 300) || 'No description',
                pubDate: item.published ? item.published.toISOString() : undefined,
                source: feedUrl,
              });
            }
          }
          console.log(`   Found ${feedMatches} matches in this feed`);
        }
      } catch (error) {
        console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with next feed on error
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total jobs found: ${allJobs.length}`);
    console.log(`   Limit requested: ${limit}`);
    
    // Score jobs by relevance: prefer title matches > description matches
    const scoredJobs = allJobs.map(job => {
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

    console.log(`   Returning: ${sortedJobs.length} results (sorted by relevance, then date)`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      jobs: sortedJobs,
      total: sortedJobs.length,
      query,
    };
  },
});
