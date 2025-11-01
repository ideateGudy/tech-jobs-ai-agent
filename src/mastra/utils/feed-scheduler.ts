import cron from 'node-cron';
import { rssFeeds } from '../data/rss-feeds.js';
import { fetchFeedWithCache } from './feed-cache.js';

let isSchedulerActive = false;

/**
 * Schedule periodic feed fetching
 * Runs every 30 minutes by default
 */
export function startFeedScheduler(intervalMinutes: number = 30): void {
  if (isSchedulerActive) {
    return;
  }

  
  // Cron expression: every N minutes
  // Format: minute hour day month dayOfWeek
  // */30 * * * * = every 30 minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpression, async () => {
    await refreshAllFeeds();
  });

  isSchedulerActive = true;

  // Also do an initial refresh
  refreshAllFeeds().catch(err => console.error('Initial refresh failed:', err));
}

/**
 * Manually refresh all feeds
 */
export async function refreshAllFeeds(): Promise<{ refreshed: number; failed: number }> {
  let refreshed = 0;
  let failed = 0;


  // Fetch feeds in parallel with concurrency limit (5 at a time)
  const batchSize = 5;
  for (let i = 0; i < rssFeeds.length; i += batchSize) {
    const batch = rssFeeds.slice(i, i + batchSize);
    
    const results = await Promise.allSettled(
      batch.map((feedUrl: string) => fetchFeedWithCache(feedUrl))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        refreshed++;
      } else {
        failed++;
        console.error(`   ❌ Refresh failed:`, result.reason);
      }
    }
  }

  return { refreshed, failed };
}

/**
 * Stop the scheduler
 */
export function stopFeedScheduler(): void {
  if (isSchedulerActive) {
    cron.getTasks().forEach(task => task.stop());
    isSchedulerActive = false;
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isSchedulerActive;
}
