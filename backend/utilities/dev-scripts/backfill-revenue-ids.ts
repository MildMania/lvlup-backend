#!/usr/bin/env node

/**
 * Backfill Script: Generate Hash-Based IDs for Existing Revenue Records
 * 
 * This script backfills existing revenue records with deterministic hash-based
 * transaction IDs and ad impression IDs to enable deduplication.
 * 
 * Usage:
 *   npx ts-node scripts/backfill-revenue-ids.ts
 *   OR in production:
 *   node dist/scripts/backfill-revenue-ids.js
 * 
 * What it does:
 * 1. Finds all IN_APP_PURCHASE records with null transactionId
 * 2. Finds all AD_IMPRESSION records with null adImpressionId
 * 3. Generates deterministic SHA256 hashes based on transaction data
 * 4. Updates records with the generated IDs
 * 5. Provides detailed logging and progress reporting
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Generate deterministic transactionId for IN_APP_PURCHASE
 */
function generateTransactionId(record: {
  userId: string;
  gameId: string;
  productId?: string | null;
  store?: string | null;
  revenue: number;
  timestamp: Date;
}): string {
  const hashData = JSON.stringify({
    userId: record.userId,
    gameId: record.gameId,
    productId: record.productId || 'unknown',
    store: record.store || 'unknown',
    revenue: record.revenue,
    timestamp: record.timestamp.toISOString(),
  });

  const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 16);
  return `txn_${hash}`;
}

/**
 * Generate deterministic adImpressionId for AD_IMPRESSION
 */
function generateAdImpressionId(record: {
  userId: string;
  gameId: string;
  adNetworkName?: string | null;
  adFormat?: string | null;
  adPlacement?: string | null;
  revenue: number;
  timestamp: Date;
}): string {
  const hashData = JSON.stringify({
    userId: record.userId,
    gameId: record.gameId,
    adNetworkName: record.adNetworkName || 'unknown',
    adFormat: record.adFormat || 'unknown',
    adPlacement: record.adPlacement || 'unknown',
    revenue: record.revenue,
    timestamp: record.timestamp.toISOString(),
  });

  const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 16);
  return `ad_${hash}`;
}

async function backfillInAppPurchases() {
  log('\n📦 BACKFILLING IN_APP_PURCHASE RECORDS', 'cyan');
  log('=========================================\n', 'cyan');

  try {
    // Find all IAP records with null transactionId
    const recordsToUpdate = await prisma.revenue.findMany({
      where: {
        revenueType: 'IN_APP_PURCHASE',
        transactionId: null,
      },
      select: {
        id: true,
        userId: true,
        gameId: true,
        productId: true,
        store: true,
        revenue: true,
        timestamp: true,
      },
    });

    log(`Found ${recordsToUpdate.length} IN_APP_PURCHASE records with null transactionId`, 'yellow');

    if (recordsToUpdate.length === 0) {
      log('✅ No records to backfill', 'green');
      return 0;
    }

    // Generate and update IDs
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 100;

    for (let i = 0; i < recordsToUpdate.length; i += batchSize) {
      const batch = recordsToUpdate.slice(i, i + batchSize);
      
      for (const record of batch) {
        try {
          const transactionId = generateTransactionId(record);
          
          await prisma.revenue.update({
            where: { id: record.id },
            data: { transactionId },
          });

          successCount++;
          
          // Log progress every 50 records
          if ((successCount + errorCount) % 50 === 0) {
            log(`  Progress: ${successCount + errorCount}/${recordsToUpdate.length} records processed`, 'blue');
          }
        } catch (error: any) {
          errorCount++;
          log(`  ❌ Error updating record ${record.id}: ${error.message}`, 'red');
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < recordsToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    log(`\n✅ Updated ${successCount} IN_APP_PURCHASE records`, 'green');
    if (errorCount > 0) {
      log(`⚠️  Failed to update ${errorCount} records`, 'yellow');
    }

    return successCount;
  } catch (error: any) {
    log(`❌ Error during IN_APP_PURCHASE backfill: ${error.message}`, 'red');
    throw error;
  }
}

async function backfillAdImpressions() {
  log('\n📺 BACKFILLING AD_IMPRESSION RECORDS', 'cyan');
  log('======================================\n', 'cyan');

  try {
    // Find all AD records with null adImpressionId
    const recordsToUpdate = await prisma.revenue.findMany({
      where: {
        revenueType: 'AD_IMPRESSION',
        adImpressionId: null,
      },
      select: {
        id: true,
        userId: true,
        gameId: true,
        adNetworkName: true,
        adFormat: true,
        adPlacement: true,
        revenue: true,
        timestamp: true,
      },
    });

    log(`Found ${recordsToUpdate.length} AD_IMPRESSION records with null adImpressionId`, 'yellow');

    if (recordsToUpdate.length === 0) {
      log('✅ No records to backfill', 'green');
      return 0;
    }

    // Generate and update IDs
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 100;

    for (let i = 0; i < recordsToUpdate.length; i += batchSize) {
      const batch = recordsToUpdate.slice(i, i + batchSize);
      
      for (const record of batch) {
        try {
          const adImpressionId = generateAdImpressionId(record);
          
          await prisma.revenue.update({
            where: { id: record.id },
            data: { adImpressionId },
          });

          successCount++;
          
          // Log progress every 50 records
          if ((successCount + errorCount) % 50 === 0) {
            log(`  Progress: ${successCount + errorCount}/${recordsToUpdate.length} records processed`, 'blue');
          }
        } catch (error: any) {
          errorCount++;
          log(`  ❌ Error updating record ${record.id}: ${error.message}`, 'red');
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < recordsToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    log(`\n✅ Updated ${successCount} AD_IMPRESSION records`, 'green');
    if (errorCount > 0) {
      log(`⚠️  Failed to update ${errorCount} records`, 'yellow');
    }

    return successCount;
  } catch (error: any) {
    log(`❌ Error during AD_IMPRESSION backfill: ${error.message}`, 'red');
    throw error;
  }
}

async function verifyBackfill() {
  log('\n✓ VERIFYING BACKFILL', 'cyan');
  log('====================\n', 'cyan');

  try {
    // Check for remaining null IDs
    const nullIapCount = await prisma.revenue.count({
      where: {
        revenueType: 'IN_APP_PURCHASE',
        transactionId: null,
      },
    });

    const nullAdCount = await prisma.revenue.count({
      where: {
        revenueType: 'AD_IMPRESSION',
        adImpressionId: null,
      },
    });

    const totalIapCount = await prisma.revenue.count({
      where: { revenueType: 'IN_APP_PURCHASE' },
    });

    const totalAdCount = await prisma.revenue.count({
      where: { revenueType: 'AD_IMPRESSION' },
    });

    log(`IN_APP_PURCHASE: ${totalIapCount - nullIapCount}/${totalIapCount} have transactionId`, 'cyan');
    log(`AD_IMPRESSION:   ${totalAdCount - nullAdCount}/${totalAdCount} have adImpressionId\n`, 'cyan');

    if (nullIapCount === 0 && nullAdCount === 0) {
      log('✅ All records backfilled successfully!', 'green');
      return true;
    } else {
      log('⚠️  Some records still have null IDs:', 'yellow');
      if (nullIapCount > 0) log(`  - ${nullIapCount} IN_APP_PURCHASE records`, 'yellow');
      if (nullAdCount > 0) log(`  - ${nullAdCount} AD_IMPRESSION records`, 'yellow');
      return false;
    }
  } catch (error: any) {
    log(`❌ Error during verification: ${error.message}`, 'red');
    throw error;
  }
}

async function main() {
  log('\n🚀 REVENUE ID BACKFILL SCRIPT', 'blue');
  log('==============================\n', 'blue');
  log('This script backfills existing revenue records with deterministic hash IDs', 'cyan');
  log('to enable deduplication via unique constraints.\n', 'cyan');

  const startTime = Date.now();

  try {
    // Step 1: Backfill IN_APP_PURCHASE
    const iapCount = await backfillInAppPurchases();

    // Step 2: Backfill AD_IMPRESSION
    const adCount = await backfillAdImpressions();

    // Step 3: Verify
    const verified = await verifyBackfill();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log('\n' + '='.repeat(50), 'blue');
    log(`\n📊 SUMMARY`, 'cyan');
    log(`  IN_APP_PURCHASE records updated: ${iapCount}`, 'green');
    log(`  AD_IMPRESSION records updated:   ${adCount}`, 'green');
    log(`  Total records updated:           ${iapCount + adCount}`, 'green');
    log(`  Time elapsed:                    ${duration}s`, 'cyan');
    log(`  Status:                          ${verified ? '✅ SUCCESS' : '⚠️  WARNING'}`, verified ? 'green' : 'yellow');
    log('\n' + '='.repeat(50) + '\n', 'blue');

    process.exit(verified ? 0 : 1);
  } catch (error) {
    log('\n❌ BACKFILL FAILED', 'red');
    log(`Error: ${error}`, 'red');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

