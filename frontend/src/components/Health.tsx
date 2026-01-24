import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Bug,
  TrendingDown,
  Users,
  Shield,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getApiKey } from '../lib/apiClient';
import './Health.css';

interface HealthMetrics {
  totalCrashes: number;
  crashRate: number;
  crashFreeUserRate: number;
  crashFreeSessionRate: number;
  affectedUsers: number;
  totalUsers: number;
  crashesByType: Array<{ type: string; count: number }>;
  crashesBySeverity: Array<{ severity: string; count: number }>;
  topCrashes: Array<{
    id: string;
    message: string;
    exceptionType: string;
    count: number;
    affectedUsers: number;
    lastOccurrence: string;
  }>;
}

interface CrashTimeline {
  date: string;
  crashes: number;
  affectedUsers: number;
  totalUsers: number;
  crashRate: number;
}

interface CrashLog {
  id: string;
  crashType: string;
  severity: string;
  message: string;
  stackTrace: string;
  exceptionType: string;
  platform: string;
  appVersion: string;
  timestamp: string;
  userId?: string;
  osVersion?: string;
  manufacturer?: string;
  device?: string;
  deviceId?: string;
  appBuild?: string;
  bundleId?: string;
  engineVersion?: string;
  sdkVersion?: string;
  country?: string;
  connectionType?: string;
  memoryUsage?: number;
  batteryLevel?: number;
  diskSpace?: number;
  breadcrumbs?: string;
  customData?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Health: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [timeline, setTimeline] = useState<CrashTimeline[]>([]);
  const [crashLogs, setCrashLogs] = useState<CrashLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrash, setSelectedCrash] = useState<CrashLog | null>(null);
  
  // Error instances modal state
  const [showErrorInstances, setShowErrorInstances] = useState(false);
  const [errorInstances, setErrorInstances] = useState<CrashLog[]>([]);
  const [currentInstanceIndex, setCurrentInstanceIndex] = useState(0);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [clickedErrorId, setClickedErrorId] = useState<string | null>(null);

  // Filters
  const [dateRange, setDateRange] = useState('7d');
  const [platform, setPlatform] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [severity, setSeverity] = useState('');
  const [crashType, setCrashType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter dropdown states
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [showVersionSelector, setShowVersionSelector] = useState(false);
  
  // Available filter options from API
  const [availableCountries, setAvailableCountries] = useState<string[]>(['All']);
  const [availableVersions, setAvailableVersions] = useState<string[]>(['All']);


  // Refs for dropdowns
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_BASE_URL;
        const apiKey = getApiKey();
        
        const response = await fetch(`${apiUrl}/games/${gameId}/health/filter-options`, {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setAvailableCountries(['All', ...(data.countries || [])]);
          setAvailableVersions(['All', ...(data.versions || [])]);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };

    fetchFilterOptions();
  }, [gameId]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    switch (dateRange) {
      case '24h':
        start.setDate(start.getDate() - 1);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }

    return { start, end };
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

  useEffect(() => {
    fetchHealthData();
  }, [gameId, dateRange, platform, selectedCountries, selectedVersions, severity, crashType]);

  const fetchHealthData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      if (platform) params.append('platform', platform);
      if (selectedCountries.length > 0) {
        selectedCountries.forEach(country => params.append('country', country));
      }
      if (selectedVersions.length > 0) {
        selectedVersions.forEach(version => params.append('appVersion', version));
      }
      if (severity) params.append('severity', severity);
      if (crashType) params.append('crashType', crashType);

      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const apiKey = getApiKey();

      console.log('Fetching health data from:', apiUrl);
      console.log('Game ID:', gameId);
      console.log('Date range:', start.toISOString(), 'to', end.toISOString());

      const headers = {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      };

      const [metricsRes, timelineRes, logsRes] = await Promise.all([
        fetch(`${apiUrl}/games/${gameId}/health/metrics?${params}`, { headers }),
        fetch(`${apiUrl}/games/${gameId}/health/timeline?${params}`, { headers }),
        fetch(`${apiUrl}/games/${gameId}/health/crashes?${params}`, { headers }),
      ]);

      console.log('Response status:', {
        metrics: metricsRes.status,
        timeline: timelineRes.status,
        logs: logsRes.status,
      });

      if (!metricsRes.ok || !timelineRes.ok || !logsRes.ok) {
        throw new Error(`HTTP error! Metrics: ${metricsRes.status}, Timeline: ${timelineRes.status}, Logs: ${logsRes.status}`);
      }

      const metricsData = await metricsRes.json();
      const timelineData = await timelineRes.json();
      const logsData = await logsRes.json();

      console.log('Health data received:', {
        metrics: metricsData,
        timelineCount: timelineData.length,
        logsCount: logsData.logs?.length || 0,
      });

      setMetrics(metricsData);
      setTimeline(timelineData);
      setCrashLogs(logsData.logs || []);
    } catch (error) {
      console.error('Error fetching health data:', error);
      // Set empty data to prevent crashes
      setMetrics({
        totalCrashes: 0,
        crashRate: 0,
        crashFreeUserRate: 100,
        crashFreeSessionRate: 100,
        affectedUsers: 0,
        totalUsers: 0,
        crashesByType: [],
        crashesBySeverity: [],
        topCrashes: [],
      });
      setTimeline([]);
      setCrashLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchErrorInstances = async (message: string, exceptionType: string) => {
    setLoadingInstances(true);
    try {
      const { start, end } = getDateRange();
      const params = new URLSearchParams({
        message,
        exceptionType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      if (platform) params.append('platform', platform);
      if (selectedCountries.length > 0) {
        selectedCountries.forEach(country => params.append('country', country));
      }
      if (selectedVersions.length > 0) {
        selectedVersions.forEach(version => params.append('appVersion', version));
      }

      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const apiKey = getApiKey();

      const response = await fetch(
        `${apiUrl}/games/${gameId}/health/error-instances?${params}`,
        {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setErrorInstances(data.instances || []);
      setCurrentInstanceIndex(0);
      setShowErrorInstances(true);
    } catch (error) {
      console.error('Error fetching error instances:', error);
      setErrorInstances([]);
    } finally {
      setLoadingInstances(false);
      setClickedErrorId(null);
    }
  };

  const handleTopErrorClick = (error: HealthMetrics['topCrashes'][0]) => {
    setClickedErrorId(error.id);
    fetchErrorInstances(error.message, error.exceptionType);
  };

  const navigateInstance = (direction: 'prev' | 'next') => {
    setCurrentInstanceIndex((prev) => {
      if (direction === 'prev') {
        return prev > 0 ? prev - 1 : prev;
      } else {
        return prev < errorInstances.length - 1 ? prev + 1 : prev;
      }
    });
  };

  const closeErrorInstancesModal = () => {
    setShowErrorInstances(false);
    setErrorInstances([]);
    setCurrentInstanceIndex(0);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return '#dc2626';
      case 'HIGH':
        return '#ea580c';
      case 'ERROR':
        return '#ef4444';
      case 'MEDIUM':
        return '#f59e0b';
      case 'LOW':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const parseBreadcrumbs = (breadcrumbsStr: string) => {
    try {
      const parsed = JSON.parse(breadcrumbsStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (e) {
      console.error('Failed to parse breadcrumbs:', e);
      return [];
    }
  };

  const getBreadcrumbTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'ERROR':
        return '#ef4444';
      case 'WARNING':
        return '#f59e0b';
      case 'LOG':
        return '#6b7280';
      default:
        return '#3b82f6';
    }
  };

  const formatBreadcrumbTimestamp = (timestamp: any) => {
    if (!timestamp) return null;
    
    try {
      // Handle different timestamp formats
      let date: Date | null = null;
      
      if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (timestamp && typeof timestamp === 'object') {
        // If it's an object with properties, try to construct a date
        if (timestamp.year && timestamp.month && timestamp.day) {
          date = new Date(timestamp.year, timestamp.month - 1, timestamp.day, 
                         timestamp.hour || 0, timestamp.minute || 0, timestamp.second || 0);
        } else if (timestamp.seconds) {
          // Unix timestamp in seconds
          date = new Date(timestamp.seconds * 1000);
        } else if (timestamp.milliseconds) {
          date = new Date(timestamp.milliseconds);
        }
      }
      
      if (date && !isNaN(date.getTime())) {
        return date.toLocaleString();
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="health-container">
        <div className="loading">Loading health metrics...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="health-container">
        <div className="error">Failed to load health metrics</div>
      </div>
    );
  }

  return (
    <div className="health-container">
      <div className="health-header">
        <div className="header-title">
          <Shield size={24} />
          <h1>App Health</h1>
        </div>

        <div className="header-controls">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="date-range-select"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          <button
            className="filters-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">All Platforms</option>
              <option value="android">Android</option>
              <option value="ios">iOS</option>
              <option value="webgl">WebGL</option>
            </select>
          </div>

          <div className="filter-group day-selector-group" ref={versionDropdownRef}>
            <label>App Version</label>
            <button 
              className="day-selector-button"
              onClick={() => {
                setShowVersionSelector(!showVersionSelector);
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

          <div className="filter-group day-selector-group" ref={countryDropdownRef}>
            <label>Country</label>
            <button 
              className="day-selector-button"
              onClick={() => {
                setShowCountrySelector(!showCountrySelector);
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

          <div className="filter-group">
            <label>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="ERROR">Error</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Type</label>
            <select value={crashType} onChange={(e) => setCrashType(e.target.value)}>
              <option value="">All Types</option>
              <option value="exception">Exception</option>
              <option value="crash">Crash</option>
              <option value="anr">ANR</option>
            </select>
          </div>

          <button
            className="clear-filters"
            onClick={() => {
              setPlatform('');
              setSelectedCountries([]);
              setSelectedVersions([]);
              setSeverity('');
              setCrashType('');
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon crash-rate">
            <TrendingDown size={24} />
          </div>
          <div className="metric-content">
            <h3>Error Rate</h3>
            <div className="metric-value">{metrics.crashRate.toFixed(2)}%</div>
            <p className="metric-description">Sessions with errors</p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon users">
            <Users size={24} />
          </div>
          <div className="metric-content">
            <h3>Error-Free Users</h3>
            <div className="metric-value">{metrics.crashFreeUserRate.toFixed(1)}%</div>
            <p className="metric-description">
              {metrics.totalUsers - metrics.affectedUsers} of {metrics.totalUsers} users
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon sessions">
            <Activity size={24} />
          </div>
          <div className="metric-content">
            <h3>Error-Free Sessions</h3>
            <div className="metric-value">{metrics.crashFreeSessionRate.toFixed(1)}%</div>
            <p className="metric-description">Sessions without errors</p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon total">
            <Bug size={24} />
          </div>
          <div className="metric-content">
            <h3>Total Errors</h3>
            <div className="metric-value">{metrics.totalCrashes.toLocaleString()}</div>
            <p className="metric-description">
              {metrics.affectedUsers} users affected
            </p>
          </div>
        </div>
      </div>

      <div className="charts-section">
        <div className="chart-card full-width">
          <h2>Error Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="date" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="crashes"
                stroke="#ef4444"
                strokeWidth={2}
                name="Errors"
              />
              <Line
                type="monotone"
                dataKey="affectedUsers"
                stroke="#f59e0b"
                strokeWidth={2}
                name="Affected Users"
              />
              <Line
                type="monotone"
                dataKey="crashRate"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Error Rate %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Errors by Type</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={metrics.crashesByType}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {metrics.crashesByType.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Errors by Severity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.crashesBySeverity}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="severity" stroke="var(--text-tertiary)" />
              <YAxis stroke="var(--text-tertiary)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="top-crashes-section">
        <h2>Top Errors</h2>
        <div className="crashes-table">
          <table>
            <thead>
              <tr>
                <th>Exception Type</th>
                <th>Message</th>
                <th>Occurrences</th>
                <th>Affected Users</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topCrashes.map((crash) => (
                <tr 
                  key={crash.id}
                  onClick={() => handleTopErrorClick(crash)}
                  style={{ cursor: 'pointer' }}
                  className={`clickable-row ${clickedErrorId === crash.id ? 'loading-row' : ''}`}
                >
                  <td>
                    <code className="exception-type">{crash.exceptionType}</code>
                  </td>
                  <td className="crash-message">
                    {clickedErrorId === crash.id ? (
                      <span className="loading-text">
                        <span className="spinner"></span>
                        Loading instances...
                      </span>
                    ) : (
                      crash.message
                    )}
                  </td>
                  <td>{crash.count}</td>
                  <td>{crash.affectedUsers}</td>
                  <td>{new Date(crash.lastOccurrence).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crash-logs-section">
        <h2>Recent Error Logs</h2>
        <div className="logs-list">
          {crashLogs.map((log) => (
            <div
              key={log.id}
              className="log-item"
              onClick={() => setSelectedCrash(log)}
            >
              <div className="log-header">
                <div className="log-severity" style={{ backgroundColor: getSeverityColor(log.severity) }}>
                  {log.severity}
                </div>
                <div className="log-type">{log.crashType}</div>
                <div className="log-platform">{log.platform}</div>
                <div className="log-version">{log.appVersion}</div>
                <div className="log-time">{new Date(log.timestamp).toLocaleString()}</div>
              </div>
              <div className="log-content">
                <div className="log-exception">{log.exceptionType}</div>
                <div className="log-message">{log.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedCrash && (
        <div className="crash-modal" onClick={() => setSelectedCrash(null)}>
          <div className="modal-content error-instances-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Error Details</h2>
              </div>
              <button onClick={() => setSelectedCrash(null)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-section">
                <h3>Error Information</h3>
                <div className="detail-row">
                  <strong>Type:</strong> {selectedCrash.crashType}
                </div>
                <div className="detail-row">
                  <strong>Severity:</strong> 
                  <span 
                    className="severity-badge" 
                    style={{ backgroundColor: getSeverityColor(selectedCrash.severity) }}
                  >
                    {selectedCrash.severity}
                  </span>
                </div>
                <div className="detail-row">
                  <strong>Exception:</strong> 
                  <code>{selectedCrash.exceptionType}</code>
                </div>
                <div className="detail-row">
                  <strong>Timestamp:</strong> {new Date(selectedCrash.timestamp).toLocaleString()}
                </div>
                <div className="detail-row">
                  <strong>Message:</strong>
                  <div className="message-text">{selectedCrash.message}</div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Device & Platform</h3>
                <div className="detail-grid">
                  <div className="detail-row">
                    <strong>Platform:</strong> {selectedCrash.platform || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>OS Version:</strong> {selectedCrash.osVersion || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Device:</strong> {selectedCrash.device || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Manufacturer:</strong> {selectedCrash.manufacturer || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Device ID:</strong> {selectedCrash.deviceId || 'N/A'}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>App Information</h3>
                <div className="detail-grid">
                  <div className="detail-row">
                    <strong>App Version:</strong> {selectedCrash.appVersion || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>App Build:</strong> {selectedCrash.appBuild || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Bundle ID:</strong> {selectedCrash.bundleId || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Engine Version:</strong> {selectedCrash.engineVersion || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>SDK Version:</strong> {selectedCrash.sdkVersion || 'N/A'}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Context</h3>
                <div className="detail-grid">
                  <div className="detail-row">
                    <strong>User ID:</strong> {selectedCrash.userId || 'Anonymous'}
                  </div>
                  <div className="detail-row">
                    <strong>Country:</strong> {selectedCrash.country || 'N/A'}
                  </div>
                  <div className="detail-row">
                    <strong>Connection:</strong> {selectedCrash.connectionType || 'N/A'}
                  </div>
                  {selectedCrash.memoryUsage && (
                    <div className="detail-row">
                      <strong>Memory Usage:</strong> {(selectedCrash.memoryUsage / 1024 / 1024).toFixed(2)} MB
                    </div>
                  )}
                  {selectedCrash.batteryLevel !== null && selectedCrash.batteryLevel !== undefined && (
                    <div className="detail-row">
                      <strong>Battery Level:</strong> {(selectedCrash.batteryLevel * 100).toFixed(0)}%
                    </div>
                  )}
                  {selectedCrash.diskSpace && (
                    <div className="detail-row">
                      <strong>Disk Space:</strong> {(selectedCrash.diskSpace / 1024 / 1024 / 1024).toFixed(2)} GB
                    </div>
                  )}
                </div>
              </div>

              {selectedCrash.breadcrumbs && (
                <div className="detail-section">
                  <h3>Breadcrumbs ({parseBreadcrumbs(selectedCrash.breadcrumbs).length} entries)</h3>
                  <div className="breadcrumbs-timeline">
                    {(() => {
                      const breadcrumbs = parseBreadcrumbs(selectedCrash.breadcrumbs);
                      const totalEntries = breadcrumbs.length;
                      return breadcrumbs.reverse().map((crumb: any, index: number) => {
                        const originalIndex = totalEntries - index;
                        const timestamp = formatBreadcrumbTimestamp(crumb.Timestamp);
                        return (
                        <div key={index} className="breadcrumb-entry">
                          <div className="breadcrumb-header">
                            <span className="breadcrumb-index">#{originalIndex}</span>
                            <span 
                              className="breadcrumb-type"
                              style={{ 
                                backgroundColor: getBreadcrumbTypeColor(crumb.Type),
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              {crumb.Type || 'Log'}
                            </span>
                            <span className="breadcrumb-timestamp">
                              {timestamp || `Entry ${originalIndex}`}
                            </span>
                          </div>
                          <div className="breadcrumb-message">{crumb.Message || 'No message'}</div>
                          {crumb.Data && (
                            <div className="breadcrumb-data">
                              <strong>Data:</strong>
                              <pre>{JSON.stringify(crumb.Data, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      );
                      });
                    })()}
                  </div>
                </div>
              )}

              {selectedCrash.customData && (
                <div className="detail-section">
                  <h3>Custom Data</h3>
                  <pre className="custom-data-text">
                    {typeof selectedCrash.customData === 'string'
                      ? JSON.stringify(JSON.parse(selectedCrash.customData), null, 2)
                      : JSON.stringify(selectedCrash.customData, null, 2)
                    }
                  </pre>
                </div>
              )}

              <div className="detail-section">
                <h3>Stack Trace</h3>
                <pre className="stack-trace">{selectedCrash.stackTrace}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {showErrorInstances && (
        <div className="crash-modal" onClick={closeErrorInstancesModal}>
          <div className="modal-content error-instances-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Error Instances</h2>
                {errorInstances.length > 0 && (
                  <p className="instance-counter">
                    Instance {currentInstanceIndex + 1} of {errorInstances.length}
                  </p>
                )}
              </div>
              <button onClick={closeErrorInstancesModal}>×</button>
            </div>
            
            {loadingInstances ? (
              <div className="modal-body">
                <div className="loading">Loading error instances...</div>
              </div>
            ) : errorInstances.length === 0 ? (
              <div className="modal-body">
                <div className="error">No instances found</div>
              </div>
            ) : (
              <>
                <div className="instance-navigation">
                  <button
                    onClick={() => navigateInstance('prev')}
                    disabled={currentInstanceIndex === 0}
                    className="nav-button"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => navigateInstance('next')}
                    disabled={currentInstanceIndex === errorInstances.length - 1}
                    className="nav-button"
                  >
                    Next →
                  </button>
                </div>

                <div className="modal-body">
                  {(() => {
                    const instance = errorInstances[currentInstanceIndex];
                    return (
                      <>
                        <div className="detail-section">
                          <h3>Error Information</h3>
                          <div className="detail-row">
                            <strong>Type:</strong> {instance.crashType}
                          </div>
                          <div className="detail-row">
                            <strong>Severity:</strong> 
                            <span 
                              className="severity-badge" 
                              style={{ backgroundColor: getSeverityColor(instance.severity) }}
                            >
                              {instance.severity}
                            </span>
                          </div>
                          <div className="detail-row">
                            <strong>Exception:</strong> 
                            <code>{instance.exceptionType}</code>
                          </div>
                          <div className="detail-row">
                            <strong>Timestamp:</strong> {new Date(instance.timestamp).toLocaleString()}
                          </div>
                          <div className="detail-row">
                            <strong>Message:</strong>
                            <div className="message-text">{instance.message}</div>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h3>Device & Platform</h3>
                          <div className="detail-grid">
                            <div className="detail-row">
                              <strong>Platform:</strong> {instance.platform || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>OS Version:</strong> {instance.osVersion || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Device:</strong> {instance.device || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Manufacturer:</strong> {instance.manufacturer || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Device ID:</strong> {instance.deviceId || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h3>App Information</h3>
                          <div className="detail-grid">
                            <div className="detail-row">
                              <strong>App Version:</strong> {instance.appVersion || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>App Build:</strong> {instance.appBuild || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Bundle ID:</strong> {instance.bundleId || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Engine Version:</strong> {instance.engineVersion || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>SDK Version:</strong> {instance.sdkVersion || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h3>Context</h3>
                          <div className="detail-grid">
                            <div className="detail-row">
                              <strong>User ID:</strong> {instance.userId || 'Anonymous'}
                            </div>
                            <div className="detail-row">
                              <strong>Country:</strong> {instance.country || 'N/A'}
                            </div>
                            <div className="detail-row">
                              <strong>Connection:</strong> {instance.connectionType || 'N/A'}
                            </div>
                            {instance.memoryUsage && (
                              <div className="detail-row">
                                <strong>Memory Usage:</strong> {(instance.memoryUsage / 1024 / 1024).toFixed(2)} MB
                              </div>
                            )}
                            {instance.batteryLevel !== null && instance.batteryLevel !== undefined && (
                              <div className="detail-row">
                                <strong>Battery Level:</strong> {(instance.batteryLevel * 100).toFixed(0)}%
                              </div>
                            )}
                            {instance.diskSpace && (
                              <div className="detail-row">
                                <strong>Disk Space:</strong> {(instance.diskSpace / 1024 / 1024 / 1024).toFixed(2)} GB
                              </div>
                            )}
                          </div>
                        </div>

                        {instance.breadcrumbs && (
                          <div className="detail-section">
                            <h3>Breadcrumbs ({parseBreadcrumbs(instance.breadcrumbs).length} entries)</h3>
                            <div className="breadcrumbs-timeline">
                              {(() => {
                                const breadcrumbs = parseBreadcrumbs(instance.breadcrumbs);
                                const totalEntries = breadcrumbs.length;
                                return breadcrumbs.reverse().map((crumb: any, index: number) => {
                                  const originalIndex = totalEntries - index;
                                  const timestamp = formatBreadcrumbTimestamp(crumb.Timestamp);
                                  return (
                                  <div key={index} className="breadcrumb-entry">
                                    <div className="breadcrumb-header">
                                      <span className="breadcrumb-index">#{originalIndex}</span>
                                      <span 
                                        className="breadcrumb-type"
                                        style={{ 
                                          backgroundColor: getBreadcrumbTypeColor(crumb.Type),
                                          color: 'white',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: 600
                                        }}
                                      >
                                        {crumb.Type || 'Log'}
                                      </span>
                                      <span className="breadcrumb-timestamp">
                                        {timestamp || `Entry ${originalIndex}`}
                                      </span>
                                    </div>
                                    <div className="breadcrumb-message">{crumb.Message || 'No message'}</div>
                                    {crumb.Data && (
                                      <div className="breadcrumb-data">
                                        <strong>Data:</strong>
                                        <pre>{JSON.stringify(crumb.Data, null, 2)}</pre>
                                      </div>
                                    )}
                                  </div>
                                );
                                });
                              })()}
                            </div>
                          </div>
                        )}

                        {instance.customData && (
                          <div className="detail-section">
                            <h3>Custom Data</h3>
                            <pre className="custom-data-text">
                              {typeof instance.customData === 'string'
                                ? JSON.stringify(JSON.parse(instance.customData), null, 2)
                                : JSON.stringify(instance.customData, null, 2)
                              }
                            </pre>
                          </div>
                        )}

                        <div className="detail-section">
                          <h3>Stack Trace</h3>
                          <pre className="stack-trace">{instance.stackTrace}</pre>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Health;

