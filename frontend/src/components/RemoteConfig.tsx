import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useGame } from '../contexts/GameContext';
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
}

interface RemoteConfigProps {
  isCollapsed?: boolean;
}

const RemoteConfig: React.FC<RemoteConfigProps> = ({ isCollapsed = false }) => {
  const { currentGame } = useGame();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('production');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<CreateConfigForm>({
    gameId: currentGame.id,
    key: '',
    value: '',
    dataType: 'string',
    environment: 'production',
    description: '',
  });


  // Fetch configs
  const fetchConfigs = async () => {
    if (!currentGame.id || currentGame.id === 'default') return;

    setLoading(true);
    try {
      const response = await apiClient.get(
        `/config/admin/configs/${currentGame.id}?environment=${environment}`
      );
      setConfigs(response.data.data.configs || []);
    } catch (error: any) {
      console.error('Failed to fetch configs:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
    }
    setLoading(false);
  };

  // Create config
  const handleCreateConfig = async () => {
    if (!formData.gameId || !formData.key || formData.value === '') {
      alert('Please fill all required fields');
      return;
    }

    try {
      const response = await apiClient.post(`/config/admin/configs`, {
        ...formData,
        value: parseValue(formData.value, formData.dataType),
      });

      setConfigs([...configs, response.data.data]);
      setShowCreateModal(false);
      setFormData({
        gameId: currentGame.id,
        key: '',
        value: '',
        dataType: 'string',
        environment: 'production',
        description: '',
      });
      alert('Config created successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create config');
    }
  };

  // Update config
  const handleUpdateConfig = async () => {
    if (!selectedConfig) return;

    try {
      const response = await apiClient.put(
        `/config/admin/configs/${selectedConfig.id}`,
        {
          value: parseValue(formData.value, formData.dataType),
          enabled: true,
          description: formData.description,
        }
      );

      setConfigs(
        configs.map((c) => (c.id === selectedConfig.id ? response.data.data : c))
      );
      setShowEditModal(false);
      setSelectedConfig(null);
      alert('Config updated successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update config');
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

  // Helper to parse values based on type
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

  // Helper to stringify values for display
  const stringifyValue = (value: any, dataType: string) => {
    if (dataType === 'json') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  useEffect(() => {
    if (currentGame.id && currentGame.id !== 'default') {
      setFormData(prev => ({ ...prev, gameId: currentGame.id }));
      fetchConfigs();
    }
  }, [currentGame.id, environment]);

  return (
    <div className={`remote-config-container ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <h1>Remote Config Manager</h1>

      {/* Controls Section */}
      <div className="search-section">
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as any)}
          className="select"
        >
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-success">
          + New Config
        </button>
      </div>

      {/* Config List */}
      <div className="config-list">
        <h2>Configs ({configs.length})</h2>
        {configs.length === 0 ? (
          <p className="empty-message">No configs found. Create one to get started!</p>
        ) : (
          <table className="config-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Type</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => (
                <tr key={config.id}>
                  <td>{config.key}</td>
                  <td className="value-cell">{stringifyValue(config.value, config.dataType)}</td>
                  <td>{config.dataType}</td>
                  <td>{config.enabled ? '✓' : '✗'}</td>
                  <td className="actions">
                    <button
                      onClick={() => {
                        setSelectedConfig(config);
                        setFormData({
                          ...config,
                          value: stringifyValue(config.value, config.dataType),
                        });
                        setShowEditModal(true);
                      }}
                      className="btn btn-sm btn-info"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="btn btn-sm btn-danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Create New Config</h2>
            <input
              type="text"
              placeholder="Key"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              className="input"
            />
            <select
              value={formData.dataType}
              onChange={(e) => setFormData({ ...formData, dataType: e.target.value as any })}
              className="select"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="json">JSON</option>
            </select>
            <input
              type="text"
              placeholder="Value"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              className="input"
            />
            <textarea
              placeholder="Description (optional)"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="textarea"
            />
            <select
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
              className="select"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
            <div className="modal-actions">
              <button onClick={handleCreateConfig} className="btn btn-success">
                Create
              </button>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedConfig && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Edit Config: {selectedConfig.key}</h2>
            <input
              type="text"
              placeholder="Value"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              className="input"
            />
            <textarea
              placeholder="Description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="textarea"
            />
            <div className="modal-actions">
              <button onClick={handleUpdateConfig} className="btn btn-success">
                Update
              </button>
              <button onClick={() => setShowEditModal(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemoteConfig;

