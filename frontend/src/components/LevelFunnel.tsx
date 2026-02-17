import { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import apiClient from '../lib/apiClient';
import './LevelFunnel.css';

// Metric explanations for tooltips
const METRIC_TOOLTIPS: Record<string, string> = {
    'Level': 'The level number or name',
    'Started': 'Unique players who triggered level_start event',
    'Completed': 'Unique players who triggered level_complete event',
    'Funnel Rate': '(Nth level completed users / 1st level started users) × 100',
    'Churn (Total)': 'Total % of users lost: users who didn\'t complete + users who completed but didn\'t start next level',
    'Churn (Self)': '% of users who started but never completed (out of started users)',
    'Churn (Next)': '% of users who completed this level but never started the next level (out of completed users)',
    'Completion Rate': '(Unique players completed / Unique players started) × 100',
    'Win Rate': '(Completed attempts / (Completed + Failed attempts)) × 100. Only counts users who finished (excludes incomplete attempts)',
    'Fail Rate': '(Failed attempts / (Completed + Failed attempts)) × 100',
    'APS': 'All starts from completing users, including orphaned starts from crashes/network issues',
    'AVG Time': 'Average time to complete the level in seconds',
    'Cumulative AVG Time': 'Total cumulative average time from level 1 to this level in minutes',
    'Booster': '% of completing/failing users who used at least one booster',
    'EGP': 'End Game Purchase - % of failing users who made a purchase'
};

// Tooltip component
const MetricTooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
    const [show, setShow] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    
    const handleMouseEnter = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                left: rect.left + rect.width / 2,
                top: rect.top
            });
        }
        setShow(true);
    };
    
    return (
        <div 
            ref={containerRef}
            className="metric-tooltip-container"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShow(false)}
        >
            {children}
            <span className="metric-tooltip-icon">?</span>
            {show && (
                <div 
                    className="metric-tooltip-text"
                    style={{ left: `${position.left}px`, top: `${position.top}px` }}
                >
                    {text}
                </div>
            )}
        </div>
    );
};

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
    churnTotal: number;
    churnStartComplete: number;
    churnCompleteNext: number;
    apsRaw: number; // All starts from completing users (includes orphaned starts)
    meanCompletionDuration: number;
    meanFailDuration: number;
    cumulativeAvgTime: number;
    boosterUsage: number;
    egpRate: number;
    customMetrics: Record<string, any>;
}

interface Filters {
    startDate?: string;
    endDate?: string;
    installStartDate?: string;
    installEndDate?: string;
}

interface LevelFunnelProps {
    isCollapsed?: boolean;
}

type SortField = 'apsRaw' | 'churnTotal' | 'churnStartComplete' | 'winRate' | 'meanCompletionDuration' | 'boosterUsage' | 'egpRate';
type SortDirection = 'asc' | 'desc';

export default function LevelFunnel({ isCollapsed = false }: LevelFunnelProps) {
    const { currentGame } = useGame();
    const [levels, setLevels] = useState<LevelMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>({
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        installStartDate: '',
        installEndDate: ''
    });

    // Churn column expansion state
    const [isChurnExpanded, setIsChurnExpanded] = useState(false);

    // Level limit state
    const [levelLimit, setLevelLimit] = useState<number>(100);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Multi-select filter states
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [showPlatformSelector, setShowPlatformSelector] = useState(false);
    const [showVersionSelector, setShowVersionSelector] = useState(false);

    // Level funnel filter state
    const [availableLevelFunnels, setAvailableLevelFunnels] = useState<{ funnel: string; version: number; label: string }[]>([]);
    const [selectedLevelFunnels, setSelectedLevelFunnels] = useState<string[]>([]);
    const [showLevelFunnelSelector, setShowLevelFunnelSelector] = useState(false);

    // Filter options from API
    const [availableCountries, setAvailableCountries] = useState<string[]>([]);
    const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
    const [availableVersions, setAvailableVersions] = useState<string[]>([]);

    // Refs for dropdowns
    const countryDropdownRef = useRef<HTMLDivElement>(null);
    const platformDropdownRef = useRef<HTMLDivElement>(null);
    const versionDropdownRef = useRef<HTMLDivElement>(null);
    const levelFunnelDropdownRef = useRef<HTMLDivElement>(null);

    console.log('LevelFunnel rendered', { currentGame, loading, error, levelsCount: levels.length });

    // Click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
                setShowCountrySelector(false);
            }
            if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
                setShowPlatformSelector(false);
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

    const togglePlatform = (platform: string) => {
        setSelectedPlatforms(prev =>
            prev.includes(platform)
                ? prev.filter(p => p !== platform)
                : [...prev, platform]
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
                const response = await apiClient.get(`/analytics/filters/options?gameId=${currentGame.id}`);
                if (response.data.success) {
                    setAvailableCountries(['All', ...response.data.data.countries]);
                    setAvailablePlatforms(['All', ...response.data.data.platforms]);
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
    }, [currentGame, filters, selectedCountries, selectedPlatforms, selectedVersions, selectedLevelFunnels, levelLimit]);

    const fetchLevelFunnelData = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({
                gameId: currentGame?.id || '',
                levelLimit: levelLimit.toString()
            });

            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (selectedCountries.length > 0) params.append('country', selectedCountries.join(','));
            if (selectedPlatforms.length > 0) params.append('platform', selectedPlatforms.join(','));
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

            if (filters.installStartDate) params.append('installStartDate', filters.installStartDate);
            if (filters.installEndDate) params.append('installEndDate', filters.installEndDate);

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

    const sortedLevels = useMemo(() => {
        if (!sortField) return levels;

        const sorted = [...levels].sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        });

        return sorted;
    }, [levels, sortField, sortDirection]);

    const toggleSort = (field: SortField) => {
        if (sortField !== field) {
            setSortField(field);
            setSortDirection('asc');
            return;
        }

        if (sortDirection === 'asc') {
            setSortDirection('desc');
            return;
        }

        setSortField(null);
        setSortDirection('asc');
    };

    const sortIndicator = (field: SortField) => {
        if (sortField !== field) return '↕';
        return sortDirection === 'asc' ? '↑' : '↓';
    };

    const getChurnColorClass = (value: number) => {
        if (value <= 7) return 'metric-value-high';
        if (value <= 10) return 'metric-value-medium';
        return 'metric-value-low';
    };

    const getApsColorClass = (value: number) => {
        if (value <= 1.1) return 'metric-value-high';
        if (value <= 1.4) return 'metric-value-medium';
        if (value <= 2.5) return 'metric-value-light-red';
        return 'metric-value-low';
    };

    const exportToCSV = () => {
        if (levels.length === 0) return;

        const headers = [
            'Level ID',
            'Level Name',
            'Started',
            'Completed',
            'Funnel Rate (%)',
            'Churn Total (%)',
            'Churn Start-Complete (%)',
            'Churn Complete-Next (%)',
            'Completion Rate (%)',
            'Win Rate (%)',
            'Fail Rate (%)',
            'APS',
            'Avg Completion Time (s)',
            'Cumulative Avg Time (m)',
            'Booster Usage (%)',
            'EGP Rate (%)'
        ];

        const rows = levels.map(level => [
            level.levelId,
            level.levelName || '',
            level.startedPlayers,
            level.completedPlayers,
            level.funnelRate.toFixed(2),
            level.churnTotal.toFixed(2),
            level.churnStartComplete.toFixed(2),
            level.churnCompleteNext.toFixed(2),
            level.completionRate.toFixed(2),
            level.winRate.toFixed(2),
            level.failRate.toFixed(2),
            level.apsRaw.toFixed(2),
            level.meanCompletionDuration.toFixed(2),
            (level.cumulativeAvgTime / 60).toFixed(2),
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
                    <div className="filter-group">
                        <label>Install Start</label>
                        <input
                            type="date"
                            value={filters.installStartDate || ''}
                            onChange={(e) => {
                                const newInstallStart = e.target.value;
                                setFilters(prev => {
                                    if (prev.installEndDate && newInstallStart && newInstallStart > prev.installEndDate) {
                                        return { ...prev, installStartDate: newInstallStart, installEndDate: newInstallStart };
                                    }
                                    return { ...prev, installStartDate: newInstallStart };
                                });
                            }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>Install End</label>
                        <input
                            type="date"
                            value={filters.installEndDate || ''}
                            onChange={(e) => {
                                const newInstallEnd = e.target.value;
                                setFilters(prev => {
                                    if (prev.installStartDate && newInstallEnd && newInstallEnd < prev.installStartDate) {
                                        return { ...prev, installStartDate: newInstallEnd, installEndDate: newInstallEnd };
                                    }
                                    return { ...prev, installEndDate: newInstallEnd };
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
                    <div className="filter-group multi-select-group" ref={platformDropdownRef}>
                        <label>Platform</label>
                        <button
                            className="multi-select-button"
                            onClick={() => setShowPlatformSelector(!showPlatformSelector)}
                        >
                            {selectedPlatforms.length > 0 ? `${selectedPlatforms.length} selected` : 'All platforms'} ▾
                        </button>
                        {showPlatformSelector && (
                            <div className="multi-select-dropdown">
                                <div className="multi-select-header">
                                    <button
                                        onClick={() => setSelectedPlatforms(availablePlatforms.filter(p => p !== 'All'))}
                                        className="multi-select-action-btn"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={() => setSelectedPlatforms([])}
                                        className="multi-select-action-btn"
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="multi-select-list">
                                    {availablePlatforms.filter(p => p !== 'All').map(platform => (
                                        <label key={platform} className="multi-select-checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedPlatforms.includes(platform)}
                                                onChange={() => togglePlatform(platform)}
                                            />
                                            <span>{platform}</span>
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
                    <div className="filter-group">
                        <label>Level Limit</label>
                        <input
                            type="number"
                            min="1"
                            max="1000"
                            value={levelLimit}
                            onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (value > 0 && value <= 1000) {
                                    setLevelLimit(value);
                                }
                            }}
                            style={{ width: '100px' }}
                        />
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="loading-state">
                    <RefreshCw size={32} className="spinning" />
                    <p>Loading funnel data...</p>
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
                    <div className="level-funnel-table-scroll">
                        <table className="level-funnel-table">
                        <thead>
                            <tr>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Level']}>Level</MetricTooltip></th>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Started']}>Started</MetricTooltip></th>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Completed']}>Completed</MetricTooltip></th>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Funnel Rate']}>Funnel Rate</MetricTooltip></th>
                                <th className="churn-header-expandable">
                                    <MetricTooltip text={METRIC_TOOLTIPS['Churn (Total)']}>
                                        <span
                                            onClick={() => toggleSort('churnTotal')}
                                            style={{ cursor: 'pointer', marginRight: '8px' }}
                                        >
                                            Churn (Total) {sortIndicator('churnTotal')}
                                        </span>
                                    </MetricTooltip>
                                    <span
                                        onClick={() => setIsChurnExpanded(!isChurnExpanded)}
                                        style={{ cursor: 'pointer' }}
                                        title={isChurnExpanded ? 'Collapse churn detail columns' : 'Expand churn detail columns'}
                                    >
                                        {isChurnExpanded ? '▼' : '▶'}
                                    </span>
                                </th>
                                {isChurnExpanded && (
                                    <>
                                        <th
                                            onClick={() => toggleSort('churnStartComplete')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <MetricTooltip text={METRIC_TOOLTIPS['Churn (Self)']}>
                                                Churn (Self) {sortIndicator('churnStartComplete')}
                                            </MetricTooltip>
                                        </th>
                                        <th><MetricTooltip text={METRIC_TOOLTIPS['Churn (Next)']}>Churn (Next)</MetricTooltip></th>
                                    </>
                                )}
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Completion Rate']}>Completion Rate</MetricTooltip></th>
                                <th
                                    onClick={() => toggleSort('winRate')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <MetricTooltip text={METRIC_TOOLTIPS['Win Rate']}>
                                        Win Rate {sortIndicator('winRate')}
                                    </MetricTooltip>
                                </th>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Fail Rate']}>Fail Rate</MetricTooltip></th>
                                <th
                                    onClick={() => toggleSort('apsRaw')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <MetricTooltip text={METRIC_TOOLTIPS['APS']}>
                                        APS {sortIndicator('apsRaw')}
                                    </MetricTooltip>
                                </th>
                                <th
                                    onClick={() => toggleSort('meanCompletionDuration')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <MetricTooltip text={METRIC_TOOLTIPS['AVG Time']}>
                                        AVG Time {sortIndicator('meanCompletionDuration')}
                                    </MetricTooltip>
                                </th>
                                <th><MetricTooltip text={METRIC_TOOLTIPS['Cumulative AVG Time']}>Cumulative AVG Time</MetricTooltip></th>
                                <th
                                    onClick={() => toggleSort('boosterUsage')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <MetricTooltip text={METRIC_TOOLTIPS['Booster']}>
                                        Booster % {sortIndicator('boosterUsage')}
                                    </MetricTooltip>
                                </th>
                                <th
                                    onClick={() => toggleSort('egpRate')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <MetricTooltip text={METRIC_TOOLTIPS['EGP']}>
                                        EGP % {sortIndicator('egpRate')}
                                    </MetricTooltip>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedLevels.map((level) => (
                                <tr key={level.levelId}>
                                    <td>{level.levelName || `Level ${level.levelId}`}</td>
                                    <td>{level.startedPlayers.toLocaleString()}</td>
                                    <td>{level.completedPlayers.toLocaleString()}</td>
                                    <td>
                                        <span className={
                                            level.funnelRate >= 60 ? 'metric-value-high' : 
                                            level.funnelRate >= 40 ? 'metric-value-medium' : 
                                            'metric-value-low'
                                        }>
                                            {level.funnelRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={getChurnColorClass(level.churnTotal)}>
                                            {level.churnTotal.toFixed(1)}%
                                        </span>
                                    </td>
                                    {isChurnExpanded && (
                                        <>
                                            <td>
                                                <span className={getChurnColorClass(level.churnStartComplete)}>
                                                    {level.churnStartComplete.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td>
                                                <span className={getChurnColorClass(level.churnCompleteNext)}>
                                                    {level.churnCompleteNext.toFixed(1)}%
                                                </span>
                                            </td>
                                        </>
                                    )}
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
                                            level.winRate >= 80 ? 'metric-value-high' : 
                                            level.winRate >= 60 ? 'metric-value-medium' : 
                                            'metric-value-low'
                                        }>
                                            {level.winRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td>{level.failRate.toFixed(1)}%</td>
                                    <td>
                                        <span className={getApsColorClass(level.apsRaw)}>
                                            {level.apsRaw.toFixed(2)}
                                        </span>
                                    </td>
                                    <td>{level.meanCompletionDuration.toFixed(1)}s</td>
                                    <td>{(level.cumulativeAvgTime / 60).toFixed(1)}m</td>
                                    <td>{level.boosterUsage.toFixed(1)}%</td>
                                    <td>{level.egpRate.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
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
                                {(levels.reduce((sum, l) => sum + l.apsRaw, 0) / levels.length).toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {/* Funnel Rate Graph */}
                    <div className="funnel-graph-container">
                        <h4>Funnel Rate by Level</h4>
                        <div className="funnel-graph">
                            <svg width="100%" height="300" style={{ overflow: 'visible' }}>
                                {/* Y-axis labels */}
                                {[0, 25, 50, 75, 100].map((tick) => (
                                    <g key={tick}>
                                        <line
                                            x1="40"
                                            y1={250 - (tick * 2)}
                                            x2="100%"
                                            y2={250 - (tick * 2)}
                                            stroke="#e5e7eb"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x="5"
                                            y={254 - (tick * 2)}
                                            fontSize="10"
                                            fill="#6b7280"
                                        >
                                            {tick}%
                                        </text>
                                    </g>
                                ))}

                                {/* Line path */}
                                <path
                                    d={levels.map((level, index) => {
                                        const x = 50 + (index * (100 / (levels.length || 1)) * 8);
                                        const y = 250 - (level.funnelRate * 2);
                                        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="2"
                                />

                                {/* Data points */}
                                {levels.map((level, index) => {
                                    const x = 50 + (index * (100 / (levels.length || 1)) * 8);
                                    const y = 250 - (level.funnelRate * 2);
                                    return (
                                        <g key={level.levelId} className="graph-point-group">
                                            {/* Base circle */}
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r="4"
                                                fill="#3b82f6"
                                                className="graph-point"
                                            />
                                            {/* Hover circle - larger, shown on hover */}
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r="6"
                                                fill="#2563eb"
                                                className="graph-point-hover"
                                                opacity="0"
                                            />
                                            {/* Invisible larger circle for easier hovering */}
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r="12"
                                                fill="transparent"
                                                className="graph-point-hitarea"
                                            />
                                            {/* Tooltip - shown on hover */}
                                            <g className="graph-tooltip" style={{ pointerEvents: 'none' }}>
                                                <rect
                                                    x={x - 50}
                                                    y={y - 50}
                                                    width="100"
                                                    height="40"
                                                    fill="#1e293b"
                                                    rx="6"
                                                />
                                                <text
                                                    x={x}
                                                    y={y - 28}
                                                    fontSize="14"
                                                    fill="white"
                                                    textAnchor="middle"
                                                    fontWeight="600"
                                                >
                                                    Level {level.levelId}
                                                </text>
                                                <text
                                                    x={x}
                                                    y={y - 12}
                                                    fontSize="13"
                                                    fill="#94a3b8"
                                                    textAnchor="middle"
                                                >
                                                    {level.funnelRate.toFixed(1)}%
                                                </text>
                                            </g>
                                            {/* Level label every 5th level or first/last */}
                                            {(index === 0 || index === levels.length - 1 || level.levelId % 5 === 0) && (
                                                <text
                                                    x={x}
                                                    y="280"
                                                    fontSize="10"
                                                    fill="#6b7280"
                                                    textAnchor="middle"
                                                >
                                                    {level.levelId}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
