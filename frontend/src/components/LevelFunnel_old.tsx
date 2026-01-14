import { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import apiClient from '../lib/apiClient';
import './LevelFunnel.css';

interface LevelMetrics {
    levelId: number;
    levelName?: string;
    players: number;
    starts: number;
    completes: number;
    fails: number;
    winRate: number;
    failRate: number;
    churnStartComplete: number;
    churnCompleteNext: number;
    aps: number;
    meanCompletionDuration: number;
    meanFailDuration: number;
    boosterUsage: number;
    egpRate: number;
    customMetrics: Record<string, any>;
}

interface Filters {
    startDate?: string;
    endDate?: string;
    country?: string;
    version?: string;
    abTestId?: string;
}

export default function LevelFunnel() {
    const { currentGame } = useGame();
    const [levels, setLevels] = useState<LevelMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    console.log('LevelFunnel rendered', { currentGame, loading, error, levelsCount: levels.length });

    useEffect(() => {
        if (currentGame && currentGame.id !== 'default') {
            fetchLevelFunnelData();
        } else {
            setLoading(false);
        }
    }, [currentGame, filters]);

    const fetchLevelFunnelData = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({
                gameId: currentGame?.id || ''
            });

            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (filters.country) params.append('country', filters.country);
            if (filters.version) params.append('version', filters.version);
            if (filters.abTestId) params.append('abTestId', filters.abTestId);

            console.log('Fetching level funnel from:', `/analytics/level-funnel?${params}`);
            
            const response = await apiClient.get(`/analytics/level-funnel?${params}`);
            
            console.log('Level funnel response:', response.data);
            
            if (response.data.success) {
                const levelsData = response.data.data.levels || [];
                console.log('Levels data:', levelsData);
                setLevels(levelsData);
            } else {
                setError(response.data.error || 'Failed to load funnel data');
            }
        } catch (err: any) {
            console.error('Error fetching level funnel:', err);
            setError(err.message || 'Failed to load level funnel data');
        } finally {
            setLoading(false);
        }
    };

    const exportToCSV = () => {
        if (levels.length === 0) return;

        const headers = [
            'Level ID',
            'Level Name',
            'Players',
            'Starts',
            'Completes',
            'Fails',
            'Win Rate (%)',
            'Fail Rate (%)',
            'Churn Start-Complete (%)',
            'Churn Complete-Next (%)',
            'APS',
            'Avg Completion Time (s)',
            'Avg Fail Time (s)',
            'Booster Usage (%)',
            'EGP Rate (%)'
        ];

        const rows = levels.map(level => [
            level.levelId,
            level.levelName || '',
            level.players,
            level.starts,
            level.completes,
            level.fails,
            level.winRate.toFixed(2),
            level.failRate.toFixed(2),
            level.churnStartComplete.toFixed(2),
            level.churnCompleteNext.toFixed(2),
            level.aps.toFixed(2),
            level.meanCompletionDuration.toFixed(2),
            level.meanFailDuration.toFixed(2),
            level.boosterUsage.toFixed(2),
            level.egpRate.toFixed(2)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `level-funnel-${currentGame?.name}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (!currentGame || currentGame.id === 'default') {
        return (
            <div className="level-funnel">
                <div className="warning-message">
                    <p>Please select a game to view level funnel data.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="level-funnel">
            {/* Debug Header - Remove after testing */}
            <div className="debug-header">
                <h2>🎯 Level Funnel Component Loaded!</h2>
                <p>Game: {currentGame?.name} | Loading: {loading ? 'Yes' : 'No'} | Levels: {levels.length}</p>
            </div>

            {/* Header */}
            <div className="level-funnel-header">
                <div className="level-funnel-title">
                    <h1>Level Funnel</h1>
                    <p>Player progression and performance metrics across levels</p>
                </div>
                <button
                    onClick={exportToCSV}
                    disabled={levels.length === 0}
                    className="export-button"
                >
                    Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="level-funnel-filters">
                <div className="filters-grid">
                    <div className="filter-group">
                        <label>Start Date</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        />
                    </div>
                    <div className="filter-group">
                        <label>End Date</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        />
                    </div>
                    <div className="filter-group">
                        <label>Country</label>
                        <input
                            type="text"
                            placeholder="e.g., US, TR"
                            value={filters.country || ''}
                            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                        />
                    </div>
                    <div className="filter-group">
                        <label>App Version</label>
                        <input
                            type="text"
                            placeholder="e.g., 1.0.0"
                            value={filters.version || ''}
                            onChange={(e) => setFilters({ ...filters, version: e.target.value })}
                        />
                    </div>
                </div>
            </div>
                            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">App Version</label>
                        <input
                            type="text"
                            placeholder="e.g., 1.0.0"
                            value={filters.version || ''}
                            onChange={(e) => setFilters({ ...filters, version: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            {/* Data Table */}
            {!loading && !error && levels.length > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                                        Level
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Players
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Win Rate
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Fail Rate
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Churn (Start)
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Churn (Next)
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        APS
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Avg Time
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Booster %
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        EGP %
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {levels.map((level) => (
                                    <tr key={level.levelId} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                                            {level.levelName || `Level ${level.levelId}`}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.players.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            <span className={level.winRate >= 80 ? 'text-green-600 font-medium' : level.winRate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                                                {level.winRate.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.failRate.toFixed(1)}%
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            <span className={level.churnStartComplete >= 30 ? 'text-red-600 font-medium' : level.churnStartComplete >= 15 ? 'text-yellow-600' : 'text-green-600'}>
                                                {level.churnStartComplete.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            <span className={level.churnCompleteNext >= 30 ? 'text-red-600 font-medium' : level.churnCompleteNext >= 15 ? 'text-yellow-600' : 'text-green-600'}>
                                                {level.churnCompleteNext.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.aps.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.meanCompletionDuration.toFixed(1)}s
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.boosterUsage.toFixed(1)}%
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {level.egpRate.toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && levels.length === 0 && (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                    <div className="max-w-2xl mx-auto">
                        <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Level Data Available</h3>
                        <p className="text-gray-500 mb-4">
                            No level events found for the selected filters. This could mean:
                        </p>
                        <ul className="text-left text-gray-600 space-y-2 mb-6 max-w-md mx-auto">
                            <li className="flex items-start">
                                <span className="text-blue-500 mr-2">•</span>
                                <span>Your game hasn't sent any <code className="bg-gray-100 px-1 rounded">level_start</code>, <code className="bg-gray-100 px-1 rounded">level_complete</code>, or <code className="bg-gray-100 px-1 rounded">level_failed</code> events yet</span>
                            </li>
                            <li className="flex items-start">
                                <span className="text-blue-500 mr-2">•</span>
                                <span>The selected date range doesn't contain any level events</span>
                            </li>
                            <li className="flex items-start">
                                <span className="text-blue-500 mr-2">•</span>
                                <span>The country or version filters are excluding all data</span>
                            </li>
                        </ul>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                            <h4 className="font-semibold text-blue-900 mb-2">📝 To send level events from Unity:</h4>
                            <pre className="bg-white p-3 rounded text-sm overflow-x-auto">
{`// Level Start
LvlUpEvents.TrackLevelStart(1, "Tutorial");

// Level Complete  
LvlUpEvents.TrackLevelComplete(1, score, time);

// Level Failed
LvlUpEvents.TrackLevelFailed(1, "timeout", time);`}
                            </pre>
                        </div>
                        <p className="text-gray-400 mt-4 text-sm">
                            Try adjusting your filters or check the Events page to see what events are being tracked.
                        </p>
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            {!loading && !error && levels.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-gray-600">Total Levels</p>
                            <p className="text-2xl font-bold text-gray-900">{levels.length}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Total Players</p>
                            <p className="text-2xl font-bold text-gray-900">{levels[0]?.players.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Avg Win Rate</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {(levels.reduce((sum, l) => sum + l.winRate, 0) / levels.length).toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Avg APS</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {(levels.reduce((sum, l) => sum + l.aps, 0) / levels.length).toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

