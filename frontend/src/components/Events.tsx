import React, { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, Filter, Search, Clock, User, Gamepad2 } from 'lucide-react';
import './Events.css';

interface Event {
  id: string;
  eventName: string;
  userId: string;
  sessionId?: string;
  properties?: Record<string, any>;
  timestamp: string;
  
  // Event metadata
  eventUuid?: string;
  clientTs?: number;
  
  // Device & Platform info
  platform?: string;
  osVersion?: string;
  manufacturer?: string;
  device?: string;
  deviceId?: string;
  
  // App info
  appVersion?: string;
  appBuild?: string;
  bundleId?: string;
  engineVersion?: string;
  sdkVersion?: string;
  
  // Network & Additional
  connectionType?: string;
  sessionNum?: number;
  appSignature?: string;
  channelId?: string;
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
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // seconds
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEventType, setFilterEventType] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!gameInfo || gameInfo.id === 'default') {
      console.log('[Events] No game selected or default game');
      return;
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      const url = `${apiBaseUrl}/analytics/events?limit=100&sort=desc`;
      
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
        console.log('[Events] Response data:', data);
        
        const eventsData = data.data || data;
        console.log('[Events] Events data:', eventsData);
        console.log('[Events] Number of events:', eventsData?.length || 0);
        
        setEvents(eventsData);
        setLastUpdated(new Date());
      } else {
        const errorData = await response.json();
        console.error('[Events] Error response:', errorData);
      }
    } catch (error) {
      console.error('[Events] Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  }, [gameInfo]);

  // Initial load
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchEvents]);

  // Filter events
  const filteredEvents = events.filter(event => {
    const matchesSearch = searchTerm === '' || 
      event.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterEventType === 'all' || 
      event.eventName === filterEventType;

    return matchesSearch && matchesFilter;
  });

  // Get unique event types for filter
  const eventTypes = ['all', ...Array.from(new Set(events.map(e => e.eventName)))];

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

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

          {/* Manual refresh */}
          <button
            className="refresh-btn"
            onClick={() => fetchEvents()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            Refresh
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
          <span className="stat-label">Filtered Events</span>
          <span className="stat-value">{filteredEvents.length}</span>
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
        ) : filteredEvents.length === 0 ? (
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
            {filteredEvents.map((event) => (
              <div key={event.id} className="event-card">
                <div className="event-header">
                  <div className="event-name-badge">
                    <Activity size={14} />
                    <span className="event-name">{event.eventName}</span>
                  </div>
                  <span className="event-time">{formatTime(event.timestamp)}</span>
                </div>

                <div className="event-summary">
                  <div className="event-detail-item">
                    <User size={14} />
                    <span className="detail-label">User ID:</span>
                    <code className="detail-value">{event.userId}</code>
                  </div>
                </div>

                {/* Event Details - Collapsible */}
                <details className="event-details-section">
                  <summary>Event Details</summary>
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

                    {event.engineVersion && (
                      <div className="detail-item">
                        <span className="detail-label">Engine:</span>
                        <code className="detail-value">{event.engineVersion}</code>
                      </div>
                    )}

                    {event.bundleId && (
                      <div className="detail-item">
                        <span className="detail-label">Bundle ID:</span>
                        <code className="detail-value">{event.bundleId}</code>
                      </div>
                    )}

                    {event.channelId && (
                      <div className="detail-item">
                        <span className="detail-label">Channel:</span>
                        <code className="detail-value">{event.channelId}</code>
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

                    {event.clientTs && (
                      <div className="detail-item">
                        <span className="detail-label">Client Timestamp:</span>
                        <code className="detail-value">{new Date(Number(event.clientTs)).toISOString()}</code>
                      </div>
                    )}

                    {event.appSignature && (
                      <div className="detail-item">
                        <span className="detail-label">App Signature:</span>
                        <code className="detail-value">{event.appSignature}</code>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;

