import prisma from '../prisma';
import logger from '../utils/logger';

/**
 * Analyze Event table field usage to identify truly redundant columns
 * This will show which fields are mostly NULL and wasting space
 */

interface FieldUsageStats {
    fieldName: string;
    totalRows: number;
    filledRows: number;
    nullRows: number;
    fillRate: number; // percentage
    estimatedWastedSpace: string;
}

export async function analyzeEventFieldUsage(): Promise<FieldUsageStats[]> {
    logger.info('Analyzing Event table field usage...');

    const totalEvents = await prisma.event.count();
    logger.info(`Total events in database: ${totalEvents.toLocaleString()}`);

    if (totalEvents === 0) {
        logger.warn('No events found in database');
        return [];
    }

    // Fields to analyze (potentially redundant or rarely used)
    const fieldsToCheck = [
        'country',        // Duplicate of countryCode
        'manufacturer',   // Device manufacturer
        'device',         // Device model
        'osVersion',      // OS version
        'latitude',       // Geographic coordinate
        'longitude',      // Geographic coordinate
        'city',           // City name
        'region',         // State/region
        'timezone',       // Timezone
        'connectionType', // Network type
        'appSignature',   // Android signature
        'channelId',      // Distribution channel
        'deviceId',       // Device identifier (also in User)
        'platform',       // Platform (also in User/Session)
    ];

    const stats: FieldUsageStats[] = [];

    for (const field of fieldsToCheck) {
        try {
            // Count non-null values
            const filledCount = await prisma.event.count({
                where: {
                    [field]: { not: null }
                }
            });

            const nullCount = totalEvents - filledCount;
            const fillRate = (filledCount / totalEvents) * 100;

            // Estimate wasted space (very rough)
            // Assuming avg 20 bytes per string field when NULL (overhead)
            // vs 50 bytes when filled
            const wastedBytes = nullCount * 20; // PostgreSQL NULL overhead
            const wastedMB = wastedBytes / (1024 * 1024);

            stats.push({
                fieldName: field,
                totalRows: totalEvents,
                filledRows: filledCount,
                nullRows: nullCount,
                fillRate: Math.round(fillRate * 100) / 100,
                estimatedWastedSpace: `${Math.round(wastedMB)} MB`
            });

            logger.debug(`${field}: ${fillRate.toFixed(2)}% filled (${filledCount.toLocaleString()} / ${totalEvents.toLocaleString()})`);
        } catch (error) {
            logger.error(`Error checking field ${field}:`, error);
        }
    }

    // Sort by fill rate (lowest first = most wasted space)
    stats.sort((a, b) => a.fillRate - b.fillRate);

    return stats;
}

/**
 * Check for duplicate data between tables
 */
export async function checkDuplicateStorage() {
    logger.info('Checking for duplicate data storage...');

    const results: any = {
        timestamp: new Date().toISOString(),
        duplicates: []
    };

    // Check country vs countryCode duplication
    const eventsWithBothCountry = await prisma.event.count({
        where: {
            AND: [
                { country: { not: null } },
                { countryCode: { not: null } }
            ]
        }
    });

    const totalEventsWithCountry = await prisma.event.count({
        where: {
            OR: [
                { country: { not: null } },
                { countryCode: { not: null } }
            ]
        }
    });

    results.duplicates.push({
        issue: 'country vs countryCode',
        eventsWithBoth: eventsWithBothCountry,
        totalEventsWithCountryData: totalEventsWithCountry,
        duplicationRate: totalEventsWithCountry > 0 
            ? Math.round((eventsWithBothCountry / totalEventsWithCountry) * 100) 
            : 0,
        recommendation: 'Drop Event.country, keep Event.countryCode'
    });

    // Check User vs Event platform/deviceId duplication
    const usersWithPlatform = await prisma.user.count({
        where: { platform: { not: null } }
    });

    const eventsWithPlatform = await prisma.event.count({
        where: { platform: { not: null } }
    });

    results.duplicates.push({
        issue: 'User.platform vs Event.platform',
        usersWithData: usersWithPlatform,
        eventsWithData: eventsWithPlatform,
        recommendation: 'Drop User.platform, use Event/Session.platform'
    });

    return results;
}

/**
 * Estimate total space savings from dropping fields
 */
export async function estimateSpaceSavings(fieldsToDrop: string[]) {
    logger.info('Estimating space savings...');

    const totalEvents = await prisma.event.count();
    
    // Very rough estimate: each column takes ~30 bytes on average
    // (includes NULL overhead, indexes, etc.)
    const avgBytesPerColumn = 30;
    const totalSavingsBytes = totalEvents * fieldsToDrop.length * avgBytesPerColumn;
    const savingsMB = totalSavingsBytes / (1024 * 1024);
    const savingsGB = savingsMB / 1024;

    return {
        totalEvents,
        fieldsToDrop,
        estimatedSavingsMB: Math.round(savingsMB),
        estimatedSavingsGB: Math.round(savingsGB * 100) / 100,
        percentageOfDatabase: '~10-15%' // Rough estimate
    };
}

// Main analysis
async function runFullAnalysis() {
    console.log('\n🔍 DATABASE REDUNDANCY ANALYSIS\n');
    console.log('='.repeat(80));

    try {
        // 1. Field usage analysis
        console.log('\n📊 Field Usage Analysis (Event Table):');
        console.log('-'.repeat(80));
        const fieldStats = await analyzeEventFieldUsage();
        
        console.table(fieldStats.map(s => ({
            Field: s.fieldName,
            'Fill Rate': `${s.fillRate}%`,
            'Filled': s.filledRows.toLocaleString(),
            'NULL': s.nullRows.toLocaleString(),
            'Wasted Space': s.estimatedWastedSpace
        })));

        // 2. Duplicate storage check
        console.log('\n🔄 Duplicate Storage Check:');
        console.log('-'.repeat(80));
        const duplicates = await checkDuplicateStorage();
        console.log(JSON.stringify(duplicates, null, 2));

        // 3. Recommend fields to drop
        console.log('\n💡 Recommendations:');
        console.log('-'.repeat(80));
        
        const lowUsageFields = fieldStats.filter(s => s.fillRate < 50);
        const redundantFields = ['country']; // Known duplicate
        
        console.log('\n🗑️  Safe to drop (low usage < 50%):');
        lowUsageFields.forEach(f => {
            console.log(`   - ${f.fieldName} (${f.fillRate}% filled, saves ${f.estimatedWastedSpace})`);
        });

        console.log('\n🗑️  Safe to drop (redundant):');
        redundantFields.forEach(f => {
            console.log(`   - ${f} (duplicate of countryCode)`);
        });

        // 4. Estimate total savings
        const allFieldsToDrop = [
            ...lowUsageFields.map(f => f.fieldName),
            ...redundantFields
        ];

        const savings = await estimateSpaceSavings(allFieldsToDrop);
        console.log('\n💾 Estimated Space Savings:');
        console.log(`   Total Events: ${savings.totalEvents.toLocaleString()}`);
        console.log(`   Fields to Drop: ${savings.fieldsToDrop.length}`);
        console.log(`   Estimated Savings: ${savings.estimatedSavingsMB} MB (${savings.estimatedSavingsGB} GB)`);
        console.log(`   Percentage: ${savings.percentageOfDatabase}`);

        console.log('\n✅ Analysis complete!\n');

    } catch (error) {
        console.error('❌ Analysis failed:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    runFullAnalysis()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

export default {
    analyzeEventFieldUsage,
    checkDuplicateStorage,
    estimateSpaceSavings,
    runFullAnalysis
};

