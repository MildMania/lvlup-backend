import React, { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, Filter, Search, Clock, User } from 'lucide-react';
import './Events.css';

interface Event {
  id: string;
  eventName: string;
  userId: string;
  sessionId?: string;
  properties?: Record<string, any>;
  timestamp: string; // Event timestamp (validated client time or server time)
  
  // Event metadata
  eventUuid?: string;
  clientTs?: string; // Original client timestamp (milliseconds since epoch)
  serverReceivedAt?: string; // When server received the event
  
  // Device & Platform info
  platform?: string;
  osVersion?: string;
  manufacturer?: string;
  device?: string;
  deviceId?: string;
  
  // App info
  appVersion?: string;
  appBuild?: string;
  sdkVersion?: string;
  
  // Network & Additional
  connectionType?: string;
  sessionNum?: number;
  
  // Geographic location (minimal)
  countryCode?: string;
  
  // Level funnel tracking
  levelFunnel?: string;
  levelFunnelVersion?: number;
  // Revenue event flag
  isRevenueEvent?: boolean;
}

interface EventsProps {
  gameInfo?: {
    id: string;
    name: string;
    apiKey?: string;
  };
  isCollapsed?: boolean;
}

const Events: React.FC<EventsProps> = ({ gameInfo, isCollapsed = false }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // seconds
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEventType, setFilterEventType] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clearedAtTimestamp, setClearedAtTimestamp] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!gameInfo || gameInfo.id === 'default') {
      console.log('[Events] No game selected or default game');
      setLoading(false);
      return;
    }

    setLoading(true); // Always set loading to true at start
    
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      
      // Build query parameters
      const params = new URLSearchParams({
        gameId: gameInfo.id,
        limit: '100',
        sort: 'desc'
      });
      
      // Add search parameter if present
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      // Add event type filter if not 'all'
      if (filterEventType && filterEventType !== 'all') {
        params.append('eventName', filterEventType);
      }
      
      const url = `${apiBaseUrl}/analytics/events?${params.toString()}`;
      
      console.log('[Events] Fetching events from:', url);
      console.log('[Events] Using API Key:', gameInfo.apiKey ? `${gameInfo.apiKey.substring(0, 10)}...` : 'MISSING');
      
      const response = await fetch(url, {
        headers: {
          'X-API-Key': gameInfo.apiKey || ''
        }
      });

      console.log('[Events] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        let eventsData = data.data || data;
        
        // If user has cleared events, filter out events older than the clear timestamp
        if (clearedAtTimestamp) {
          eventsData = eventsData.filter((event: Event) => {
            return event.timestamp > clearedAtTimestamp;
          });
        }
        
        setEvents(eventsData);
        setLastUpdated(new Date());
      } else {
        const errorData = await response.json();
        console.error('[Events] Error response:', errorData);
      }
    } catch (error) {
      console.error('[Events] Error fetching events:', error);
    } finally {
      setLoading(false); // Always reset loading state
    }
  }, [gameInfo, clearedAtTimestamp, searchTerm, filterEventType]);

  // Initial load
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Debounced search and filter - refetch when search or filter changes
  useEffect(() => {
    // Don't refetch immediately on mount
    if (searchTerm === '' && filterEventType === 'all') return;
    
    // Debounce search to avoid excessive API calls
    const debounceTimer = setTimeout(() => {
      fetchEvents();
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, filterEventType]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchEvents]);

  // Manual refresh handler
  const handleRefresh = async () => {
    console.log('[Events] Manual refresh triggered');
    await fetchEvents();
  };

  // Get unique event types for filter - fetch from all events
  // Note: This shows event types from current filtered results
  const eventTypes = ['all', ...Array.from(new Set(events.map(e => e.eventName)))];

  const formatTime = (timestamp: string) => {
    // Handle both ISO string format and millisecond timestamp
    let date: Date;
    if (timestamp.includes('T') || timestamp.includes('-')) {
      // ISO string format (e.g., "2026-01-17T10:30:00.000Z")
      date = new Date(timestamp);
    } else {
      // Millisecond timestamp (e.g., "1737112200000")
      date = new Date(parseInt(timestamp));
    }
    
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    // Handle timestamps that appear to be in the future (edge cases like clock sync issues)
    if (seconds < 0) {
      return 'just now';
    }

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const formatProperties = (props?: Record<string, any>) => {
    if (!props || Object.keys(props).length === 0) return null;
    return JSON.stringify(props, null, 2);
  };

  if (!gameInfo || gameInfo.id === 'default') {
    return (
      <div className="events-page">
        <div className="empty-state">
          <Activity size={64} className="empty-icon" />
          <h2>No Game Selected</h2>
          <p>Please select or create a game to view events</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`events-page ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Header */}
      <div className="events-header">
        <div className="header-top">
          <div className="header-title">
            <Activity size={28} />
            <div>
              <h1>Real-time Events</h1>
              <p className="subtitle">Live event stream for {gameInfo.name}</p>
            </div>
          </div>
          
          {lastUpdated && (
            <div className="last-updated">
              <Clock size={16} />
              <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="events-controls">
          {/* Search */}
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search events or users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter */}
          <div className="filter-box">
            <Filter size={16} />
            <select
              value={filterEventType}
              onChange={(e) => setFilterEventType(e.target.value)}
            >
              {eventTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Events' : type}
                </option>
              ))}
            </select>
          </div>

          {/* Auto-refresh toggle */}
          <div className="auto-refresh-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="interval-select"
              >
                <option value={3}>3s</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            )}
          </div>

          {/* Clear/Reset button */}
          <button
            className="clear-btn"
            onClick={() => {
              if (clearedAtTimestamp) {
                // Reset - show all events again
                setClearedAtTimestamp(null);
                fetchEvents(); // Re-fetch to get all events
              } else {
                // Clear - set timestamp to filter old events
                setClearedAtTimestamp(new Date().toISOString());
                setEvents([]);
              }
              setLastUpdated(new Date());
            }}
            disabled={events.length === 0 && !clearedAtTimestamp}
            title={clearedAtTimestamp ? "Show all events again" : "Clear and track only new events"}
          >
            {clearedAtTimestamp ? '🔄 Reset' : 'Clear'}
          </button>

          {/* Manual refresh */}
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
            title={loading ? "Loading..." : "Refresh events"}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="events-stats">
        <div className="stat-card">
          <span className="stat-label">Total Events</span>
          <span className="stat-value">{events.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Unique Users</span>
          <span className="stat-value">
            {new Set(events.map(e => e.userId)).size}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Event Types</span>
          <span className="stat-value">{eventTypes.length - 1}</span>
        </div>
      </div>

      {/* Events List */}
      <div className="events-container">
        {loading && events.length === 0 ? (
          <div className="loading-state">
            <RefreshCw size={32} className="spinning" />
            <p>Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <Activity size={48} className="empty-icon" />
            <h3>No Events Found</h3>
            <p>
              {searchTerm || filterEventType !== 'all'
                ? 'Try adjusting your filters'
                : 'No events have been tracked yet. Events will appear here in real-time.'}
            </p>
          </div>
        ) : (
          <div className="events-list">
            {events.map((event) => {
              const isLevelEvent = ['level_start', 'level_complete', 'level_failed'].includes(event.eventName);
              return (
              <div key={event.id} className={`event-card ${event.isRevenueEvent ? 'revenue-event' : ''} ${isLevelEvent ? 'level-event' : ''}`}>
                <div className="event-header">
                  <div className="event-name-badge">
                    <Activity size={14} />
                    <span className="event-name">{event.eventName}</span>
                    {event.isRevenueEvent && (
                      <span className="revenue-badge">💰 Revenue</span>
                    )}
                    {isLevelEvent && (
                      <span className="level-badge">🎮 Level</span>
                    )}
                  </div>
                  <span className="event-time">{formatTime(event.serverReceivedAt || event.timestamp)}</span>
                </div>

                <div className="event-summary">
                  <div className="event-detail-item">
                    <User size={14} />
                    <span className="detail-label">User ID:</span>
                    <code className="detail-value">{event.userId}</code>
                  </div>
                  
                  {/* Level-specific info */}
                  {isLevelEvent && event.properties && (
                    <>
                      {event.properties.level !== undefined && (
                        <div className="event-detail-item level-info">
                          <span className="detail-label">Level:</span>
                          <code className="detail-value level-number">{event.properties.level}</code>
                        </div>
                      )}
                      {event.properties.attempt !== undefined && (
                        <div className="event-detail-item">
                          <span className="detail-label">Attempt:</span>
                          <code className="detail-value">{event.properties.attempt}</code>
                        </div>
                      )}
                      {event.properties.duration !== undefined && (
                        <div className="event-detail-item">
                          <span className="detail-label">Duration:</span>
                          <code className="detail-value">{event.properties.duration}s</code>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Revenue-specific info */}
                  {event.isRevenueEvent && event.properties && (
                    <>
                      <div className="event-detail-item revenue-amount">
                        <span className="detail-label">Revenue:</span>
                        <code className="detail-value revenue-value">
                          ${(event.properties.revenueUSD || event.properties.revenue || 0).toFixed(2)} USD
                        </code>
                      </div>
                      
                      {event.eventName === 'ad_impression' && (
                        <>
                          {event.properties.adNetworkName && (
                            <div className="event-detail-item">
                              <span className="detail-label">Ad Network:</span>
                              <code className="detail-value">{event.properties.adNetworkName}</code>
                            </div>
                          )}
                          {event.properties.adFormat && (
                            <div className="event-detail-item">
                              <span className="detail-label">Ad Format:</span>
                              <code className="detail-value">{event.properties.adFormat}</code>
                            </div>
                          )}
                          {event.properties.adPlacement && (
                            <div className="event-detail-item">
                              <span className="detail-label">Placement:</span>
                              <code className="detail-value">{event.properties.adPlacement}</code>
                            </div>
                          )}
                        </>
                      )}
                      
                      {event.eventName === 'in_app_purchase' && (
                        <>
                          {event.properties.productId && (
                            <div className="event-detail-item">
                              <span className="detail-label">Product ID:</span>
                              <code className="detail-value">{event.properties.productId}</code>
                            </div>
                          )}
                          {event.properties.store && (
                            <div className="event-detail-item">
                              <span className="detail-label">Store:</span>
                              <code className="detail-value">{event.properties.store}</code>
                            </div>
                          )}
                          {event.properties.isVerified !== undefined && (
                            <div className="event-detail-item">
                              <span className="detail-label">Verified:</span>
                              <code className="detail-value">{event.properties.isVerified ? '✓ Yes' : '✗ No'}</code>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                  
                  {event.platform && (
                    <div className="event-detail-item">
                      <span className="detail-label">Platform:</span>
                      <code className="detail-value">{event.platform}</code>
                    </div>
                  )}
                  
                  {event.device && (
                    <div className="event-detail-item">
                      <span className="detail-label">Device:</span>
                      <code className="detail-value">{event.device}</code>
                    </div>
                  )}
                  
                  {event.osVersion && (
                    <div className="event-detail-item">
                      <span className="detail-label">OS:</span>
                      <code className="detail-value">{event.osVersion}</code>
                    </div>
                  )}
                  
                  {event.appVersion && (
                    <div className="event-detail-item">
                      <span className="detail-label">App Version:</span>
                      <code className="detail-value">{event.appVersion}{event.appBuild && ` (${event.appBuild})`}</code>
                    </div>
                  )}
                </div>

                {/* Event Details - Collapsible (Technical/Advanced fields) */}
                <details className="event-details-section">
                  <summary>Advanced Details</summary>
                  <div className="details-grid">
                    {event.sessionId && (
                      <div className="detail-item">
                        <span className="detail-label">Session ID:</span>
                        <code className="detail-value">{event.sessionId}</code>
                      </div>
                    )}

                    {event.sessionNum && (
                      <div className="detail-item">
                        <span className="detail-label">Session #:</span>
                        <code className="detail-value">{event.sessionNum}</code>
                      </div>
                    )}

                    {event.platform && (
                      <div className="detail-item">
                        <span className="detail-label">Platform:</span>
                        <code className="detail-value">{event.platform}</code>
                      </div>
                    )}

                    {event.device && (
                      <div className="detail-item">
                        <span className="detail-label">Device:</span>
                        <code className="detail-value">{event.device}</code>
                      </div>
                    )}

                    {event.manufacturer && (
                      <div className="detail-item">
                        <span className="detail-label">Manufacturer:</span>
                        <code className="detail-value">{event.manufacturer}</code>
                      </div>
                    )}

                    {event.osVersion && (
                      <div className="detail-item">
                        <span className="detail-label">OS Version:</span>
                        <code className="detail-value">{event.osVersion}</code>
                      </div>
                    )}

                    {event.appVersion && (
                      <div className="detail-item">
                        <span className="detail-label">App Version:</span>
                        <code className="detail-value">{event.appVersion}{event.appBuild && ` (${event.appBuild})`}</code>
                      </div>
                    )}

                    {event.connectionType && (
                      <div className="detail-item">
                        <span className="detail-label">Connection:</span>
                        <code className="detail-value">{event.connectionType}</code>
                      </div>
                    )}


                    {event.sdkVersion && (
                      <div className="detail-item">
                        <span className="detail-label">SDK Version:</span>
                        <code className="detail-value">{event.sdkVersion}</code>
                      </div>
                    )}

                    {event.deviceId && (
                      <div className="detail-item">
                        <span className="detail-label">Device ID:</span>
                        <code className="detail-value">{event.deviceId}</code>
                      </div>
                    )}

                    {event.eventUuid && (
                      <div className="detail-item">
                        <span className="detail-label">Event UUID:</span>
                        <code className="detail-value">{event.eventUuid}</code>
                      </div>
                    )}

                    <div className="detail-item">
                      <span className="detail-label">Event Timestamp:</span>
                      <code className="detail-value">{new Date(event.timestamp).toISOString()}</code>
                    </div>

                    {event.clientTs && (
                      <div className="detail-item">
                        <span className="detail-label">Client Timestamp (Original):</span>
                        <code className="detail-value">{new Date(Number(event.clientTs)).toISOString()}</code>
                      </div>
                    )}

                    {event.serverReceivedAt && (
                      <div className="detail-item">
                        <span className="detail-label">Server Received At:</span>
                        <code className="detail-value">{new Date(event.serverReceivedAt).toISOString()}</code>
                      </div>
                    )}

                    {/* Geographic Location (minimal) */}
                    {event.countryCode && (
                      <div className="detail-item">
                        <span className="detail-label">Country Code:</span>
                        <code className="detail-value">{event.countryCode}</code>
                      </div>
                    )}
                    
                    {/* Level Funnel (AB Test) */}
                    {event.levelFunnel && (
                      <div className="detail-item">
                        <span className="detail-label">Level Funnel:</span>
                        <code className="detail-value">{event.levelFunnel}</code>
                      </div>
                    )}
                    
                    {event.levelFunnelVersion !== undefined && event.levelFunnelVersion !== null && (
                      <div className="detail-item">
                        <span className="detail-label">Funnel Version:</span>
                        <code className="detail-value">{event.levelFunnelVersion}</code>
                      </div>
                    )}
                  </div>
                </details>

                {event.properties && Object.keys(event.properties).length > 0 && (
                  <details className="event-properties">
                    <summary>Properties ({Object.keys(event.properties).length})</summary>
                    <pre className="properties-json">
                      {formatProperties(event.properties)}
                    </pre>
                  </details>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;

