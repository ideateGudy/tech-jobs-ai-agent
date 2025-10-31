import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import { parseFeed } from '@rowanmanning/feed-parser';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'jobs');
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
// const CACHE_TTL = 4 * 60 * 1000; // 2 minutes in milliseconds

interface CachedJob {
  title: string;
  link: string;
  description: string;
  pubDate: string | undefined;
  source: string;
}

interface FeedCache {
  feedUrl: string;
  timestamp: number;
  jobs: CachedJob[];
}

/**
 * Initialize cache directory if it doesn't exist
 */
async function initCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.warn('Could not create cache directory:', error);
  }
}

/**
 * Generate a unique cache filename from feed URL
 */
function getCacheFilename(feedUrl: string): string {
  const hash = Buffer.from(feedUrl).toString('base64').replace(/[/+=]/g, '_');
  return path.join(CACHE_DIR, `${hash}.json`);
}

/**
 * Check if cache file exists and is still valid
 */
async function isCacheValid(cacheFile: string): Promise<boolean> {
  try {
    const stats = await fs.stat(cacheFile);
    const age = Date.now() - stats.mtimeMs;
    return age < CACHE_TTL;
  } catch {
    return false;
  }
}

/**
 * Load jobs from cache file
 */
async function loadFromCache(feedUrl: string): Promise<CachedJob[] | null> {
  const cacheFile = getCacheFilename(feedUrl);
  
  if (!(await isCacheValid(cacheFile))) {
    return null;
  }

  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    const cache: FeedCache = JSON.parse(data);
    const ageMinutes = Math.round((Date.now() - cache.timestamp) / 1000 / 60);
    return cache.jobs;
  } catch (error) {
    console.warn(`   ⚠️ Cache read error:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Save jobs to cache file
 */
async function saveToCache(feedUrl: string, jobs: CachedJob[]): Promise<void> {
  const cacheFile = getCacheFilename(feedUrl);
  
  try {
    const cache: FeedCache = {
      feedUrl,
      timestamp: Date.now(),
      jobs,
    };
    await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`   ⚠️ Cache write error:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Fetch and parse a single RSS feed with caching
 */
export async function fetchFeedWithCache(feedUrl: string): Promise<CachedJob[]> {
  await initCacheDir();

  // Try to load from cache first
  const cachedJobs = await loadFromCache(feedUrl);
  if (cachedJobs !== null) {
    return cachedJobs;
  }

  // If not in cache or cache expired, fetch fresh
  try {
    const response = await axios.get(feedUrl, { timeout: 8000 });
    const feed = await parseFeed(response.data);

    const jobs: CachedJob[] = [];
    if (feed.items && Array.isArray(feed.items)) {
      for (const item of feed.items) {
        jobs.push({
          title: item.title || 'No title',
          link: item.url || '',
          description: item.description?.substring(0, 500) || 'No description',
          pubDate: item.published ? item.published.toISOString() : undefined,
          source: feedUrl,
        });
      }
    }

    // Save to cache
    await saveToCache(feedUrl, jobs);
    return jobs;
  } catch (error) {
    console.error(`   ❌ URL FETCH ERROR - ${feedUrl}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Deduplicate jobs by link URL
 * Keeps the first occurrence and discards duplicates from other sources
 */
export function deduplicateJobs(allJobs: CachedJob[]): CachedJob[] {
  const seen = new Map<string, CachedJob>();
  let duplicatesFound = 0;

  for (const job of allJobs) {
    const linkKey = job.link.toLowerCase().trim();
    
    if (seen.has(linkKey)) {
      duplicatesFound++;
      continue; // Skip duplicate
    }
    
    seen.set(linkKey, job);
  }


  return Array.from(seen.values());
}

/**
 * Clear all cache files
 */
export async function clearCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    await Promise.all(
      files.map(file => fs.unlink(path.join(CACHE_DIR, file)))
    );
  } catch (error) {
    console.warn('Could not clear cache:', error);
  }
}

/**
 * Get cache stats
 */
export async function getCacheStats(): Promise<{ totalFiles: number; totalSize: number; oldestFile: string | undefined; newestFile: string | undefined }> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    let totalSize = 0;
    let oldestFile: string | undefined = undefined;
    let newestFile: string | undefined = undefined;
    let oldestTime = Infinity;
    let newestTime = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      
      if (stats.mtimeMs < oldestTime) {
        oldestTime = stats.mtimeMs;
        oldestFile = file;
      }
      
      if (stats.mtimeMs > newestTime) {
        newestTime = stats.mtimeMs;
        newestFile = file;
      }
    }

    return { totalFiles: files.length, totalSize, oldestFile, newestFile };
  } catch {
    return { totalFiles: 0, totalSize: 0, oldestFile: undefined, newestFile: undefined };
  }
}
