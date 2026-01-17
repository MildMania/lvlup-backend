import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import Health from './Health';
import './Analytics.css';

type AnalyticsTab = 'engagement' | 'progression' | 'health' | 'monetization';

interface AnalyticsProps {
  gameInfo: {
    id: string;
    name: string;
    apiKey: string;
  };
  isCollapsed?: boolean;
}

const Analytics: React.FC<AnalyticsProps> = ({ gameInfo, isCollapsed = false }) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('engagement');

  return (
    <div className={`analytics-container ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="analytics-header">
        <h1>Analytics</h1>
        <p className="analytics-subtitle">Deep dive into your game metrics</p>
      </div>

      {/* Tab Navigation */}
      <div className="analytics-tabs">
        <button
          className={`analytics-tab ${activeTab === 'engagement' ? 'active' : ''}`}
          onClick={() => setActiveTab('engagement')}
        >
          Engagement
        </button>
        <button
          className={`analytics-tab ${activeTab === 'progression' ? 'active' : ''}`}
          onClick={() => setActiveTab('progression')}
        >
          Progression
        </button>
        <button
          className={`analytics-tab ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Health (Performance & Errors)
        </button>
        <button
          className={`analytics-tab ${activeTab === 'monetization' ? 'active' : ''}`}
          onClick={() => setActiveTab('monetization')}
        >
          Monetization
        </button>
      </div>

      {/* Tab Content */}
      <div className="analytics-content">
        {activeTab === 'engagement' && <EngagementTab gameInfo={gameInfo} />}
        {activeTab === 'progression' && <ProgressionTab gameInfo={gameInfo} />}
        {activeTab === 'health' && <HealthTab gameInfo={gameInfo} />}
        {activeTab === 'monetization' && <MonetizationTab gameInfo={gameInfo} />}
      </div>
    </div>
  );
};

// Engagement Tab Component
const EngagementTab: React.FC<{ gameInfo: any }> = ({ gameInfo }) => {
  const [cohortData, setCohortData] = useState<any[]>([]);
  const [metricData, setMetricData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<'retention' | 'playtime' | 'session-count' | 'session-length'>('retention');
  const [showDaySelector, setShowDaySelector] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [showVersionSelector, setShowVersionSelector] = useState(false);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  // Available days for selection
  const availableDays = [0, 1, 2, 3, 4, 5, 6, 7, 14, 30, 60, 90, 180, 360, 540, 720];
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 3, 7, 14, 30]);

  // Filter options from API
  const [availableCountries, setAvailableCountries] = useState<string[]>(['All']);
  const [availableVersions, setAvailableVersions] = useState<string[]>(['All']);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>(['All']);

  // Refs for dropdowns
  const dayDropdownRef = useRef<HTMLDivElement>(null);
  const platformDropdownRef = useRef<HTMLDivElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(event.target as Node)) {
        setShowDaySelector(false);
      }
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
        setShowPlatformSelector(false);
      }
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setShowCountrySelector(false);
      }
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
        setShowVersionSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCohortData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        days: selectedDays.sort((a, b) => a - b).join(',')
      });

      if (selectedPlatforms.length > 0) params.append('platform', selectedPlatforms.join(','));
      if (selectedCountries.length > 0) params.append('country', selectedCountries.join(','));
      if (selectedVersions.length > 0) params.append('version', selectedVersions.join(','));

      console.log('Fetching cohort data with params:', params.toString());
      console.log('API Key:', gameInfo.apiKey);

      const response = await apiClient.get(`/analytics/cohort/retention?${params.toString()}`);

      console.log('Response status:', response.status);
      console.log('Response data:', response.data);

      if (response.data.success && response.data.data) {
        console.log('Setting cohort data:', response.data.data.length, 'cohorts');
        setCohortData(response.data.data);
      } else {
        console.error('API returned unsuccessful response:', response.data);
      }
    } catch (error) {
      console.error('Error fetching cohort data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetricData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        days: selectedDays.sort((a, b) => a - b).join(',')
      });

      if (selectedPlatforms.length > 0) params.append('platform', selectedPlatforms.join(','));
      if (selectedCountries.length > 0) params.append('country', selectedCountries.join(','));
      if (selectedVersions.length > 0) params.append('version', selectedVersions.join(','));

      let endpoint = '';
      switch (selectedMetric) {
        case 'playtime':
          endpoint = '/analytics/cohort/playtime';
          break;
        case 'session-count':
          endpoint = '/analytics/cohort/session-count';
          break;
        case 'session-length':
          endpoint = '/analytics/cohort/session-length';
          break;
        default:
          return fetchCohortData();
      }

      console.log('Fetching metric data from:', endpoint, 'with params:', params.toString());

      const response = await apiClient.get(`${endpoint}?${params.toString()}`);

      console.log('Response status:', response.status);
      console.log('Response data:', response.data);

      if (response.data.success && response.data.data) {
        console.log('Setting metric data:', response.data.data.length, 'records');
        // Transform the data to match the expected format
        const transformedData = response.data.data.map((item: any) => ({
          date: item.installDate,
          userCount: item.installCount,
          metricsByDay: item.retentionByDay,
          userCountByDay: item.userCountByDay
        }));
        setMetricData(transformedData);
      } else {
        console.error('API returned unsuccessful response:', response.data);
      }
    } catch (error) {
      console.error('Error fetching metric data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await apiClient.get('/analytics/filters/options');
        if (response.data.success) {
          setAvailableCountries(['All', ...response.data.data.countries]);
          setAvailableVersions(['All', ...response.data.data.versions]);
          setAvailablePlatforms(['All', ...response.data.data.platforms]);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };

    fetchFilterOptions();
  }, [gameInfo.id]);

  useEffect(() => {
    if (selectedMetric === 'retention') {
      fetchCohortData();
    } else {
      fetchMetricData();
    }
  }, [gameInfo.id, filters, selectedDays, selectedPlatforms, selectedCountries, selectedVersions, selectedMetric]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const selectAllDays = () => {
    setSelectedDays([...availableDays]);
  };

  const clearAllDays = () => {
    setSelectedDays([]);
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

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

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      
      // Ensure end date is not earlier than start date
      if (key === 'startDate' && newFilters.endDate && value > newFilters.endDate) {
        newFilters.endDate = value;
      } else if (key === 'endDate' && newFilters.startDate && value < newFilters.startDate) {
        newFilters.startDate = value;
      }
      
      return newFilters;
    });
  };

  const getRetentionColor = (value: number) => {
    if (value < 0) return 'not-available';
    if (value >= 70) return 'retention-90';
    if (value >= 50) return 'retention-70';
    if (value >= 40) return 'retention-50';
    if (value >= 30) return 'retention-40';
    if (value >= 20) return 'retention-30';
    if (value >= 10) return 'retention-20';
    return 'retention-10';
  };

  // Calculate color for metric values based on percentile within each day
  const getMetricColor = (day: number, value: number | undefined) => {
    if (value === undefined || value === null || value < 0) return 'not-available';
    if (value === 0) return 'metric-very-low';

    // Get all values for this specific day across all cohorts
    const dayValues = metricData
      .map((row: any) => row.metricsByDay?.[day])
      .filter((v: any) => v !== undefined && v !== null && v >= 0 && v > 0);

    if (dayValues.length === 0) return '';

    // Sort values to determine percentiles
    const sortedValues = [...dayValues].sort((a, b) => a - b);
    const valueIndex = sortedValues.indexOf(value);
    const percentile = (valueIndex / (sortedValues.length - 1)) * 100;

    // Assign color based on percentile (higher is better - darker blue)
    if (percentile >= 90) return 'metric-top';
    if (percentile >= 75) return 'metric-high';
    if (percentile >= 50) return 'metric-good';
    if (percentile >= 25) return 'metric-medium';
    if (percentile >= 10) return 'metric-low';
    return 'metric-very-low';
  };

  return (
    <div className="tab-content">
      <h2>Engagement Analytics</h2>
      <p>Cohort retention analysis and user engagement metrics</p>

      {/* Metric Selector */}
      <div className="analytics-filters" style={{ marginBottom: '20px' }}>
        <div className="filter-group">
          <label>Metric</label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as 'retention' | 'playtime' | 'session-count' | 'session-length')}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="retention">Retention Cohort</option>
            <option value="playtime">Avg Daily Playtime</option>
            <option value="session-count">Avg Session Count</option>
            <option value="session-length">Avg Session Length</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="analytics-filters">
        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>
        <div className="filter-group day-selector-group" ref={dayDropdownRef}>
          <label>Days to Show</label>
          <button 
            className="day-selector-button"
            onClick={() => {
              setShowDaySelector(!showDaySelector);
              setShowPlatformSelector(false);
              setShowCountrySelector(false);
              setShowVersionSelector(false);
            }}
          >
            {selectedDays.length} days selected ▾
          </button>
          {showDaySelector && (
            <div className="day-selector-dropdown">
              <div className="day-selector-header">
                <button onClick={selectAllDays} className="day-action-btn">Select All</button>
                <button onClick={clearAllDays} className="day-action-btn">Clear All</button>
              </div>
              <div className="day-selector-list">
                {availableDays.map(day => (
                  <label key={day} className="day-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={() => toggleDay(day)}
                    />
                    <span>Day {day}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="filter-group day-selector-group" ref={platformDropdownRef}>
          <label>Platform</label>
          <button 
            className="day-selector-button"
            onClick={() => {
              setShowPlatformSelector(!showPlatformSelector);
              setShowDaySelector(false);
              setShowCountrySelector(false);
              setShowVersionSelector(false);
            }}
          >
            {selectedPlatforms.length > 0 ? `${selectedPlatforms.length} selected` : 'All platforms'} ▾
          </button>
          {showPlatformSelector && (
            <div className="day-selector-dropdown">
              <div className="day-selector-header">
                <button onClick={() => setSelectedPlatforms(availablePlatforms.filter(p => p !== 'All'))} className="day-action-btn">Select All</button>
                <button onClick={() => setSelectedPlatforms([])} className="day-action-btn">Clear All</button>
              </div>
              <div className="day-selector-list">
                {availablePlatforms.filter(p => p !== 'All').map(platform => (
                  <label key={platform} className="day-checkbox-label">
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
        <div className="filter-group day-selector-group" ref={countryDropdownRef}>
          <label>Country</label>
          <button 
            className="day-selector-button"
            onClick={() => {
              setShowCountrySelector(!showCountrySelector);
              setShowDaySelector(false);
              setShowPlatformSelector(false);
              setShowVersionSelector(false);
            }}
          >
            {selectedCountries.length > 0 ? `${selectedCountries.length} selected` : 'All countries'} ▾
          </button>
          {showCountrySelector && (
            <div className="day-selector-dropdown">
              <div className="day-selector-header">
                <button onClick={() => setSelectedCountries(availableCountries.filter(c => c !== 'All'))} className="day-action-btn">Select All</button>
                <button onClick={() => setSelectedCountries([])} className="day-action-btn">Clear All</button>
              </div>
              <div className="day-selector-list">
                {availableCountries.filter(c => c !== 'All').map(country => (
                  <label key={country} className="day-checkbox-label">
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
        <div className="filter-group day-selector-group" ref={versionDropdownRef}>
          <label>Build/Version</label>
          <button 
            className="day-selector-button"
            onClick={() => {
              setShowVersionSelector(!showVersionSelector);
              setShowDaySelector(false);
              setShowPlatformSelector(false);
              setShowCountrySelector(false);
            }}
          >
            {selectedVersions.length > 0 ? `${selectedVersions.length} selected` : 'All versions'} ▾
          </button>
          {showVersionSelector && (
            <div className="day-selector-dropdown">
              <div className="day-selector-header">
                <button onClick={() => setSelectedVersions(availableVersions.filter(v => v !== 'All'))} className="day-action-btn">Select All</button>
                <button onClick={() => setSelectedVersions([])} className="day-action-btn">Clear All</button>
              </div>
              <div className="day-selector-list">
                {availableVersions.filter(v => v !== 'All').map(version => (
                  <label key={version} className="day-checkbox-label">
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
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner">⟳ Loading...</div>
        </div>
      ) : selectedMetric === 'retention' ? (
        <div className="cohort-table-container">
          <table className="cohort-table">
            <thead>
              <tr>
                <th>Install Date</th>
                <th>Installs</th>
                {selectedDays.map(day => (
                  <th key={day}>Day {day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortData.length === 0 ? (
                <tr>
                  <td colSpan={selectedDays.length + 2} style={{ textAlign: 'center', padding: '2rem' }}>
                    No data available for the selected period
                  </td>
                </tr>
              ) : (
                cohortData.map((cohort) => (
                  <tr key={cohort.installDate}>
                    <td className="install-date">{cohort.installDate}</td>
                    <td className="install-count">{cohort.installCount}</td>
                    {selectedDays.map(day => {
                      const value = cohort.retentionByDay[day];
                      const userCount = cohort.userCountByDay?.[day];
                      const isNotAvailable = value < 0;
                      return (
                        <td
                          key={day}
                          className={`retention-cell ${isNotAvailable ? 'not-available' : getRetentionColor(value)}`}
                        >
                          <div className="metric-value">{isNotAvailable ? 'N/A' : `${value}%`}</div>
                          {!isNotAvailable && userCount !== undefined && (
                            <div className="metric-user-count">{userCount} users</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cohort-table-container">
          <table className="cohort-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Users</th>
                {selectedDays.map(day => (
                  <th key={day}>Day {day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricData.length === 0 ? (
                <tr>
                  <td colSpan={selectedDays.length + 2} style={{ textAlign: 'center', padding: '2rem' }}>
                    No data available for the selected period
                  </td>
                </tr>
              ) : (
                metricData.map((row: any) => (
                  <tr key={row.date}>
                    <td className="install-date">{row.date}</td>
                    <td className="install-count">{row.userCount || 0}</td>
                    {selectedDays.map(day => {
                      const value = row.metricsByDay?.[day];
                      const userCount = row.userCountByDay?.[day];
                      const isNotAvailable = value === undefined || value === null || value < 0;
                      const formattedValue = isNotAvailable
                        ? 'N/A'
                        : selectedMetric === 'playtime' 
                        ? `${value.toFixed(1)}m`
                        : selectedMetric === 'session-count'
                        ? value.toFixed(2)
                        : `${value.toFixed(1)}m`;
                      
                      const colorClass = getMetricColor(day, value);
                      
                      return (
                        <td key={day} className={`retention-cell ${colorClass}`}>
                          <div className="metric-value">{formattedValue}</div>
                          {!isNotAvailable && userCount !== undefined && (
                            <div className="metric-user-count">{userCount} users</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Progression Tab Component (Placeholder)
const ProgressionTab: React.FC<{ gameInfo: any }> = () => {
  return (
    <div className="tab-content">
      <h2>Progression Analytics</h2>
      <p>Player progression and milestone completion</p>
      {/* To be implemented */}
    </div>
  );
};

// Health Tab Component (Placeholder)
const HealthTab: React.FC<{ gameInfo: any }> = ({ gameInfo }) => {
  try {
    if (!gameInfo || !gameInfo.id) {
      return (
        <div className="tab-content">
          <h2>Health & Performance</h2>
          <p>No game selected. Please select a game from the sidebar.</p>
        </div>
      );
    }
    return <Health gameId={gameInfo.id} />;
  } catch (error) {
    console.error('Error rendering Health tab:', error);
    return (
      <div className="tab-content">
        <h2>Health & Performance</h2>
        <p>Error loading health metrics. Please check the console for details.</p>
      </div>
    );
  }
};

// Monetization Tab Component (Placeholder)
const MonetizationTab: React.FC<{ gameInfo: any }> = () => {
  return (
    <div className="tab-content">
      <h2>Monetization</h2>
      <p>Revenue and monetization metrics</p>
      {/* To be implemented */}
    </div>
  );
};

export default Analytics;
