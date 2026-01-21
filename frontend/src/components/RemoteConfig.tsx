import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useGame } from '../contexts/GameContext';
import { AlertCircle, Check, Edit2, Trash2, Plus } from 'lucide-react';
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
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('production');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [jsonError, setJsonError] = useState<JsonError | null>(null);
  const [formData, setFormData] = useState<CreateConfigForm>({
    gameId: currentGame.id,
    key: '',
    value: '',
    dataType: 'string',
    environment: 'production',
    description: '',
    enabled: true,
  });

  // Fetch configs
  const fetchConfigs = async () => {
    if (!currentGame.id || currentGame.id === 'default') return;

    try {
      const response = await apiClient.get(
        `/config/admin/configs/${currentGame.id}?environment=${environment}`
      );
      setConfigs(response.data.data.configs || []);
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

  // Create config as draft
  const handleCreateConfig = async () => {
    if (!formData.gameId || !formData.key || formData.value === '') {
      alert('Please fill all required fields');
      return;
    }

    if (formData.dataType === 'json' && jsonError) {
      alert('Invalid JSON. Please fix the syntax errors.');
      return;
    }

    try {
      const response = await apiClient.post(`/config/admin/drafts`, {
        configId: '', // Empty for new configs - will be handled by backend
        gameId: formData.gameId,
        key: formData.key,
        value: parseValue(formData.value, formData.dataType),
        dataType: formData.dataType,
        environment: formData.environment,
        enabled: formData.enabled,
        description: formData.description,
        changes: {
          value: parseValue(formData.value, formData.dataType),
          enabled: formData.enabled,
          description: formData.description,
        },
      });

      await fetchDrafts();
      setShowCreateModal(false);
      setFormData({
        gameId: currentGame.id,
        key: '',
        value: '',
        dataType: 'string',
        environment: 'production',
        description: '',
        enabled: true,
      });
      setJsonError(null);
      alert('Configuration saved as draft! Review and deploy when ready.');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save draft');
    }
  };

  // Save config changes as draft
  const handleSaveAsDraft = async () => {
    if (!selectedConfig) return;

    if (formData.dataType === 'json' && jsonError) {
      alert('Invalid JSON. Please fix the syntax errors.');
      return;
    }

    try {
      const response = await apiClient.post(
        `/config/admin/drafts`,
        {
          configId: selectedConfig.id,
          gameId: selectedConfig.gameId,
          key: selectedConfig.key,
          value: parseValue(formData.value, formData.dataType),
          dataType: selectedConfig.dataType,
          environment: selectedConfig.environment,
          enabled: selectedConfig.enabled,
          description: formData.description,
          changes: {
            value: parseValue(formData.value, formData.dataType),
            description: formData.description,
          },
        }
      );

      await fetchDrafts();
      setShowEditModal(false);
      setSelectedConfig(null);
      setJsonError(null);
      alert('Changes saved as draft! Review and deploy when ready.');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save draft');
    }
  };

  // Delete config
  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm('Are you sure you want to delete this config?')) return;

    try {
      await apiClient.delete(`/config/admin/configs/${configId}`);
      setConfigs(configs.filter((c) => c.id !== configId));
      alert('Config deleted successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete config');
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
      <div className="config-header">
        <div>
          <h1>Remote Configurations</h1>
          <p className="subtitle">Manage your game configurations and feature flags</p>
        </div>
      </div>

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
        <button onClick={() => setShowCreateModal(true)} className="btn btn-create">
          <Plus size={18} />
          New Configuration
        </button>
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
                    
                    alert(`Deployment complete: ${result.successful.length} deployed${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`);
                  } catch (error: any) {
                    alert('Failed to deploy drafts');
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
                                alert('Draft rejected');
                              } catch (error: any) {
                                alert(error.response?.data?.error || 'Failed to reject draft');
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
                    <td className="col-status">
                      <span className={`status-badge status-${config.enabled ? 'enabled' : 'disabled'}`}>
                        {config.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="col-actions">
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
                      <button
                        onClick={() => handleDeleteConfig(config.id)}
                        className="action-btn delete-btn"
                        title="Delete configuration"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
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

                <div className="form-group">
                  <label>Environment *</label>
                  <select
                    value={formData.environment}
                    onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
                    className="form-select"
                  >
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
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
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Configuration: {selectedConfig.key}</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
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
                  setSelectedConfig({
                    ...selectedConfig,
                    enabled: newEnabledState
                  });
                  
                  try {
                    await apiClient.post(
                      `/config/admin/drafts`,
                      {
                        configId: selectedConfig.id,
                        gameId: selectedConfig.gameId,
                        key: selectedConfig.key,
                        value: parseValue(formData.value, formData.dataType),
                        dataType: selectedConfig.dataType,
                        environment: selectedConfig.environment,
                        enabled: newEnabledState,
                        description: formData.description,
                        changes: {
                          enabled: newEnabledState,
                        },
                      }
                    );
                    await fetchDrafts();
                    setShowEditModal(false);
                    setSelectedConfig(null);
                  } catch (error) {
                    alert('Failed to save configuration');
                  }
                }}
                className={`btn btn-toggle ${selectedConfig.enabled ? 'btn-disable' : 'btn-enable'}`}
              >
                {selectedConfig.enabled ? '🔒 Disable' : '🔓 Enable'}
              </button>
              <button onClick={() => setShowEditModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveAsDraft} className="btn btn-primary">
                <Check size={16} />
                Save as Draft
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
    </div>
  );
};

export default RemoteConfig;

