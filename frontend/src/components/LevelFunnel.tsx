import { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import apiClient from '../lib/apiClient';
import './LevelFunnel.css';

interface LevelMetrics {
    levelId: number;
    levelName?: string;
    startedPlayers: number;
    completedPlayers: number;
    starts: number;
    completes: number;
    fails: number;
    winRate: number;
    completionRate: number;
    failRate: number;
    funnelRate: number;
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
}

interface LevelFunnelProps {
    isCollapsed?: boolean;
}

export default function LevelFunnel({ isCollapsed = false }: LevelFunnelProps) {
    const { currentGame } = useGame();
    const [levels, setLevels] = useState<LevelMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>({
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    // Multi-select filter states
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [showVersionSelector, setShowVersionSelector] = useState(false);

    // Level funnel filter state
    const [availableLevelFunnels, setAvailableLevelFunnels] = useState<{ funnel: string; version: number; label: string }[]>([]);
    const [selectedLevelFunnels, setSelectedLevelFunnels] = useState<string[]>([]);
    const [showLevelFunnelSelector, setShowLevelFunnelSelector] = useState(false);

    // Filter options from API
    const [availableCountries, setAvailableCountries] = useState<string[]>([]);
    const [availableVersions, setAvailableVersions] = useState<string[]>([]);

    // Refs for dropdowns
    const countryDropdownRef = useRef<HTMLDivElement>(null);
    const versionDropdownRef = useRef<HTMLDivElement>(null);
    const levelFunnelDropdownRef = useRef<HTMLDivElement>(null);

    console.log('LevelFunnel rendered', { currentGame, loading, error, levelsCount: levels.length });

    // Click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
                setShowCountrySelector(false);
            }
            if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
                setShowVersionSelector(false);
            }
            if (levelFunnelDropdownRef.current && !levelFunnelDropdownRef.current.contains(event.target as Node)) {
                setShowLevelFunnelSelector(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Toggle functions for multi-select
    const toggleCountry = (country: string) => {
        setSelectedCountries(prev =>
            prev.includes(country)
                ? prev.filter(c => c !== country)
                : [...prev, country]
        );
    };

    const toggleVersion = (version: string) => {
        setSelectedVersions(prev =>
            prev.includes(version)
                ? prev.filter(v => v !== version)
                : [...prev, version]
        );
    };

    const toggleLevelFunnel = (funnelKey: string) => {
        setSelectedLevelFunnels(prev =>
            prev.includes(funnelKey)
                ? prev.filter(f => f !== funnelKey)
                : [...prev, funnelKey]
        );
    };

    // Fetch filter options on mount
    useEffect(() => {
        const fetchFilterOptions = async () => {
            try {
                const response = await apiClient.get('/analytics/filters/options');
                if (response.data.success) {
                    setAvailableCountries(['All', ...response.data.data.countries]);
                    setAvailableVersions(['All', ...response.data.data.versions]);
                    setAvailableLevelFunnels(response.data.data.levelFunnels || []);
                }
            } catch (error) {
                console.error('Error fetching filter options:', error);
            }
        };

        if (currentGame && currentGame.id !== 'default') {
            fetchFilterOptions();
        }
    }, [currentGame?.id]);

    useEffect(() => {
        if (currentGame && currentGame.id !== 'default') {
            fetchLevelFunnelData();
        } else {
            setLoading(false);
        }
    }, [currentGame, filters, selectedCountries, selectedVersions, selectedLevelFunnels]);

    const fetchLevelFunnelData = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({
                gameId: currentGame?.id || ''
            });

            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (selectedCountries.length > 0) params.append('country', selectedCountries.join(','));
            if (selectedVersions.length > 0) params.append('version', selectedVersions.join(','));
            if (selectedLevelFunnels.length > 0) {
                // Parse selected funnels and send as separate params
                const funnels = selectedLevelFunnels.map(key => {
                    const [funnel, version] = key.split(':');
                    return { funnel, version };
                });
                params.append('levelFunnel', funnels.map(f => f.funnel).join(','));
                params.append('levelFunnelVersion', funnels.map(f => f.version).join(','));
            }

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
            'Started',
            'Completed',
            'Starts',
            'Completes',
            'Fails',
            'Win Rate (%)',
            'Completion Rate (%)',
            'Funnel Rate (%)',
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
            level.startedPlayers,
            level.completedPlayers,
            level.starts,
            level.completes,
            level.fails,
            level.winRate.toFixed(2),
            level.completionRate.toFixed(2),
            level.funnelRate.toFixed(2),
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
            <div className={`level-funnel ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
                <div className="warning-message">
                    <p>Please select a game to view level funnel data.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`level-funnel ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
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
                    📊 Export CSV
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
                            onChange={(e) => {
                                const newStartDate = e.target.value;
                                setFilters(prev => {
                                    // If new start date is after end date, adjust end date
                                    if (prev.endDate && newStartDate > prev.endDate) {
                                        return { ...prev, startDate: newStartDate, endDate: newStartDate };
                                    }
                                    return { ...prev, startDate: newStartDate };
                                });
                            }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>End Date</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => {
                                const newEndDate = e.target.value;
                                setFilters(prev => {
                                    // If new end date is before start date, adjust start date
                                    if (prev.startDate && newEndDate < prev.startDate) {
                                        return { ...prev, startDate: newEndDate, endDate: newEndDate };
                                    }
                                    return { ...prev, endDate: newEndDate };
                                });
                            }}
                        />
                    </div>
                    <div className="filter-group multi-select-group" ref={countryDropdownRef}>
                        <label>Country</label>
                        <button
                            className="multi-select-button"
                            onClick={() => setShowCountrySelector(!showCountrySelector)}
                        >
                            {selectedCountries.length > 0 ? `${selectedCountries.length} selected` : 'All countries'} ▾
                        </button>
                        {showCountrySelector && (
                            <div className="multi-select-dropdown">
                                <div className="multi-select-header">
                                    <button
                                        onClick={() => setSelectedCountries(availableCountries.filter(c => c !== 'All'))}
                                        className="multi-select-action-btn"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={() => setSelectedCountries([])}
                                        className="multi-select-action-btn"
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="multi-select-list">
                                    {availableCountries.filter(c => c !== 'All').map(country => (
                                        <label key={country} className="multi-select-checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedCountries.includes(country)}
                                                onChange={() => toggleCountry(country)}
                                            />
                                            <span>{country}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="filter-group multi-select-group" ref={versionDropdownRef}>
                        <label>App Version</label>
                        <button
                            className="multi-select-button"
                            onClick={() => setShowVersionSelector(!showVersionSelector)}
                        >
                            {selectedVersions.length > 0 ? `${selectedVersions.length} selected` : 'All versions'} ▾
                        </button>
                        {showVersionSelector && (
                            <div className="multi-select-dropdown">
                                <div className="multi-select-header">
                                    <button
                                        onClick={() => setSelectedVersions(availableVersions.filter(v => v !== 'All'))}
                                        className="multi-select-action-btn"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={() => setSelectedVersions([])}
                                        className="multi-select-action-btn"
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="multi-select-list">
                                    {availableVersions.filter(v => v !== 'All').map(version => (
                                        <label key={version} className="multi-select-checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedVersions.includes(version)}
                                                onChange={() => toggleVersion(version)}
                                            />
                                            <span>{version}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="filter-group multi-select-group" ref={levelFunnelDropdownRef}>
                        <label>Level Funnel</label>
                        <button
                            className="multi-select-button"
                            onClick={() => setShowLevelFunnelSelector(!showLevelFunnelSelector)}
                        >
                            {selectedLevelFunnels.length > 0 ? `${selectedLevelFunnels.length} selected` : 'All funnels'} ▾
                        </button>
                        {showLevelFunnelSelector && (
                            <div className="multi-select-dropdown">
                                <div className="multi-select-header">
                                    <button
                                        onClick={() => setSelectedLevelFunnels(availableLevelFunnels.map(f => `${f.funnel}:${f.version}`))}
                                        className="multi-select-action-btn"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={() => setSelectedLevelFunnels([])}
                                        className="multi-select-action-btn"
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="multi-select-list">
                                    {availableLevelFunnels.map(option => {
                                        const key = `${option.funnel}:${option.version}`;
                                        return (
                                            <label key={key} className="multi-select-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedLevelFunnels.includes(key)}
                                                    onChange={() => toggleLevelFunnel(key)}
                                                />
                                                <span>{option.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="error-message">
                    <p>{error}</p>
                </div>
            )}

            {/* Data Table */}
            {!loading && !error && levels.length > 0 && (
                <div className="level-funnel-table-container">
                    <table className="level-funnel-table">
                        <thead>
                            <tr>
                                <th>Level</th>
                                <th>Started</th>
                                <th>Completed</th>
                                <th>Win Rate</th>
                                <th>Completion Rate</th>
                                <th>Funnel Rate</th>
                                <th>Fail Rate</th>
                                <th>Churn (Start)</th>
                                <th>Churn (Next)</th>
                                <th>APS</th>
                                <th>Avg Time</th>
                                <th>Booster %</th>
                                <th>EGP %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {levels.map((level) => (
                                <tr key={level.levelId}>
                                    <td>{level.levelName || `Level ${level.levelId}`}</td>
                                    <td>{level.startedPlayers.toLocaleString()}</td>
                                    <td>{level.completedPlayers.toLocaleString()}</td>
                                    <td>
                                        <span className={
                                            level.winRate >= 80 ? 'metric-value-high' : 
                                            level.winRate >= 60 ? 'metric-value-medium' : 
                                            'metric-value-low'
                                        }>
                                            {level.winRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={
                                            level.completionRate >= 80 ? 'metric-value-high' : 
                                            level.completionRate >= 60 ? 'metric-value-medium' : 
                                            'metric-value-low'
                                        }>
                                            {level.completionRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={
                                            level.funnelRate >= 60 ? 'metric-value-high' : 
                                            level.funnelRate >= 40 ? 'metric-value-medium' : 
                                            'metric-value-low'
                                        }>
                                            {level.funnelRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>{level.failRate.toFixed(1)}%</td>
                                    <td>
                                        <span className={
                                            level.churnStartComplete >= 30 ? 'metric-value-low' : 
                                            level.churnStartComplete >= 15 ? 'metric-value-medium' : 
                                            'metric-value-high'
                                        }>
                                            {level.churnStartComplete.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={
                                            level.churnCompleteNext >= 30 ? 'metric-value-low' : 
                                            level.churnCompleteNext >= 15 ? 'metric-value-medium' : 
                                            'metric-value-high'
                                        }>
                                            {level.churnCompleteNext.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>{level.aps.toFixed(2)}</td>
                                    <td>{level.meanCompletionDuration.toFixed(1)}s</td>
                                    <td>{level.boosterUsage.toFixed(1)}%</td>
                                    <td>{level.egpRate.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && levels.length === 0 && (
                <div className="empty-state">
                    <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h3>No Level Data Available</h3>
                    <p>No level events found for the selected filters. This could mean:</p>
                    <ul>
                        <li>
                            <span>•</span>
                            <span>Your game hasn't sent any <code>level_start</code>, <code>level_complete</code>, or <code>level_failed</code> events yet</span>
                        </li>
                        <li>
                            <span>•</span>
                            <span>The selected date range doesn't contain any level events</span>
                        </li>
                        <li>
                            <span>•</span>
                            <span>The country or version filters are excluding all data</span>
                        </li>
                    </ul>
                    <div className="empty-state-code-block">
                        <h4>📝 To send level events from Unity:</h4>
                        <pre>
{`// Level Start
LvlUpEvents.TrackLevelStart(1, "Tutorial");

// Level Complete  
LvlUpEvents.TrackLevelComplete(1, score, time);

// Level Failed
LvlUpEvents.TrackLevelFailed(1, "timeout", time);`}
                        </pre>
                    </div>
                    <p>Try adjusting your filters or check the Events page to see what events are being tracked.</p>
                </div>
            )}

            {/* Summary Stats */}
            {!loading && !error && levels.length > 0 && (
                <div className="level-funnel-summary">
                    <h3>Summary</h3>
                    <div className="summary-grid">
                        <div className="summary-item">
                            <div className="summary-item-label">Total Levels</div>
                            <div className="summary-item-value">{levels.length}</div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-label">Started</div>
                            <div className="summary-item-value">{levels[0]?.startedPlayers.toLocaleString()}</div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-label">Avg Win Rate</div>
                            <div className="summary-item-value">
                                {(levels.reduce((sum, l) => sum + l.winRate, 0) / levels.length).toFixed(1)}%
                            </div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-label">Avg APS</div>
                            <div className="summary-item-value">
                                {(levels.reduce((sum, l) => sum + l.aps, 0) / levels.length).toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

