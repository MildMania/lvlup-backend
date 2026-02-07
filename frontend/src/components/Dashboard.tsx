import React, { useEffect, useState, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Users, Activity, Clock, TrendingUp, RefreshCw, Info, Copy, Check } from 'lucide-react';
import { AnalyticsService, fetchActiveUsers, fetchPlaytime } from '../services/analytics';
import type { 
  RetentionPoint, 
  PlaytimePoint, 
  DashboardSummary 
} from '../types/analytics';
import { useTheme } from '../contexts/ThemeContext';
import { useGame } from '../contexts/GameContext';
import { AIChatWidget } from './AIChatWidget';
import './Dashboard.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  loading?: boolean;
  description?: string;
}

const MetricCard: React.FC<MetricCardProps> = React.memo(({ 
  title, 
  value, 
  icon, 
  change, 
  changeType = 'neutral',
  loading = false,
  description 
}) => (
  <div className="metric-card">
    <div className="metric-header">
      <div className="metric-icon">{icon}</div>
      <div className="metric-title-wrapper">
        <div className="metric-title">{title}</div>
        {description && (
          <div className="metric-info" data-tooltip={description}>
            <Info size={14} />
          </div>
        )}
      </div>
    </div>
    <div className="metric-value">
      {loading ? (
        <div className="loading-skeleton">---</div>
      ) : (
        value
      )}
    </div>
    {change && !loading && (
      <div className={`metric-change ${changeType}`}>
        {change}
      </div>
    )}
  </div>
));

interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
  actions?: React.ReactNode;
  description?: string;
}

const ChartContainer: React.FC<ChartContainerProps> = React.memo(({ 
  title, 
  children, 
  className = '', 
  loading = false,
  actions,
  description 
}) => (
  <div className={`chart-container ${className}`}>
    <div className="chart-header">
      <div className="chart-title-wrapper">
        <h3 className="chart-title">{title}</h3>
        {description && (
          <div className="chart-info" data-tooltip={description}>
            <Info size={16} />
          </div>
        )}
      </div>
      {actions && <div className="chart-actions">{actions}</div>}
    </div>
    <div className="chart-content">
      {loading ? (
        <div className="chart-loading">
          <RefreshCw size={32} className="spinning" />
          <p>Loading chart data...</p>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
));

interface DashboardProps {
  gameInfo?: {
    id: string;
    name: string;
    description?: string;
    apiKey?: string;
  };
  isCollapsed?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ gameInfo, isCollapsed = false }) => {
  const { currentGame } = useGame();
  const [retention, setRetention] = useState<RetentionPoint[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUserPoint[]>([]);
  const [playtime, setPlaytime] = useState<PlaytimePoint[]>([]);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false); // For incremental updates
  const [error, setError] = useState<string | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState('7');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useTheme();
  const applyRetentionToSummary = (retentionPoints: RetentionPoint[]) => {
    if (!retentionPoints.length) return;

    const day1 = retentionPoints.find((r) => r.day === 1)?.percentage ?? 0;
    const day7 = retentionPoints.find((r) => r.day === 7)?.percentage ?? 0;

    setSummary((prev) =>
      prev
        ? {
            ...prev,
            retentionDay1: day1,
            retentionDay7: day7
          }
        : prev
    );
  };

  // Theme-aware chart colors
  const chartColors = {
    grid: isDarkMode ? '#334155' : '#e2e8f0',
    text: isDarkMode ? '#cbd5e1' : '#64748b',
    primary: '#3b82f6',
    secondary: '#10b981',
    tertiary: '#f59e0b',
    quaternary: '#ef4444',
    background: isDarkMode ? '#1e293b' : '#ffffff'
  };

  const copyApiKey = () => {
    if (gameInfo?.apiKey) {
      navigator.clipboard.writeText(gameInfo.apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  };

  useEffect(() => {
    // Initial load - fetch all data
    if (loading) {
      fetchDashboardData();
    } else {
      // Subsequent changes - only update data, don't show full loading
      updateDashboardData();
    }
  }, [selectedDateRange, currentGame?.id]); // Re-fetch when game changes

  // Update data without full loading state
  const updateDashboardData = async () => {
    try {
      setUpdating(true);
      setError(null);

      // Skip if no valid game is selected
      if (!currentGame || currentGame.id === 'default') {
        setUpdating(false);
        return;
      }

      // Get date range from helper function
      const { startDate: startDateStr, endDate: endDateStr } = getDateRange();

      // Fetch data in background while keeping existing data visible
      const [summaryData, retentionData] = await Promise.allSettled([
        AnalyticsService.getDashboardSummary(currentGame.id, startDateStr, endDateStr),
        AnalyticsService.getDashboardRetention(currentGame.id, startDateStr, endDateStr)
      ]);

      // Handle successful responses
      if (summaryData.status === 'fulfilled' && summaryData.value) {
        setSummary(summaryData.value);
        if (retention.length > 0) {
          applyRetentionToSummary(retention);
        }
      }

      if (retentionData.status === 'fulfilled') {
        setRetention(retentionData.value || []);
        applyRetentionToSummary(retentionData.value || []);
      }

      // Fetch chart data
      const [activeUsersResult, playtimeResult] = await Promise.allSettled([
        fetchActiveUsers(new URLSearchParams({
          gameId: currentGame.id,
          startDate: startDateStr,
          endDate: endDateStr
        })),
        fetchPlaytime(new URLSearchParams({
          gameId: currentGame.id,
          startDate: startDateStr,
          endDate: endDateStr
        }))
      ]);

      if (activeUsersResult.status === 'fulfilled') {
        setActiveUsers(activeUsersResult.value || []);
      }
      
      if (playtimeResult.status === 'fulfilled') {
        setPlaytime(playtimeResult.value || []);
      }

      setLastUpdated(new Date());
      setUpdating(false);
    } catch (err) {
      console.error('Failed to update dashboard data:', err);
      setError('Failed to update dashboard data. Please try again.');
      setUpdating(false);
    }
  };

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedDateRange(value);
    
    if (value === 'custom') {
      setIsCustomRange(true);
      // Set default custom dates to last 30 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      
      setCustomEndDate(end.toISOString().split('T')[0]);
      setCustomStartDate(start.toISOString().split('T')[0]);
    } else {
      setIsCustomRange(false);
    }
  };

  const handleApplyCustomRange = () => {
    if (customStartDate && customEndDate && customStartDate <= customEndDate) {
      setShowDatePicker(false);
      // Use update instead of full reload for better UX
      if (loading) {
        fetchDashboardData();
      } else {
        updateDashboardData();
      }
    }
  };

  const formatDateRange = () => {
    if (selectedDateRange === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate).toLocaleDateString();
      const end = new Date(customEndDate).toLocaleDateString();
      return `${start} - ${end}`;
    }
    return null;
  };

  const getDateRange = () => {
    if (selectedDateRange === 'custom' && customStartDate && customEndDate) {
      return {
        startDate: customStartDate,
        endDate: customEndDate
      };
    } else {
      // Calculate date range based on selectedDateRange
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(selectedDateRange));
      
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    }
  };

  const handleRefresh = () => {
    // Always use update for manual refresh to avoid jarring full reload
    if (loading) {
      fetchDashboardData();
    } else {
      updateDashboardData();
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Skip if no valid game is selected
      if (!currentGame || currentGame.id === 'default') {
        setLoading(false);
        return;
      }

      // Get date range from helper function
      const { startDate: startDateStr, endDate: endDateStr } = getDateRange();

      // Fetch data that we have endpoints for - now with date range
      const [summaryData, retentionData] = await Promise.allSettled([
        AnalyticsService.getDashboardSummary(currentGame.id, startDateStr, endDateStr),
        AnalyticsService.getDashboardRetention(currentGame.id, startDateStr, endDateStr)
      ]);

      // Handle successful responses
      if (summaryData.status === 'fulfilled' && summaryData.value) {
        setSummary(summaryData.value);
        if (retention.length > 0) {
          applyRetentionToSummary(retention);
        }
      }

      if (retentionData.status === 'fulfilled') {
        console.log('Retention Data:', retentionData.value);
        setRetention(retentionData.value || []);
        applyRetentionToSummary(retentionData.value || []);
      }

      // Fetch data with date range parameters
      const playtimeParams = new URLSearchParams({
        gameId: currentGame.id,
        startDate: startDateStr,
        endDate: endDateStr
      });
      
      const activeUsersPromise = fetchActiveUsers(new URLSearchParams({
        gameId: currentGame.id,
        startDate: startDateStr,
        endDate: endDateStr
      }));
      const playtimePromise = fetchPlaytime(playtimeParams);
      
      // Fetch player journey with date range
      // Wait for all data fetches to complete
      const [activeUsersResult, playtimeResult] = await Promise.allSettled([activeUsersPromise, playtimePromise]);
      
      if (activeUsersResult.status === 'fulfilled') {
        setActiveUsers(activeUsersResult.value || []);
      } else {
        console.error('Failed to fetch active users:', activeUsersResult.reason);
      }
      
      if (playtimeResult.status === 'fulfilled') {
        console.log('Playtime Data:', playtimeResult.value);
        setPlaytime(playtimeResult.value || []);
      } else {
        console.error('Failed to fetch playtime:', playtimeResult.reason);
      }

      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please check your connection and try again.');
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <RefreshCw size={48} className="spinning" />
        <p>Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <p>{error}</p>
        <button onClick={fetchDashboardData} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`dashboard ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Dashboard Header with Game Info */}
      <div className="dashboard-header">
        <div className="header-main">
          <div className="header-title">
            <h1>Analytics Dashboard</h1>
            {gameInfo && (
              <div className="game-badge">
                <div className="game-badge-row">
                  <span className="game-name">{gameInfo.name}</span>
                  <span className="game-id">ID: {gameInfo.id}</span>
                </div>
                {gameInfo.apiKey && (
                  <div className="game-badge-row api-key-row">
                    <span className="game-api-key">
                      <code>{gameInfo.apiKey}</code>
                    </span>
                    <button 
                      className="copy-api-key-btn"
                      onClick={copyApiKey}
                      title="Copy API Key"
                    >
                      {apiKeyCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {lastUpdated && (
            <div className="last-updated">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
        
        <div className="dashboard-controls">
          <div className="date-range-controls">
            <select 
              value={selectedDateRange} 
              onChange={handleDateRangeChange}
              className="date-range-select"
              disabled={loading || updating}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
            
            {isCustomRange && (
              <div className="custom-date-picker" ref={datePickerRef}>
                {!showDatePicker ? (
                  <button 
                    className="date-picker-trigger"
                    onClick={() => setShowDatePicker(true)}
                    disabled={loading || updating}
                  >
                    {formatDateRange() || 'Select date range'}
                  </button>
                ) : (
                  <div className="date-picker-popup">
                    <div className="date-inputs">
                      <div className="date-input-group">
                        <label>From:</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => {
                            const newStartDate = e.target.value;
                            setCustomStartDate(newStartDate);
                            // If new start date is after end date, adjust end date
                            if (customEndDate && newStartDate > customEndDate) {
                              setCustomEndDate(newStartDate);
                            }
                          }}
                          className="date-input"
                          disabled={loading || updating}
                        />
                      </div>
                      <div className="date-input-group">
                        <label>To:</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => {
                            const newEndDate = e.target.value;
                            setCustomEndDate(newEndDate);
                            // If new end date is before start date, adjust start date
                            if (customStartDate && newEndDate < customStartDate) {
                              setCustomStartDate(newEndDate);
                            }
                          }}
                          className="date-input"
                          disabled={loading || updating}
                        />
                      </div>
                    </div>
                    <div className="date-picker-actions">
                      <button 
                        className="apply-btn"
                        onClick={handleApplyCustomRange}
                        disabled={loading || updating || !customStartDate || !customEndDate || customStartDate > customEndDate}
                      >
                        Apply
                      </button>
                      <button 
                        className="cancel-btn"
                        onClick={() => setShowDatePicker(false)}
                        disabled={loading || updating}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <button 
            className={`refresh-btn ${updating ? 'updating' : ''}`}
            onClick={handleRefresh}
            disabled={loading || updating}
            title="Refresh data"
          >
            <RefreshCw className={loading || updating ? 'spinning' : ''} size={16} />
            {updating ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Subtle updating indicator */}
      {updating && (
        <div className="update-indicator">
          <div className="update-bar"></div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="Total Users"
          value={formatNumber(summary?.totalUsers || 0)}
          icon={<Users />}
          loading={loading}
          description="The total number of unique users who have interacted with your application"
        />
        <MetricCard
          title="New Users"
          value={formatNumber(summary?.newUsers || 0)}
          icon={<Users />}
          loading={loading}
          description="Number of users who used your application for the first time in the selected period"
        />
        <MetricCard
          title="Avg Sessions/User"
          value={summary?.avgSessionsPerUser?.toFixed(1) || '0.0'}
          icon={<Activity />}
          loading={loading}
          description="Average number of sessions per user. Higher values indicate better user engagement"
        />
        <MetricCard
          title="Avg Session Duration"
          value={formatDuration(summary?.avgSessionDuration || 0)}
          icon={<Clock />}
          loading={loading}
          description="Average time users spend in a single session. Longer sessions often indicate higher engagement"
        />
        <MetricCard
          title="Avg Playtime/User"
          value={formatDuration(summary?.avgPlaytimeDuration || 0)}
          icon={<Clock />}
          loading={loading}
          description="Average total playtime per user across all their sessions"
        />
        <MetricCard
          title="Day 1 Retention"
          value={`${(summary?.retentionDay1 || 0).toFixed(1)}%`}
          icon={<TrendingUp />}
          loading={loading}
          description="Percentage of users who return to your application the day after their first visit"
        />
        <MetricCard
          title="Total Sessions"
          value={formatNumber(summary?.totalSessions || 0)}
          icon={<Activity />}
          loading={loading}
          description="Total number of user sessions recorded in the selected time period"
        />
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Active Users Chart */}
        <ChartContainer 
          title="Active Users Trend"
          className="chart-large"
          description="Tracks daily, weekly, and monthly active users over time to measure engagement trends"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activeUsers}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="date"
                stroke={chartColors.text}
                fontSize={12}
              />
              <YAxis
                stroke={chartColors.text}
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
              />
              <Legend wrapperStyle={{ color: chartColors.text }} />
              <Line type="monotone" dataKey="dau" stroke={chartColors.primary} strokeWidth={2} name="DAU" />
              <Line type="monotone" dataKey="wau" stroke={chartColors.secondary} strokeWidth={2} name="WAU" />
              <Line type="monotone" dataKey="mau" stroke={chartColors.tertiary} strokeWidth={2} name="MAU" />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Retention Chart */}
        <ChartContainer 
          title="User Retention" 
          className="chart-medium"
          description="Shows the percentage of users who return to your application over time, indicating user stickiness"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={retention}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis 
                dataKey="day" 
                stroke={chartColors.text}
                fontSize={12}
              />
              <YAxis 
                stroke={chartColors.text}
                fontSize={12}
              />
              <Tooltip 
                formatter={(value) => [`${value}%`, 'Retention Rate']}
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
              />
              <Legend 
                wrapperStyle={{ color: chartColors.text }}
              />
              <Line
                type="monotone"
                dataKey="percentage"
                stroke={chartColors.quaternary}
                strokeWidth={3}
                name="Retention %"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Session Duration Chart */}
        <ChartContainer 
          title="Average Session Duration" 
          className="chart-medium"
          description="Tracks how long users spend in each session on average, helping measure engagement quality"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={playtime}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis 
                dataKey="date" 
                stroke={chartColors.text}
                fontSize={12}
              />
              <YAxis 
                stroke={chartColors.text}
                fontSize={12}
              />
              <Tooltip 
                formatter={(value) => [formatDuration(value as number), 'Duration']}
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
              />
              <Legend 
                wrapperStyle={{ color: chartColors.text }}
              />
              <Line
                type="monotone"
                dataKey="avgSessionDuration"
                stroke={chartColors.primary}
                strokeWidth={2}
                name="Avg Session Duration"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Total Playtime Chart */}
        <ChartContainer 
          title="Total Playtime Trend" 
          className="chart-medium"
          description="Shows the aggregate total time all users spent in your application over time"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={playtime}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis 
                dataKey="date" 
                stroke={chartColors.text}
                fontSize={12}
              />
              <YAxis 
                stroke={chartColors.text}
                fontSize={12}
              />
              <Tooltip 
                formatter={(value) => [formatDuration(value as number), 'Total Playtime']}
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
              />
              <Legend 
                wrapperStyle={{ color: chartColors.text }}
              />
              <Line
                type="monotone"
                dataKey="totalPlaytime"
                stroke={chartColors.secondary}
                strokeWidth={2}
                name="Total Playtime"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Sessions Per User Chart */}
        <ChartContainer 
          title="Sessions Per User" 
          className="chart-medium"
          description="Tracks the average number of sessions each user initiates, indicating engagement frequency"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={playtime}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis 
                dataKey="date" 
                stroke={chartColors.text}
                fontSize={12}
              />
              <YAxis 
                stroke={chartColors.text}
                fontSize={12}
              />
              <Tooltip 
                formatter={(value) => [Number(value).toFixed(1), 'Avg Sessions']}
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
              />
              <Legend 
                wrapperStyle={{ color: chartColors.text }}
              />
              <Line
                type="monotone"
                dataKey="sessionsPerUser"
                stroke={chartColors.tertiary}
                strokeWidth={2}
                name="Sessions Per User"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* User Distribution Pie Chart */}
        <ChartContainer 
          title="User Distribution" 
          className="chart-medium"
          description="Breakdown showing the proportion of new users versus returning users for the selected time period"
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { 
                    name: 'New Users', 
                    value: summary?.newUsers || 0 
                  },
                  { 
                    name: 'Returning Users', 
                    value: (summary?.totalUsers || 0) - (summary?.newUsers || 0)
                  }
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: any) => 
                  percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {[0, 1].map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{
                  backgroundColor: chartColors.background,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: '8px',
                  color: chartColors.text
                }}
                formatter={(value: any) => [formatNumber(value), '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* AI Chat Widget - Floating */}
      <AIChatWidget />
    </div>
  );
};

export default Dashboard;
