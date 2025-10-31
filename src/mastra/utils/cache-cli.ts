#!/usr/bin/env node
/**
 * Jobs Cache Management CLI
 * Usage:
 *   npx ts-node src/utils/cache-cli.ts status
 *   npx ts-node src/utils/cache-cli.ts refresh
 *   npx ts-node src/utils/cache-cli.ts clear
 */

import { Command } from 'commander';
import { refreshAllFeeds, startFeedScheduler, stopFeedScheduler, isSchedulerRunning } from './feed-scheduler.js';
import { clearCache, getCacheStats } from './feed-cache.js';

const program = new Command();

program.version('1.0.0').description('Jobs cache management CLI');

// Status command
program
  .command('status')
  .description('Show cache status and stats')
  .action(async () => {
    
    const stats = await getCacheStats();
    
    process.exit(0);
  });

// Refresh command
program
  .command('refresh')
  .description('Manually refresh all feeds')
  .action(async () => {
    const result = await refreshAllFeeds();
    process.exit(0);
  });

// Clear command
program
  .command('clear')
  .description('Clear all cache files')
  .action(async () => {
    await clearCache();
    process.exit(0);
  });

// Start scheduler command
program
  .command('scheduler-start [minutes]')
  .description('Start the feed scheduler (default: 30 minutes)')
  .action((minutes: string) => {
    const intervalMinutes = parseInt(minutes) || 30;
    startFeedScheduler(intervalMinutes);
    
    // Keep process alive
    setInterval(() => {
      // noop
    }, 60000);
  });

// Stop scheduler command
program
  .command('scheduler-stop')
  .description('Stop the feed scheduler')
  .action(() => {
    stopFeedScheduler();
    process.exit(0);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}
