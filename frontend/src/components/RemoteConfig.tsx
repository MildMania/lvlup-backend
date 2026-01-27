import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useGame } from '../contexts/GameContext';
import { AlertCircle, Check, Edit2, Trash2, Plus, Eye, GitBranch, Clock } from 'lucide-react';
import RuleList from './RuleList';
import ConfigHistory from './ConfigHistory';
import DeploymentHistory from './DeploymentHistory';
import './RemoteConfig.css';

interface Config {
  id: string;
  gameId: string;
  key: string;
  value: any;
  dataType: string;
  environment: string;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateConfigForm {
  gameId: string;
  key: string;
  value: any;
  dataType: 'string' | 'number' | 'boolean' | 'json';
  environment: 'development' | 'staging' | 'production';
  description?: string;
  enabled?: boolean;
}

interface RemoteConfigProps {
  isCollapsed?: boolean;
}

interface JsonError {
  message: string;
  line?: number;
}

interface Draft {
  id: string;
  configId: string;
  key: string;
  value: any;
  dataType: string;
  environment: string;
  enabled: boolean;
  description?: string;
  status: string;
  createdAt: string;
  createdBy: string;
}

const RemoteConfig: React.FC<RemoteConfigProps> = ({ isCollapsed = false }) => {
  const { currentGame } = useGame();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<Config | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [showDraftDetailModal, setShowDraftDetailModal] = useState(false);
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('development');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [showStashModal, setShowStashModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [jsonError, setJsonError] = useState<JsonError | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);
  const [showDeploymentHistory, setShowDeploymentHistory] = useState(false);
  const [deleteConfirmConfig, setDeleteConfirmConfig] = useState<{ id: string; key: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'history'>('overview');
  const [rulesCounts, setRulesCounts] = useState<Map<string, number>>(new Map());
  const [formData, setFormData] = useState<CreateConfigForm>({
    gameId: currentGame.id,
    key: '',
    value: '',
    dataType: 'string',
    environment: 'development',
    description: '',
    enabled: true,
  });

  // Environment permissions
  const canCreate = environment === 'development';
  const canEdit = environment === 'development'; // Only dev is editable
  const canDelete = environment === 'development';
  const canStash = environment === 'development';
  const canPull = environment === 'development'; // Pull from staging back to dev
  const canPublish = environment === 'staging';
  const isReadOnly = environment === 'production' || environment === 'staging'; // Staging is now read-only too

  // Show custom notification instead of browser alert
  const showNotification = (type: 'success' | 'error' | 'warning', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000); // Auto-hide after 5 seconds
  };

  // Fetch configs
  const fetchConfigs = async () => {
    if (!currentGame.id || currentGame.id === 'default') return;

    try {
      const response = await apiClient.get(
        `/config/configs/${currentGame.id}?environment=${environment}`
      );
      setConfigs(response.data.data.configs || []);
      
      // Fetch rules count for each config
      const configsList = response.data.data.configs || [];
      const counts = new Map<string, number>();
      
      for (const config of configsList) {
        try {
          const rulesResponse = await apiClient.get(`/config/configs/${config.id}/rules`);
          const rules = rulesResponse.data.data?.rules || [];
          counts.set(config.id, rules.length);
        } catch (error) {
          // If rules endpoint fails, just set count to 0
          counts.set(config.id, 0);
        }
      }
      
      setRulesCounts(counts);
    } catch (error: any) {
      console.error('Failed to fetch configs:', error);
    }
  };

  // Fetch pending drafts
  const fetchDrafts = async () => {
    if (!currentGame.id || currentGame.id === 'default') return;

    try {
      const response = await apiClient.get(
        `/config/admin/drafts?gameId=${currentGame.id}&environment=${environment}`
      );
      setDrafts(response.data.data.drafts || []);
    } catch (error: any) {
      console.error('Failed to fetch drafts:', error);
    }
  };

  // Validate JSON
  const validateJson = (jsonString: string): JsonError | null => {
    try {
      JSON.parse(jsonString);
      return null;
    } catch (error: any) {
      return {
        message: error.message,
      };
    }
  };

  // Handle value input with validation
  const handleValueChange = (value: string) => {
    setFormData({ ...formData, value });
    
    if (formData.dataType === 'json') {
      setJsonError(validateJson(value));
    }
  };

  // Create config directly (no draft system for direct workflow)
  const handleCreateConfig = async () => {
    if (!formData.gameId || !formData.key || formData.value === '') {
      showNotification('warning', 'Please fill all required fields');
      return;
    }

    if (formData.dataType === 'json' && jsonError) {
      showNotification('error', 'Invalid JSON. Please fix the syntax errors.');
      return;
    }

    try {
      // Direct create in development
      await apiClient.post(`/config/configs`, {
        gameId: formData.gameId,
        key: formData.key,
        value: parseValue(formData.value, formData.dataType),
        dataType: formData.dataType,
        environment: environment, // Use current environment
        enabled: formData.enabled,
        description: formData.description,
      });

      await fetchConfigs();
      setShowCreateModal(false);
      setFormData({
        gameId: currentGame.id,
        key: '',
        value: '',
        dataType: 'string',
        environment: 'development',
        description: '',
        enabled: true,
      });
      setJsonError(null);
      showNotification('success', '✅ Configuration created successfully!');
    } catch (error: any) {
      showNotification('error', error.response?.data?.error || 'Failed to create configuration');
    }
  };

  // Save config changes directly (no draft system)
  const handleSaveConfig = async () => {
    if (!selectedConfig) return;

    if (formData.dataType === 'json' && jsonError) {
      showNotification('error', 'Invalid JSON. Please fix the syntax errors.');
      return;
    }

    try {
      // Direct update
      await apiClient.put(`/config/configs/${selectedConfig.id}`, {
        value: parseValue(formData.value, formData.dataType),
        enabled: selectedConfig.enabled,
        description: formData.description,
      });

      await fetchConfigs();
      setShowEditModal(false);
      setSelectedConfig(null);
      setJsonError(null);
      showNotification('success', '✅ Configuration updated successfully!');
    } catch (error: any) {
      showNotification('error', error.response?.data?.error || 'Failed to update configuration');
    }
  };

  // Delete config
  const handleDeleteConfig = async (configId: string) => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    
    // Show custom confirmation modal
    setDeleteConfirmConfig({ id: configId, key: config.key });
  };

  const confirmDeleteConfig = async () => {
    if (!deleteConfirmConfig) return;

    try {
      await apiClient.delete(`/config/configs/${deleteConfirmConfig.id}`);
      setConfigs(configs.filter((c) => c.id !== deleteConfirmConfig.id));
      showNotification('success', 'Config deleted successfully!');
      setDeleteConfirmConfig(null);
    } catch (error: any) {
      showNotification('error', error.response?.data?.error || 'Failed to delete config');
      setDeleteConfirmConfig(null);
    }
  };

  // Parse values based on type
  const parseValue = (value: any, dataType: string) => {
    switch (dataType) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true' || value === true;
      case 'json':
        try {
          return typeof value === 'string' ? JSON.parse(value) : value;
        } catch {
          return value;
        }
      default:
        return value;
    }
  };

  // Format values for display
  const stringifyValue = (value: any, dataType: string) => {
    if (dataType === 'json') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  // Get display value for table
  const getDisplayValue = (value: any, dataType: string) => {
    if (dataType === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (dataType === 'json') {
      try {
        const jsonStr = JSON.stringify(value);
        return jsonStr.length > 50 ? jsonStr.substring(0, 47) + '...' : jsonStr;
      } catch {
        return 'Invalid JSON';
      }
    }
    return String(value);
  };

  useEffect(() => {
    if (currentGame.id && currentGame.id !== 'default') {
      setFormData(prev => ({ ...prev, gameId: currentGame.id }));
      fetchConfigs();
      fetchDrafts();
    }
  }, [currentGame.id, environment]);

  return (
    <div className={`remote-config-container ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Custom Notification */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          <div className="notification-content">
            {notification.type === 'success' && <Check size={20} />}
            {notification.type === 'error' && <AlertCircle size={20} />}
            {notification.type === 'warning' && <AlertCircle size={20} />}
            <span>{notification.message}</span>
          </div>
          <button 
            className="notification-close" 
            onClick={() => setNotification(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      <div className="config-header">
        <div>
          <h1>Remote Configurations</h1>
          <p className="subtitle">Manage your game configurations and feature flags</p>
        </div>
      </div>

      {/* Environment Workflow Info Banner */}
      {isReadOnly && (
        <div className="environment-banner banner-readonly">
          <AlertCircle size={18} />
          <div>
            <strong>Production Environment (Read-Only)</strong>
            <p>Configurations can only be published to production from staging. No direct edits allowed.</p>
          </div>
        </div>
      )}
      {environment === 'staging' && (
        <div className="environment-banner banner-staging">
          <GitBranch size={18} />
          <div>
            <strong>Staging Environment (Test & Publish)</strong>
            <p>Review and test configurations stashed from development. When ready, publish to production.</p>
          </div>
        </div>
      )}
      {environment === 'development' && (
        <div className="environment-banner banner-development">
          <Edit2 size={18} />
          <div>
            <strong>Development Environment (Full Edit)</strong>
            <p>Create, edit, and delete configurations. Stash to staging when ready for testing.</p>
          </div>
        </div>
      )}

      {/* Controls Section */}
      <div className="config-controls">
        <div className="controls-left">
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as any)}
            className="control-select"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="controls-right">
          {canCreate && (
            <button onClick={() => setShowCreateModal(true)} className="btn btn-create">
              <Plus size={18} />
              New Configuration
            </button>
          )}
          {canPull && (
            <button onClick={() => setShowPullModal(true)} className="btn btn-create" title="Pull changes from staging to development">
              <GitBranch size={18} style={{ transform: 'scaleX(-1)' }} />
              Pull from Staging
            </button>
          )}
          {canStash && (
            <button onClick={() => setShowStashModal(true)} className="btn btn-create">
              <GitBranch size={18} />
              Stash to Staging
            </button>
          )}
          {canPublish && (
            <button onClick={() => {
              setShowPublishModal(true);
              setPublishConfirmed(false);
            }} className="btn btn-create">
              🚀 Publish to Production
            </button>
          )}
          {(environment === 'staging' || environment === 'production') && (
            <button onClick={() => setShowDeploymentHistory(true)} className="btn btn-create">
              <Clock size={18} />
              Deployment History
            </button>
          )}
        </div>
      </div>

      {/* Pending Drafts Section */}
      {drafts.length > 0 && (
        <div className="drafts-section">
          <div className="drafts-header">
            <h2>📋 Pending Drafts ({drafts.length})</h2>
            <div className="drafts-header-actions">
              <button
                onClick={async () => {
                  if (!window.confirm(`Deploy all ${drafts.length} drafts? This will apply all changes to production.`)) {
                    return;
                  }
                  try {
                    const response = await apiClient.post(`/config/admin/drafts/deploy-all`, {
                      draftIds: drafts.map(d => d.id),
                    });
                    
                    const result = response.data.data;
                    await fetchConfigs();
                    await fetchDrafts();
                    
                    showNotification('success', `Deployment complete: ${result.successful.length} deployed${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`);
                  } catch (error: any) {
                    showNotification('error', 'Failed to deploy drafts');
                  }
                }}
                className="btn btn-create"
                title="Deploy all pending drafts"
              >
                🚀 Deploy All
              </button>
              <button
                onClick={() => setShowDraftsPanel(!showDraftsPanel)}
                className="btn btn-sm btn-secondary"
              >
                {showDraftsPanel ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showDraftsPanel && (
            <div className="drafts-table-wrapper">
              <table className="drafts-table">
                <thead>
                  <tr>
                    <th className="draft-col-key">Key</th>
                    <th className="draft-col-current">Current Value</th>
                    <th className="draft-col-new">New Value</th>
                    <th className="draft-col-type">Type</th>
                    <th className="draft-col-info">Created By</th>
                    <th className="draft-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft) => {
                    const currentConfig = configs.find(c => c.id === draft.configId);
                    return (
                      <tr key={draft.id} className="draft-row">
                        <td className="draft-col-key">
                          <span className="draft-key-name">{draft.key}</span>
                        </td>
                        <td className="draft-col-current">
                          <code className="value-code">
                            {currentConfig ? getDisplayValue(currentConfig.value, currentConfig.dataType) : 'N/A'}
                          </code>
                        </td>
                        <td className="draft-col-new">
                          <code className="value-code new-value">
                            {getDisplayValue(draft.value, draft.dataType)}
                          </code>
                        </td>
                        <td className="draft-col-type">
                          <span className={`type-badge type-${draft.dataType}`}>
                            {draft.dataType}
                          </span>
                        </td>
                        <td className="draft-col-info">
                          <div className="draft-meta">
                            <span className="draft-created-by">{draft.createdBy}</span>
                            <span className="draft-date">
                              {new Date(draft.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </td>
                        <td className="draft-col-actions">
                          <button
                            onClick={() => {
                              setSelectedDraft(draft);
                              setShowDraftDetailModal(true);
                            }}
                            className="btn btn-sm btn-info"
                            title="View full values"
                          >
                            View
                          </button>
                          <button
                            onClick={async () => {
                              const reason = prompt('Enter rejection reason:');
                              if (!reason) return;
                              try {
                                await apiClient.post(`/config/admin/drafts/${draft.id}/reject`, { reason });
                                await fetchDrafts();
                                showNotification('success', 'Draft rejected');
                              } catch (error: any) {
                                showNotification('error', error.response?.data?.error || 'Failed to reject draft');
                              }
                            }}
                            className="btn btn-sm btn-danger"
                            title="Reject draft"
                          >
                            ✗
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Config List */}
      <div className="config-card">
        {configs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚙️</div>
            <h3>No Configurations Found</h3>
            <p>Create your first remote configuration to get started</p>
          </div>
        ) : (
          <div className="config-table-wrapper">
            <table className="config-table">
              <thead>
                <tr>
                  <th className="col-key">Configuration Key</th>
                  <th className="col-value">Value</th>
                  <th className="col-type">Type</th>
                  <th className="col-rules">Rules</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id} className="config-row">
                    <td className="col-key">
                      <div className="key-content">
                        <span className="key-name">{config.key}</span>
                        {config.description && (
                          <span className="key-desc">{config.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="col-value">
                      <code className="value-display">{getDisplayValue(config.value, config.dataType)}</code>
                    </td>
                    <td className="col-type">
                      <span className={`type-badge type-${config.dataType}`}>
                        {config.dataType}
                      </span>
                    </td>
                    <td className="col-rules">
                      {rulesCounts.get(config.id) ? (
                        <span className="rules-badge" title={`${rulesCounts.get(config.id)} override rule(s)`}>
                          <GitBranch size={14} />
                          {rulesCounts.get(config.id)}
                        </span>
                      ) : (
                        <span className="rules-badge rules-none">—</span>
                      )}
                    </td>
                    <td className="col-status">
                      <span className={`status-badge status-${config.enabled ? 'enabled' : 'disabled'}`}>
                        {config.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="col-actions">
                      <button
                        onClick={() => {
                          setShowEditModal(false);
                          setSelectedConfig(config);
                          setActiveTab('overview');
                        }}
                        className="action-btn view-btn"
                        title="View configuration details"
                      >
                        <Eye size={16} />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => {
                            setSelectedConfig(config);
                            setFormData({
                              gameId: config.gameId,
                              key: config.key,
                              dataType: config.dataType as 'string' | 'number' | 'boolean' | 'json',
                              environment: config.environment as 'development' | 'staging' | 'production',
                              value: stringifyValue(config.value, config.dataType),
                              description: config.description,
                              enabled: config.enabled,
                            });
                            setJsonError(null);
                            setShowEditModal(true);
                          }}
                          className="action-btn edit-btn"
                          title="Edit configuration"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          className="action-btn delete-btn"
                          title="Delete configuration"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config Detail Panel */}
      {selectedConfig && !showEditModal && (
        <div className="modal-overlay" onClick={() => setSelectedConfig(null)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div>
                <h2>{selectedConfig.key}</h2>
              </div>
              <button
                onClick={() => setSelectedConfig(null)}
                className="modal-close"
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div className="config-detail-tabs">
              {['overview', 'rules', 'history'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`config-detail-tab ${activeTab === tab ? 'active' : ''}`}
                >
                  {tab === 'overview' && 'Overview'}
                  {tab === 'rules' && 'Rules'}
                  {tab === 'history' && 'History'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="modal-body">
            {activeTab === 'overview' && (
              <div className="detail-overview">
                <div className="detail-grid">
                  <div className="detail-item">
                    <label className="detail-label">Type</label>
                    <p className="detail-value">{selectedConfig.dataType}</p>
                  </div>
                  <div className="detail-item">
                    <label className="detail-label">Environment</label>
                    <p className="detail-value">{selectedConfig.environment}</p>
                  </div>
                  <div className="detail-item">
                    <label className="detail-label">Status</label>
                    <p className={`detail-value ${selectedConfig.enabled ? 'status-enabled-text' : 'status-disabled-text'}`}>
                      {selectedConfig.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="detail-item">
                    <label className="detail-label">Last Updated</label>
                    <p className="detail-value">{new Date(selectedConfig.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="detail-section">
                  <label className="detail-label">Current Value</label>
                  <pre className="detail-code">{JSON.stringify(selectedConfig.value, null, 2)}</pre>
                </div>
              </div>
            )}

            {activeTab === 'rules' && (
              <RuleList
                configId={selectedConfig.id}
                configDataType={selectedConfig.dataType}
                currentValue={selectedConfig.value}
                environment={environment}
                onRulesChange={() => fetchConfigs()}
              />
            )}

            {activeTab === 'history' && (
              <ConfigHistory
                configKey={selectedConfig.key}
                gameId={selectedConfig.gameId}
                onRollback={() => {
                  setSelectedConfig(null);
                  fetchConfigs();
                }}
              />
            )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Configuration</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Configuration Key *</label>
                <input
                  type="text"
                  placeholder="e.g., daily_reward_amount"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Data Type *</label>
                  <select
                    value={formData.dataType}
                    onChange={(e) => {
                      setFormData({ ...formData, dataType: e.target.value as any, value: '' });
                      setJsonError(null);
                    }}
                    className="form-select"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Value *</label>
                {formData.dataType === 'boolean' ? (
                  <select
                    value={String(formData.value)}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select a value</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : formData.dataType === 'json' ? (
                  <>
                    <textarea
                      placeholder='{"key": "value"}'
                      value={formData.value}
                      onChange={(e) => handleValueChange(e.target.value)}
                      className={`form-textarea json-editor ${jsonError ? 'json-error' : ''}`}
                      rows={15}
                    />
                    {jsonError && (
                      <div className="json-error-message">
                        <AlertCircle size={16} />
                        <span>{jsonError.message}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type={formData.dataType === 'number' ? 'number' : 'text'}
                    placeholder="Enter value"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="form-input"
                  />
                )}
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Optional description of this configuration"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreateConfig} className="btn btn-primary">
                <Plus size={16} />
                Create Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedConfig && (
        <div className="modal-overlay" onClick={() => {
          setShowEditModal(false);
          setSelectedConfig(null);
          setActiveTab('overview');
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Configuration: {selectedConfig.key}</h2>
              <button className="modal-close" onClick={() => {
                setShowEditModal(false);
                setSelectedConfig(null);
                setActiveTab('overview');
              }}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Key (Read-only)</label>
                <div className="readonly-field">{selectedConfig.key}</div>
              </div>

              <div className="form-group">
                <label>Data Type (Read-only)</label>
                <div className="readonly-field">{selectedConfig.dataType}</div>
              </div>

              <div className="form-group">
                <label>Status</label>
                <div className="status-display">
                  <span className={`status-badge status-${selectedConfig.enabled ? 'enabled' : 'disabled'}`}>
                    {selectedConfig.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label>Value *</label>
                {selectedConfig.dataType === 'boolean' ? (
                  <select
                    value={String(formData.value)}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="form-select"
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : selectedConfig.dataType === 'json' ? (
                  <>
                    <textarea
                      placeholder='{"key": "value"}'
                      value={formData.value}
                      onChange={(e) => handleValueChange(e.target.value)}
                      className={`form-textarea json-editor ${jsonError ? 'json-error' : ''}`}
                      rows={15}
                    />
                    {jsonError && (
                      <div className="json-error-message">
                        <AlertCircle size={16} />
                        <span>{jsonError.message}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type={selectedConfig.dataType === 'number' ? 'number' : 'text'}
                    placeholder="Enter value"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="form-input"
                  />
                )}
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Optional description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={async () => {
                  const newEnabledState = !selectedConfig.enabled;
                  
                  try {
                    // Direct update of enabled state
                    await apiClient.put(`/config/configs/${selectedConfig.id}`, {
                      value: parseValue(formData.value, formData.dataType),
                      enabled: newEnabledState,
                      description: formData.description,
                    });
                    
                    await fetchConfigs();
                    setShowEditModal(false);
                    setSelectedConfig(null);
                    showNotification('success', '✅ Configuration updated successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to update configuration');
                  }
                }}
                className={`btn btn-toggle ${selectedConfig.enabled ? 'btn-disable' : 'btn-enable'}`}
              >
                {selectedConfig.enabled ? '🔒 Disable' : '🔓 Enable'}
              </button>
              <button onClick={() => {
                setShowEditModal(false);
                setSelectedConfig(null);
                setActiveTab('overview');
              }} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveConfig} className="btn btn-primary">
                <Check size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Detail Modal */}
      {showDraftDetailModal && selectedDraft && (
        <div className="modal-overlay" onClick={() => setShowDraftDetailModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Draft Details: {selectedDraft.key}</h2>
              <button className="modal-close" onClick={() => setShowDraftDetailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="draft-detail-section">
                <h3>Current Value</h3>
                <pre className="value-preview">
                  {stringifyValue(
                    configs.find(c => c.id === selectedDraft.configId)?.value,
                    selectedDraft.dataType
                  )}
                </pre>
              </div>

              <div className="draft-detail-section">
                <h3>New Value (Draft)</h3>
                <pre className="value-preview new-value-preview">
                  {stringifyValue(selectedDraft.value, selectedDraft.dataType)}
                </pre>
              </div>

              <div className="draft-detail-row">
                <div className="draft-detail-item">
                  <label>Type</label>
                  <span className={`type-badge type-${selectedDraft.dataType}`}>
                    {selectedDraft.dataType}
                  </span>
                </div>
                <div className="draft-detail-item">
                  <label>Created By</label>
                  <span>{selectedDraft.createdBy}</span>
                </div>
                <div className="draft-detail-item">
                  <label>Created At</label>
                  <span>{new Date(selectedDraft.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowDraftDetailModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stash to Staging Modal */}
      {showStashModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Stash to Staging</h2>
              <button className="modal-close" onClick={() => setShowStashModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="stash-info">
                <GitBranch size={24} />
                {configs.length > 0 ? (
                  <>
                    <p>
                      This will <strong>REPLACE ALL</strong> staging configurations with 
                      <strong> {configs.length}</strong> configuration(s) from <strong>Development</strong>.
                    </p>
                    <p className="stash-warning">
                      ⚠️ <strong>Complete Replacement:</strong> All existing staging configs will be deleted first, 
                      then replaced with development configs. Any deleted configs in development will also be removed from staging.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      This will <strong>DELETE ALL</strong> configurations from <strong>Staging</strong>.
                    </p>
                    <p className="stash-warning">
                      ⚠️ <strong>Warning:</strong> Development has 0 configs. Stashing will clear all configs from staging.
                    </p>
                  </>
                )}
              </div>
              {configs.length > 0 && (
                <div className="config-list-preview">
                  <h4>Configs to stash:</h4>
                  <ul>
                    {configs.slice(0, 10).map(config => (
                      <li key={config.id}>{config.key}</li>
                    ))}
                    {configs.length > 10 && <li>... and {configs.length - 10} more</li>}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowStashModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    // Call backend API to stash configs from dev to staging
                    await apiClient.post('/config/admin/stash-to-staging', {
                      gameId: currentGame.id,
                      configIds: configs.map(c => c.id),
                    });
                    setShowStashModal(false);
                    showNotification('success', '✅ Configurations stashed to staging successfully!');
                    // Switch to staging to view
                    setEnvironment('staging');
                    // Refresh configs
                    await fetchConfigs();
                  } catch (error: any) {
                    showNotification('error', error.response?.data?.error || 'Failed to stash configurations');
                  }
                }}
                className="btn btn-primary"
              >
                <GitBranch size={16} />
                Stash to Staging
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull from Staging Modal */}
      {showPullModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Pull from Staging</h2>
              <button className="modal-close" onClick={() => setShowPullModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="stash-info">
                <GitBranch size={24} style={{ transform: 'scaleX(-1)' }} />
                <p>
                  This will <strong>REPLACE ALL</strong> development configurations with 
                  configurations from <strong>Staging</strong>.
                </p>
                <p className="stash-warning">
                  ⚠️ <strong>Complete Replacement:</strong> All existing development configs will be deleted first, 
                  then replaced with staging configs. Use this to sync tested changes back to development.
                </p>
              </div>
              <div className="config-list-preview">
                <h4>This will fetch all staging configs</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Click below to completely replace development with staging configurations.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowPullModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    // Fetch staging configs
                    const stagingResponse = await apiClient.get(
                      `/config/configs/${currentGame.id}?environment=staging`
                    );
                    const stagingConfigs = stagingResponse.data.data.configs || [];
                    
                    if (stagingConfigs.length === 0) {
                      showNotification('warning', 'No configurations found in staging to pull.');
                      setShowPullModal(false);
                      return;
                    }

                    // Call backend API to pull from staging to dev
                    await apiClient.post('/config/admin/pull-from-staging', {
                      gameId: currentGame.id,
                      configIds: stagingConfigs.map((c: any) => c.id),
                    });
                    setShowPullModal(false);
                    showNotification('success', `✅ ${stagingConfigs.length} configuration(s) pulled from staging to development successfully!`);
                    // Refresh configs in development
                    await fetchConfigs();
                  } catch (error: any) {
                    showNotification('error', error.response?.data?.error || 'Failed to pull configurations from staging');
                  }
                }}
                className="btn btn-primary"
              >
                <GitBranch size={16} style={{ transform: 'scaleX(-1)' }} />
                Pull from Staging
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish to Production Modal */}
      {showPublishModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🚀 Publish to Production</h2>
              <button className="modal-close" onClick={() => {
                setShowPublishModal(false);
                setPublishConfirmed(false);
              }}>×</button>
            </div>
            <div className="modal-body">
              <div className="publish-info">
                <AlertCircle size={24} color="#e74c3c" />
                {configs.length > 0 ? (
                  <>
                    <p>
                      You are about to <strong>REPLACE ALL</strong> production configurations with 
                      <strong> {configs.length}</strong> configuration(s) from <strong>Staging</strong>.
                    </p>
                    <p className="publish-warning">
                      ⚠️ <strong>THIS WILL AFFECT LIVE USERS IMMEDIATELY!</strong> All existing production configs 
                      will be deleted first, then replaced with staging configs. Ensure all configs have been tested in staging.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      You are about to <strong>DELETE ALL</strong> configurations from <strong>Production</strong>.
                    </p>
                    <p className="publish-warning">
                      🚨 <strong>CRITICAL: THIS WILL AFFECT LIVE USERS IMMEDIATELY!</strong> Staging has 0 configs. 
                      Publishing will remove all configs from production.
                    </p>
                  </>
                )}
              </div>
              {configs.length > 0 && (
                <div className="config-list-preview">
                  <h4>Configs to publish:</h4>
                  <ul>
                    {configs.slice(0, 10).map(config => (
                      <li key={config.id}>
                        <strong>{config.key}</strong>: {getDisplayValue(config.value, config.dataType)}
                      </li>
                    ))}
                    {configs.length > 10 && <li>... and {configs.length - 10} more</li>}
                  </ul>
                </div>
              )}
              <div className="publish-confirmation">
                <label>
                  <input
                    type="checkbox"
                    checked={publishConfirmed}
                    onChange={(e) => setPublishConfirmed(e.target.checked)}
                  />
                  {configs.length > 0 
                    ? 'I understand this will completely replace production immediately'
                    : 'I understand this will DELETE ALL production configs immediately'
                  }
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => {
                setShowPublishModal(false);
                setPublishConfirmed(false);
              }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                disabled={!publishConfirmed}
                onClick={async () => {
                  if (!publishConfirmed) return;
                  
                  try {
                    // Call backend API to publish configs from staging to production
                    await apiClient.post('/config/admin/publish-to-production', {
                      gameId: currentGame.id,
                      configIds: configs.map(c => c.id),
                    });
                    setShowPublishModal(false);
                    setPublishConfirmed(false);
                    showNotification('success', '✅ Configurations published to production successfully!');
                    // Switch to production to view
                    setEnvironment('production');
                    // Refresh configs
                    await fetchConfigs();
                  } catch (error: any) {
                    console.error('Publish error:', error);
                    showNotification('error', error.response?.data?.error || 'Failed to publish configurations');
                  }
                }}
                className="btn btn-danger"
                style={{ opacity: publishConfirmed ? 1 : 0.5 }}
              >
                🚀 Publish to Production
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deployment History Modal */}
      {showDeploymentHistory && (
        <DeploymentHistory
          gameId={currentGame.id}
          environment={environment as 'staging' | 'production'}
          onClose={() => setShowDeploymentHistory(false)}
          onRollback={async () => {
            await fetchConfigs();
            showNotification('success', '✅ Rollback completed successfully!');
          }}
          showNotification={showNotification}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmConfig && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗑️ Delete Configuration</h2>
              <button className="modal-close" onClick={() => setDeleteConfirmConfig(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="delete-confirm-info">
                <AlertCircle size={48} color="#e74c3c" />
                <p>
                  Are you sure you want to delete the configuration:
                </p>
                <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: '10px 0' }}>
                  "{deleteConfirmConfig.key}"
                </p>
                <p className="delete-warning">
                  ⚠️ This action cannot be undone. The configuration will be permanently deleted from <strong>{environment}</strong>.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setDeleteConfirmConfig(null)} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteConfig}
                className="btn btn-danger"
              >
                Delete Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemoteConfig;
