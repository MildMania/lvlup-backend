#!/usr/bin/env node

/**
 * Diagnostic Script: Track AD_IMPRESSION Duplicates in Real-Time
 * 
 * This script:
 * 1. Monitors the revenue table for duplicate AD_IMPRESSION records
 * 2. Tracks when the same ad impression is inserted multiple times
 * 3. Shows the time gap between duplicates (to understand retry pattern)
 * 4. Reveals if it's client-side or server-side duplication
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DuplicateGroup {
  userId: string;
  timestamp: Date;
  adImpressionId: string | null;
  count: number;
  firstServerTime: Date;
  lastServerTime: Date;
  timeBetweenFirstAndLast: number;
  avgTimeBetween: number;
  recordIds: string[];
}

async function analyzeAdImpressionDuplicates() {
  console.log('\n🔍 ANALYZING AD_IMPRESSION DUPLICATES\n');
  console.log('=' .repeat(80));

  try {
    // Get all duplicate AD_IMPRESSION groups
    const duplicates = await prisma.$queryRaw<any[]>`
      SELECT 
        "userId",
        "timestamp",
        "adImpressionId",
        "revenueUSD",
        "adNetworkName",
        "adFormat",
        "adPlacement",
        COUNT(*) as duplicate_count,
        MIN("serverReceivedAt") as first_server_time,
        MAX("serverReceivedAt") as last_server_time,
        STRING_AGG("id", ',') as record_ids
      FROM revenue
      WHERE "revenueType" = 'AD_IMPRESSION'
      GROUP BY "userId", "timestamp", "adImpressionId", "revenueUSD", "adNetworkName", "adFormat", "adPlacement"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `;

    if (!duplicates || duplicates.length === 0) {
      console.log('✅ No duplicate AD_IMPRESSION records found!\n');
      return;
    }

    console.log(`\n🔴 Found ${duplicates.length} duplicate AD_IMPRESSION groups\n`);

    // Analyze each duplicate group
    let totalDuplicateRecords = 0;
    const criticalGroups: DuplicateGroup[] = [];

    for (const dup of duplicates) {
      const count = parseInt(dup.duplicate_count);
      totalDuplicateRecords += count;
      const timeDiff = dup.last_server_time.getTime() - dup.first_server_time.getTime();
      const avgTime = timeDiff / (count - 1);

      criticalGroups.push({
        userId: dup.userId,
        timestamp: dup.timestamp,
        adImpressionId: dup.adImpressionId,
        count,
        firstServerTime: dup.first_server_time,
        lastServerTime: dup.last_server_time,
        timeBetweenFirstAndLast: timeDiff,
        avgTimeBetween: avgTime,
        recordIds: dup.record_ids.split(','),
      });

      console.log(`\n📊 DUPLICATE GROUP #${duplicates.indexOf(dup) + 1}`);
      console.log('─'.repeat(80));
      console.log(`  User ID:              ${dup.userId}`);
      console.log(`  Event Timestamp:      ${dup.timestamp}`);
      console.log(`  Ad Network:           ${dup.adNetworkName || 'N/A'}`);
      console.log(`  Ad Format:            ${dup.adFormat || 'N/A'}`);
      console.log(`  Ad Placement:         ${dup.adPlacement || 'N/A'}`);
      console.log(`  Revenue USD:          $${dup.revenueUSD}`);
      console.log(`  Ad Impression ID:     ${dup.adImpressionId || 'NULL ⚠️'}`);
      console.log(`\n  DUPLICATION STATS:`);
      console.log(`  Duplicate Count:      ${count}x`);
      console.log(`  First Inserted:       ${dup.first_server_time.toISOString()}`);
      console.log(`  Last Inserted:        ${dup.last_server_time.toISOString()}`);
      console.log(`  Time Span:            ${timeDiff}ms (${(timeDiff / 1000).toFixed(2)}s)`);
      console.log(`  Avg Time Between:     ${avgTime.toFixed(2)}ms`);
      console.log(`  Record IDs:           ${dup.record_ids.substring(0, 100)}${dup.record_ids.length > 100 ? '...' : ''}`);

      // Interpretation
      if (avgTime < 100) {
        console.log(`  ⚠️  INTERPRETATION:    Rapid-fire insertions (< 100ms apart)`);
        console.log(`      → Likely: Batch flush retrying immediately`);
        console.log(`      → Root: Batch writer flush failing and retrying`);
      } else if (avgTime < 5000) {
        console.log(`  ⚠️  INTERPRETATION:    Fast retries (< 5s apart)`);
        console.log(`      → Likely: Client retrying after backend error`);
        console.log(`      → Root: Backend returning success but data not actually saved`);
      } else if (avgTime < 60000) {
        console.log(`  ⚠️  INTERPRETATION:    Moderate retries (1-60s apart)`);
        console.log(`      → Likely: Client application error handling`);
        console.log(`      → Root: User app retrying manually or after timeout`);
      } else {
        console.log(`  ⚠️  INTERPRETATION:    Delayed retries (> 1 minute)`);
        console.log(`      → Likely: Persisted queue replay (offline buffer)`);
        console.log(`      → Root: Event queued offline, replayed later`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📈 SUMMARY');
    console.log('─'.repeat(80));
    console.log(`Total Duplicate Groups:   ${duplicates.length}`);
    console.log(`Total Duplicate Records:  ${totalDuplicateRecords}`);
    if (criticalGroups.length > 0) {
      const mostDup = criticalGroups[0]!;
      console.log(`Most Duplicated:          ${mostDup.count}x (${mostDup.userId})`);
    }

    // Find patterns
    const rapidFire = criticalGroups.filter(g => g.avgTimeBetween < 100);
    const fastRetry = criticalGroups.filter(g => g.avgTimeBetween >= 100 && g.avgTimeBetween < 5000);
    const moderateRetry = criticalGroups.filter(g => g.avgTimeBetween >= 5000 && g.avgTimeBetween < 60000);
    const delayedRetry = criticalGroups.filter(g => g.avgTimeBetween >= 60000);

    console.log(`\n🔴 Pattern Analysis:`);
    console.log(`  Rapid-fire (<100ms):     ${rapidFire.length} groups (${rapidFire.reduce((s, g) => s + g.count, 0)} records)`);
    console.log(`  Fast retry (100ms-5s):   ${fastRetry.length} groups (${fastRetry.reduce((s, g) => s + g.count, 0)} records)`);
    console.log(`  Moderate retry (5s-1m):  ${moderateRetry.length} groups (${moderateRetry.reduce((s, g) => s + g.count, 0)} records)`);
    console.log(`  Delayed retry (>1m):     ${delayedRetry.length} groups (${delayedRetry.reduce((s, g) => s + g.count, 0)} records)`);

    // Recommendations
    console.log(`\n💡 Root Cause Analysis:`);
    if (rapidFire.length > 0) {
      console.log(`  ✗ Rapid-fire duplicates detected!`);
      console.log(`    → Issue is in BATCH WRITER (server-side)`);
      console.log(`    → Batch writer is retrying immediately without success`);
      console.log(`    → Check: RevenueBatchWriter.ts flush() error handling`);
      console.log(`    → Check: Prisma createMany() is failing silently`);
    }

    if (fastRetry.length > 0) {
      console.log(`  ✗ Fast retries detected!`);
      console.log(`    → Issue is likely CLIENT-SIDE with SERVER-SIDE confirmation`);
      console.log(`    → Client retrying after backend error response`);
      console.log(`    → Check: Backend /analytics/revenue endpoint error handling`);
      console.log(`    → Check: Client RevenueTrackingService retry logic`);
    }

    if (delayedRetry.length > 0) {
      console.log(`  ✗ Delayed retries detected!`);
      console.log(`    → Issue is OFFLINE BUFFER replay`);
      console.log(`    → Events were queued during offline, replayed later`);
      console.log(`    → Check: Client offline persistence mechanism`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('Error analyzing duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run analysis
analyzeAdImpressionDuplicates().catch(console.error);

