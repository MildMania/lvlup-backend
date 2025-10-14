import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import { 
  Plus, 
  Calendar, 
  Tag, 
  AlertCircle, 
  Clock,
  GitBranch,
  Bug,
  Megaphone,
  Gift,
  Edit3,
  ChevronDown,
  ChevronUp,
  Info,
  X
} from 'lucide-react';
import './ReleaseManagement.css';

interface Release {
  id: string;
  version: string;
  description?: string;
  releaseDate: string;
  rolloutType: 'full' | 'gradual' | 'beta';
  features: Feature[];
  tags?: string[];
}

interface Feature {
  id: string;
  name: string;
  description?: string;
  type: 'ui_change' | 'gameplay_change' | 'performance' | 'monetization' | 'analytics';
  expectedImpact: 'positive' | 'negative' | 'neutral';
  impactMetrics: string[];
}

interface BusinessEvent {
  id: string;
  name: string;
  description?: string;
  type: string;
  startDate: string;
  endDate?: string;
  impact?: string;
  tags?: string[];
}

interface ReleaseManagementProps {
  isCollapsed?: boolean;
}

const ReleaseManagement: React.FC<ReleaseManagementProps> = ({ isCollapsed = false }) => {
  const [releases, setReleases] = useState<Release[]>([]);
  const [businessEvents, setBusinessEvents] = useState<BusinessEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'releases' | 'events'>('releases');
  const [showAddReleaseModal, setShowAddReleaseModal] = useState(false);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showEditReleaseModal, setShowEditReleaseModal] = useState(false);
  const [showEditEventModal, setShowEditEventModal] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [editingEvent, setEditingEvent] = useState<BusinessEvent | null>(null);
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Form states
  const [releaseForm, setReleaseForm] = useState({
    version: '',
    description: '',
    rolloutType: 'full' as 'full' | 'gradual' | 'beta',
    features: [{
      name: '',
      description: '',
      type: 'ui_change' as 'ui_change' | 'gameplay_change' | 'performance' | 'monetization' | 'analytics',
      expectedImpact: 'positive' as 'positive' | 'negative' | 'neutral',
      impactMetrics: ['']
    }],
    tags: [] as string[],
    newTag: ''
  });

  const [eventForm, setEventForm] = useState({
    name: '',
    description: '',
    type: 'hotfix',
    startDate: '',
    endDate: '',
    impact: '',
    tags: [] as string[],
    newTag: ''
  });

  useEffect(() => {
    fetchReleases();
    fetchBusinessEvents();
  }, []);

  const fetchReleases = async () => {
    try {
      const response = await apiClient.get('/ai-context/releases');
      setReleases(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch releases:', error);
      // For now, set empty array when API is not available
      setReleases([]);
    }
  };

  const fetchBusinessEvents = async () => {
    try {
      const response = await apiClient.get('/ai-context/business-events');
      setBusinessEvents(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch business events:', error);
      // For now, set empty array when API is not available
      setBusinessEvents([]);
    }
  };

  const handleAddRelease = async () => {
    setLoading(true);
    try {
      await apiClient.post('/ai-context/release', {
        version: releaseForm.version,
        description: releaseForm.description,
        rolloutType: releaseForm.rolloutType,
        features: releaseForm.features.filter(f => f.name.trim() !== '')
      });

      // Reset form
      setReleaseForm({
        version: '',
        description: '',
        rolloutType: 'full',
        features: [{
          name: '',
          description: '',
          type: 'ui_change',
          expectedImpact: 'positive',
          impactMetrics: ['']
        }],
        tags: [],
        newTag: ''
      });
      setShowAddReleaseModal(false);
      fetchReleases();
    } catch (error) {
      console.error('Failed to add release:', error);
      alert('Failed to add release. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBusinessEvent = async () => {
    setLoading(true);
    try {
      await apiClient.post('/ai-context/business-event', {
        name: eventForm.name,
        description: eventForm.description,
        type: eventForm.type,
        startDate: eventForm.startDate,
        ...(eventForm.endDate && { endDate: eventForm.endDate }),
        impact: eventForm.impact
      });

      // Reset form
      setEventForm({
        name: '',
        description: '',
        type: 'hotfix',
        startDate: '',
        endDate: '',
        impact: '',
        tags: [],
        newTag: ''
      });
      setShowAddEventModal(false);
      fetchBusinessEvents();
    } catch (error) {
      console.error('Failed to add business event:', error);
      alert('Failed to add business event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addFeature = () => {
    setReleaseForm(prev => ({
      ...prev,
      features: [...prev.features, {
        name: '',
        description: '',
        type: 'ui_change',
        expectedImpact: 'positive',
        impactMetrics: ['']
      }]
    }));
  };

  const updateFeature = (index: number, field: string, value: any) => {
    setReleaseForm(prev => ({
      ...prev,
      features: prev.features.map((feature, i) => 
        i === index ? { ...feature, [field]: value } : feature
      )
    }));
  };

  const removeFeature = (index: number) => {
    setReleaseForm(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const handleEditRelease = (release: Release) => {
    setEditingRelease(release);
    setReleaseForm({
      version: release.version,
      description: release.description || '',
      rolloutType: release.rolloutType,
      features: release.features.length > 0 ? release.features.map(f => ({
        name: f.name,
        description: f.description || '',
        type: f.type,
        expectedImpact: f.expectedImpact,
        impactMetrics: f.impactMetrics
      })) : [{
        name: '',
        description: '',
        type: 'ui_change',
        expectedImpact: 'positive',
        impactMetrics: ['']
      }],
      tags: release.tags || [],
      newTag: ''
    });
    setShowEditReleaseModal(true);
  };

  const handleEditEvent = (event: BusinessEvent) => {
    setEditingEvent(event);
    setEventForm({
      name: event.name,
      description: event.description || '',
      type: event.type,
      startDate: event.startDate.slice(0, 16), // Format for datetime-local input
      endDate: event.endDate ? event.endDate.slice(0, 16) : '',
      impact: event.impact || '',
      tags: event.tags || [],
      newTag: ''
    });
    setShowEditEventModal(true);
  };

  const handleUpdateRelease = async () => {
    if (!editingRelease) return;
    
    setLoading(true);
    try {
      await apiClient.put(`/ai-context/release/${editingRelease.id}`, {
        version: releaseForm.version,
        description: releaseForm.description,
        rolloutType: releaseForm.rolloutType,
        features: releaseForm.features.filter(f => f.name.trim() !== ''),
        tags: releaseForm.tags
      });

      setReleaseForm({
        version: '',
        description: '',
        rolloutType: 'full',
        features: [{
          name: '',
          description: '',
          type: 'ui_change',
          expectedImpact: 'positive',
          impactMetrics: ['']
        }],
        tags: [],
        newTag: ''
      });
      setShowEditReleaseModal(false);
      setEditingRelease(null);
      fetchReleases();
    } catch (error) {
      console.error('Failed to update release:', error);
      alert('Failed to update release. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent) return;
    
    setLoading(true);
    try {
      await apiClient.put(`/ai-context/business-event/${editingEvent.id}`, {
        name: eventForm.name,
        description: eventForm.description,
        type: eventForm.type,
        startDate: eventForm.startDate,
        ...(eventForm.endDate && { endDate: eventForm.endDate }),
        impact: eventForm.impact,
        tags: eventForm.tags
      });

      setEventForm({
        name: '',
        description: '',
        type: 'hotfix',
        startDate: '',
        endDate: '',
        impact: '',
        tags: [],
        newTag: ''
      });
      setShowEditEventModal(false);
      setEditingEvent(null);
      fetchBusinessEvents();
    } catch (error) {
      console.error('Failed to update business event:', error);
      alert('Failed to update business event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addTagToRelease = () => {
    if (releaseForm.newTag.trim() && !releaseForm.tags.includes(releaseForm.newTag.trim())) {
      setReleaseForm(prev => ({
        ...prev,
        tags: [...prev.tags, prev.newTag.trim()],
        newTag: ''
      }));
    }
  };

  const addTagToEvent = () => {
    if (eventForm.newTag.trim() && !eventForm.tags.includes(eventForm.newTag.trim())) {
      setEventForm(prev => ({
        ...prev,
        tags: [...prev.tags, prev.newTag.trim()],
        newTag: ''
      }));
    }
  };

  const removeTagFromRelease = (tagToRemove: string) => {
    setReleaseForm(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const removeTagFromEvent = (tagToRemove: string) => {
    setEventForm(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const toggleReleaseExpansion = (releaseId: string) => {
    setExpandedReleases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(releaseId)) {
        newSet.delete(releaseId);
      } else {
        newSet.add(releaseId);
      }
      return newSet;
    });
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'hotfix': return <Bug className="event-icon hotfix" />;
      case 'promotion': return <Gift className="event-icon promotion" />;
      case 'marketing_campaign': return <Megaphone className="event-icon marketing" />;
      default: return <AlertCircle className="event-icon default" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'positive': return 'success';
      case 'negative': return 'danger';
      default: return 'neutral';
    }
  };

  return (
    <div className={`release-management ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="page-header">
        <div className="header-content">
          <div className="header-text">
            <h1>Release Management</h1>
            <p>Manage releases, features, and business events to provide context for AI analytics</p>
          </div>
          <div className="header-actions">
            <button 
              className="btn btn-secondary"
              onClick={() => setShowAddEventModal(true)}
            >
              <Plus size={20} />
              Add Event
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => setShowAddReleaseModal(true)}
            >
              <Plus size={20} />
              Add Release
            </button>
          </div>
        </div>
      </div>

      <div className="content-tabs">
        <div className="tab-header">
          <button 
            className={`tab ${activeTab === 'releases' ? 'active' : ''}`}
            onClick={() => setActiveTab('releases')}
          >
            <GitBranch size={18} />
            Releases
          </button>
          <button 
            className={`tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            <Calendar size={18} />
            Business Events
          </button>
        </div>

        {activeTab === 'releases' && (
          <div className="tab-content">
            {releases.length === 0 ? (
              <div className="empty-state">
                <GitBranch size={48} />
                <h3>No releases yet</h3>
                <p>Add your first release to help the AI understand your product updates</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowAddReleaseModal(true)}
                >
                  Add Release
                </button>
              </div>
            ) : (
              <div className="releases-grid">
                {releases.map(release => (
                  <div key={release.id} className="release-card">
                    <div className="release-header">
                      <div className="release-version">
                        <Tag size={16} />
                        {release.version}
                      </div>
                      <div className="release-actions">
                        <div className={`rollout-badge ${release.rolloutType}`}>
                          {release.rolloutType}
                        </div>
                        <button
                          className="btn-icon"
                          onClick={() => handleEditRelease(release)}
                          title="Edit Release"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    {release.description && (
                      <div className="release-description">
                        {release.description}
                      </div>
                    )}
                    
                    <div className="release-meta">
                      <div className="release-date">
                        <Calendar size={14} />
                        {new Date(release.releaseDate).toLocaleDateString()}
                      </div>
                      <div className="features-count">
                        {release.features.length} feature{release.features.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Tags */}
                    {release.tags && release.tags.length > 0 && (
                      <div className="tags-container">
                        {release.tags.map(tag => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Features section */}
                    {release.features.length > 0 && (
                      <div className="features-section">
                        <button
                          className="features-toggle"
                          onClick={() => toggleReleaseExpansion(release.id)}
                        >
                          <span>Features</span>
                          {expandedReleases.has(release.id) ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </button>
                        
                        {expandedReleases.has(release.id) && (
                          <div className="features-list">
                            {release.features.map((feature, index) => (
                              <div key={index} className="feature-item">
                                <div className="feature-header">
                                  <span className="feature-name">{feature.name}</span>
                                  <span className={`impact-indicator ${feature.expectedImpact}`}>
                                    {feature.expectedImpact}
                                  </span>
                                </div>
                                {feature.description && (
                                  <div className="feature-description">
                                    {feature.description}
                                  </div>
                                )}
                                <div className="feature-type">
                                  Type: {feature.type.replace('_', ' ')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="tab-content">
            {businessEvents.length === 0 ? (
              <div className="empty-state">
                <Calendar size={48} />
                <h3>No business events yet</h3>
                <p>Track promotions, hotfixes, and campaigns to provide context for analytics</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowAddEventModal(true)}
                >
                  Add Event
                </button>
              </div>
            ) : (
              <div className="events-list">
                {businessEvents.map(event => (
                  <div key={event.id} className="event-card">
                    <div className="event-header">
                      {getEventIcon(event.type)}
                      <div className="event-info">
                        <h3>{event.name}</h3>
                        {event.description && <p>{event.description}</p>}
                      </div>
                      <div className="event-actions">
                        {event.impact && (
                          <div className={`impact-badge ${getImpactColor(event.impact)}`}>
                            {event.impact}
                          </div>
                        )}
                        <button
                          className="btn-icon"
                          onClick={() => handleEditEvent(event)}
                          title="Edit Event"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="event-dates">
                      <Clock size={14} />
                      {new Date(event.startDate).toLocaleDateString()}
                      {event.endDate && (
                        <> - {new Date(event.endDate).toLocaleDateString()}</>
                      )}
                    </div>

                    {/* Tags */}
                    {event.tags && event.tags.length > 0 && (
                      <div className="tags-container">
                        {event.tags.map(tag => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Release Modal */}
      {showAddReleaseModal && (
        <div className="modal-overlay" onClick={() => setShowAddReleaseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Release</h2>
              <button 
                className="modal-close"
                onClick={() => setShowAddReleaseModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>Version</label>
                <input
                  type="text"
                  placeholder="e.g., v2.3.0"
                  value={releaseForm.version}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, version: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Brief description of this release"
                  value={releaseForm.description}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Rollout Type</label>
                <select
                  value={releaseForm.rolloutType}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, rolloutType: e.target.value as any }))}
                >
                  <option value="full">Full Rollout</option>
                  <option value="gradual">Gradual Rollout</option>
                  <option value="beta">Beta Release</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input-container">
                  <div className="tags-list">
                    {releaseForm.tags.map(tag => (
                      <span key={tag} className="tag editable">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTagFromRelease(tag)}
                          className="tag-remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="tag-input-row">
                    <input
                      type="text"
                      placeholder="Add tag (e.g., mobile, performance, ui)"
                      value={releaseForm.newTag}
                      onChange={(e) => setReleaseForm(prev => ({ ...prev, newTag: e.target.value }))}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToRelease();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addTagToRelease}
                      disabled={!releaseForm.newTag.trim()}
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Features</label>
                {releaseForm.features.map((feature, index) => (
                  <div key={index} className="feature-input">
                    <input
                      type="text"
                      placeholder="Feature name"
                      value={feature.name}
                      onChange={(e) => updateFeature(index, 'name', e.target.value)}
                    />
                    <textarea
                      placeholder="Feature description"
                      value={feature.description}
                      onChange={(e) => updateFeature(index, 'description', e.target.value)}
                    />
                    <select
                      value={feature.type}
                      onChange={(e) => updateFeature(index, 'type', e.target.value)}
                    >
                      <option value="ui_change">UI Change</option>
                      <option value="gameplay_change">Gameplay Change</option>
                      <option value="performance">Performance</option>
                      <option value="monetization">Monetization</option>
                      <option value="analytics">Analytics</option>
                    </select>
                    <div className="form-field-group">
                      <label>
                        Expected Impact
                        <button
                          type="button"
                          className="info-tooltip"
                          title="Positive: Improves metrics (engagement, retention, revenue). Neutral: No significant metric change expected. Negative: May temporarily decrease metrics (e.g., UI changes requiring user adaptation)."
                        >
                          <Info size={14} />
                        </button>
                      </label>
                      <select
                        value={feature.expectedImpact}
                        onChange={(e) => updateFeature(index, 'expectedImpact', e.target.value)}
                      >
                        <option value="positive">✅ Positive Impact - Improves metrics</option>
                        <option value="neutral">➖ Neutral Impact - No significant change</option>
                        <option value="negative">⚠️ Negative Impact - May decrease metrics temporarily</option>
                      </select>
                    </div>
                    {releaseForm.features.length > 1 && (
                      <button 
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeFeature(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button 
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addFeature}
                >
                  Add Feature
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAddReleaseModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleAddRelease}
                disabled={loading || !releaseForm.version}
              >
                {loading ? 'Adding...' : 'Add Release'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Business Event Modal */}
      {showAddEventModal && (
        <div className="modal-overlay" onClick={() => setShowAddEventModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Business Event</h2>
              <button 
                className="modal-close"
                onClick={() => setShowAddEventModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>Event Name</label>
                <input
                  type="text"
                  placeholder="e.g., Halloween Promotion"
                  value={eventForm.name}
                  onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Brief description of this event"
                  value={eventForm.description}
                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Event Type</label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="hotfix">Hotfix</option>
                  <option value="promotion">Promotion</option>
                  <option value="marketing_campaign">Marketing Campaign</option>
                  <option value="holiday">Holiday Event</option>
                  <option value="competitor_launch">Competitor Launch</option>
                  <option value="external_event">External Event</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input-container">
                  <div className="tags-list">
                    {eventForm.tags.map(tag => (
                      <span key={tag} className="tag editable">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTagFromEvent(tag)}
                          className="tag-remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="tag-input-row">
                    <input
                      type="text"
                      placeholder="Add tag (e.g., urgent, seasonal, campaign)"
                      value={eventForm.newTag}
                      onChange={(e) => setEventForm(prev => ({ ...prev, newTag: e.target.value }))}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToEvent();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addTagToEvent}
                      disabled={!eventForm.newTag.trim()}
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="datetime-local"
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                
                <div className="form-group">
                  <label>End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Impact</label>
                <input
                  type="text"
                  placeholder="e.g., marketing_boost, performance_fix"
                  value={eventForm.impact}
                  onChange={(e) => setEventForm(prev => ({ ...prev, impact: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAddEventModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleAddBusinessEvent}
                disabled={loading || !eventForm.name || !eventForm.startDate}
              >
                {loading ? 'Adding...' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Release Modal */}
      {showEditReleaseModal && editingRelease && (
        <div className="modal-overlay" onClick={() => setShowEditReleaseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Release: {editingRelease.version}</h2>
              <button 
                className="modal-close"
                onClick={() => setShowEditReleaseModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>Version</label>
                <input
                  type="text"
                  placeholder="e.g., v2.3.0"
                  value={releaseForm.version}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, version: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Brief description of this release"
                  value={releaseForm.description}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Rollout Type</label>
                <select
                  value={releaseForm.rolloutType}
                  onChange={(e) => setReleaseForm(prev => ({ ...prev, rolloutType: e.target.value as any }))}
                >
                  <option value="full">Full Rollout</option>
                  <option value="gradual">Gradual Rollout</option>
                  <option value="beta">Beta Release</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input-container">
                  <div className="tags-list">
                    {releaseForm.tags.map(tag => (
                      <span key={tag} className="tag editable">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTagFromRelease(tag)}
                          className="tag-remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="tag-input-row">
                    <input
                      type="text"
                      placeholder="Add tag (e.g., mobile, performance, ui)"
                      value={releaseForm.newTag}
                      onChange={(e) => setReleaseForm(prev => ({ ...prev, newTag: e.target.value }))}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToRelease();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addTagToRelease}
                      disabled={!releaseForm.newTag.trim()}
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Features</label>
                {releaseForm.features.map((feature, index) => (
                  <div key={index} className="feature-input">
                    <input
                      type="text"
                      placeholder="Feature name"
                      value={feature.name}
                      onChange={(e) => updateFeature(index, 'name', e.target.value)}
                    />
                    <textarea
                      placeholder="Feature description"
                      value={feature.description}
                      onChange={(e) => updateFeature(index, 'description', e.target.value)}
                    />
                    <select
                      value={feature.type}
                      onChange={(e) => updateFeature(index, 'type', e.target.value)}
                    >
                      <option value="ui_change">UI Change</option>
                      <option value="gameplay_change">Gameplay Change</option>
                      <option value="performance">Performance</option>
                      <option value="monetization">Monetization</option>
                      <option value="analytics">Analytics</option>
                    </select>
                    <div className="form-field-group">
                      <label>
                        Expected Impact
                        <button
                          type="button"
                          className="info-tooltip"
                          title="Positive: Improves metrics (engagement, retention, revenue). Neutral: No significant metric change expected. Negative: May temporarily decrease metrics (e.g., UI changes requiring user adaptation)."
                        >
                          <Info size={14} />
                        </button>
                      </label>
                      <select
                        value={feature.expectedImpact}
                        onChange={(e) => updateFeature(index, 'expectedImpact', e.target.value)}
                      >
                        <option value="positive">✅ Positive Impact - Improves metrics</option>
                        <option value="neutral">➖ Neutral Impact - No significant change</option>
                        <option value="negative">⚠️ Negative Impact - May decrease metrics temporarily</option>
                      </select>
                    </div>
                    {releaseForm.features.length > 1 && (
                      <button 
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeFeature(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button 
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addFeature}
                >
                  Add Feature
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowEditReleaseModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleUpdateRelease}
                disabled={loading || !releaseForm.version}
              >
                {loading ? 'Updating...' : 'Update Release'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Business Event Modal */}
      {showEditEventModal && editingEvent && (
        <div className="modal-overlay" onClick={() => setShowEditEventModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Event: {editingEvent.name}</h2>
              <button 
                className="modal-close"
                onClick={() => setShowEditEventModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>Event Name</label>
                <input
                  type="text"
                  placeholder="e.g., Halloween Promotion"
                  value={eventForm.name}
                  onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Brief description of this event"
                  value={eventForm.description}
                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Event Type</label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="hotfix">Hotfix</option>
                  <option value="promotion">Promotion</option>
                  <option value="marketing_campaign">Marketing Campaign</option>
                  <option value="holiday">Holiday Event</option>
                  <option value="competitor_launch">Competitor Launch</option>
                  <option value="external_event">External Event</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input-container">
                  <div className="tags-list">
                    {eventForm.tags.map(tag => (
                      <span key={tag} className="tag editable">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTagFromEvent(tag)}
                          className="tag-remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="tag-input-row">
                    <input
                      type="text"
                      placeholder="Add tag (e.g., urgent, seasonal, campaign)"
                      value={eventForm.newTag}
                      onChange={(e) => setEventForm(prev => ({ ...prev, newTag: e.target.value }))}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToEvent();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addTagToEvent}
                      disabled={!eventForm.newTag.trim()}
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="datetime-local"
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                
                <div className="form-group">
                  <label>End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Impact</label>
                <input
                  type="text"
                  placeholder="e.g., marketing_boost, performance_fix"
                  value={eventForm.impact}
                  onChange={(e) => setEventForm(prev => ({ ...prev, impact: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowEditEventModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleUpdateEvent}
                disabled={loading || !eventForm.name || !eventForm.startDate}
              >
                {loading ? 'Updating...' : 'Update Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReleaseManagement;