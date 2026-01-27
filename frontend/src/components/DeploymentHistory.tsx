import React, { useState, useEffect } from 'react';
import { Clock, GitBranch, RotateCcw, X, FileText } from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import './DeploymentHistory.css';

interface Deployment {
  id: string;
  version: number;
  deployedBy: string;
  deployedAt: string;
  source: string;
  isRollback: boolean;
  rolledBackFrom: string | null;
  configCount: number;
}

interface DiffData {
  added: any[];
  removed: any[];
  modified: any[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
}

interface Props {
  gameId: string;
  environment: 'staging' | 'production';
  onClose: () => void;
  onRollback?: () => void;
  showNotification?: (type: 'success' | 'error' | 'warning', message: string) => void;
}

const DeploymentHistory: React.FC<Props> = ({ gameId, environment, onClose, onRollback, showNotification }) => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackConfirm, setRollbackConfirm] = useState<Deployment | null>(null);
  const [rollbackChecked, setRollbackChecked] = useState(false);
  const [diffData, setDiffData] = useState<{ deployment1: Deployment; deployment2: Deployment; diff: DiffData } | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [gameId, environment]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/config/admin/deployments/${gameId}/${environment}`);
      setDeployments(response.data.data.deployments || []);
    } catch (error) {
      console.error('Failed to fetch deployment history:', error);
      if (showNotification) {
        showNotification('error', 'Failed to load deployment history');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (deployment: Deployment) => {
    if (!rollbackChecked) return;

    try {
      await apiClient.post(`/config/admin/deployments/${deployment.id}/rollback`);
      setRollbackConfirm(null);
      setRollbackChecked(false);
      await fetchHistory();
      if (onRollback) onRollback();
      if (showNotification) {
        showNotification('success', `✅ Rolled back to v${deployment.version}`);
      }
    } catch (error: any) {
      if (showNotification) {
        showNotification('error', error.response?.data?.error || 'Failed to rollback');
      }
    }
  };

  const handleViewDiff = async (deployment: Deployment) => {
    if (deployments.length < 2) return;
    
    const currentIndex = deployments.findIndex(d => d.id === deployment.id);
    if (currentIndex >= deployments.length - 1) return; // Can't compare oldest deployment
    
    // Compare with the NEXT deployment (older version) since deployments are sorted desc by version
    const previousDeployment = deployments[currentIndex + 1];
    
    try {
      // Compare: older version (previous) -> newer version (current deployment)
      const response = await apiClient.get(`/config/admin/deployments/compare/${previousDeployment.id}/${deployment.id}`);
      setDiffData({
        deployment1: previousDeployment,
        deployment2: deployment,
        diff: response.data.data.diff,
      });
    } catch (error) {
      if (showNotification) {
        showNotification('error', 'Failed to load diff');
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getSourceLabel = (source: string) => {
    if (source === 'stash-from-dev') return 'Stashed from dev';
    if (source === 'publish-from-staging') return 'Published from staging';
    if (source === 'rollback') return 'Rollback';
    return source;
  };

  return (
    <div className="deployment-modal-overlay">
      <div className="deployment-modal">
        <div className="deployment-header">
          <h2>
            <Clock size={20} />
            Deployment History - {environment === 'staging' ? 'Staging' : 'Production'}
          </h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="deployment-body">
          {loading ? (
            <div className="deployment-loading">Loading history...</div>
          ) : deployments.length === 0 ? (
            <div className="deployment-empty">No deployments yet</div>
          ) : (
            <div className="deployment-list">
              {deployments.map((deployment, index) => (
                <div key={deployment.id} className={`deployment-item ${index === 0 ? 'current' : ''}`}>
                  <div className="deployment-version">
                    v{deployment.version}
                    {index === 0 && <span className="current-badge">Current</span>}
                    {deployment.isRollback && <span className="rollback-badge">↩ Rollback</span>}
                  </div>
                  
                  <div className="deployment-info">
                    <div className="deployment-source">
                      <GitBranch size={14} />
                      {getSourceLabel(deployment.source)}
                    </div>
                    <div className="deployment-meta">
                      {formatDate(deployment.deployedAt)} by {deployment.deployedBy}
                    </div>
                    <div className="deployment-configs">
                      {deployment.configCount} config{deployment.configCount !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {environment === 'staging' && index !== deployments.length - 1 && (
                    <div className="deployment-actions">
                      <button
                        className="diff-btn"
                        onClick={() => handleViewDiff(deployment)}
                        title="View changes from previous version"
                      >
                        <FileText size={16} />
                        Diff
                      </button>
                      {index !== 0 && (
                        <button
                          className="rollback-btn"
                          onClick={() => setRollbackConfirm(deployment)}
                        >
                          <RotateCcw size={16} />
                          Rollback
                        </button>
                      )}
                    </div>
                  )}

                  {index !== deployments.length - 1 && environment === 'production' && (
                    <button
                      className="diff-btn"
                      onClick={() => handleViewDiff(deployment)}
                      title="View changes from previous version"
                    >
                      <FileText size={16} />
                      Diff
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Diff Modal */}
      {diffData && (
        <div className="diff-modal-overlay">
          <div className="diff-modal">
            <div className="diff-header">
              <h3>
                <FileText size={20} />
                Changes: v{diffData.deployment1.version} → v{diffData.deployment2.version}
              </h3>
              <button className="close-btn" onClick={() => setDiffData(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="diff-body">
              {diffData.diff.addedCount === 0 && diffData.diff.removedCount === 0 && diffData.diff.modifiedCount === 0 ? (
                <div className="diff-empty">No changes between these versions</div>
              ) : (
                <>
                  {diffData.diff.added.length > 0 && (
                    <div className="diff-section">
                      <h4 className="diff-added-title">➕ Added ({diffData.diff.addedCount})</h4>
                      {diffData.diff.added.map((config: any) => (
                        <div key={config.key} className="diff-item diff-added">
                          <strong>{config.key}</strong>
                          <span className="diff-value">= {JSON.stringify(config.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {diffData.diff.removed.length > 0 && (
                    <div className="diff-section">
                      <h4 className="diff-removed-title">➖ Removed ({diffData.diff.removedCount})</h4>
                      {diffData.diff.removed.map((config: any) => (
                        <div key={config.key} className="diff-item diff-removed">
                          <strong>{config.key}</strong>
                          <span className="diff-value">= {JSON.stringify(config.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {diffData.diff.modified.length > 0 && (
                    <div className="diff-section">
                      <h4 className="diff-modified-title">✏️ Modified ({diffData.diff.modifiedCount})</h4>
                      {diffData.diff.modified.map((config: any) => (
                        <div key={config.key} className="diff-item diff-modified">
                          <strong>{config.key}</strong>
                          <div className="diff-change">
                            <span className="diff-old">- {JSON.stringify(config.oldValue)}</span>
                            <span className="diff-new">+ {JSON.stringify(config.newValue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="diff-footer">
              <button className="btn-cancel" onClick={() => setDiffData(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {rollbackConfirm && (
        <div className="rollback-modal-overlay">
          <div className="rollback-modal">
            <div className="rollback-header">
              <h3>⚠️ Rollback to v{rollbackConfirm.version}?</h3>
            </div>
            <div className="rollback-body">
              <div className="rollback-info">
                <p><strong>Version:</strong> v{rollbackConfirm.version}</p>
                <p><strong>Deployed:</strong> {formatDate(rollbackConfirm.deployedAt)}</p>
                <p><strong>By:</strong> {rollbackConfirm.deployedBy}</p>
                <p><strong>Configs:</strong> {rollbackConfirm.configCount}</p>
              </div>
              <div className="rollback-warning">
                <p><strong>This will:</strong></p>
                <ul>
                  <li>Delete all current staging configs</li>
                  <li>Restore configs from v{rollbackConfirm.version}</li>
                  <li>Create new deployment (v{deployments[0].version + 1})</li>
                </ul>
                <p className="rollback-note">
                  You can rollback again to v{deployments[0].version} if needed.
                </p>
              </div>
              <label className="rollback-checkbox">
                <input
                  type="checkbox"
                  checked={rollbackChecked}
                  onChange={(e) => setRollbackChecked(e.target.checked)}
                />
                I understand this will replace staging
              </label>
            </div>
            <div className="rollback-footer">
              <button
                className="btn-cancel"
                onClick={() => {
                  setRollbackConfirm(null);
                  setRollbackChecked(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-rollback"
                disabled={!rollbackChecked}
                onClick={() => handleRollback(rollbackConfirm)}
              >
                <RotateCcw size={16} />
                Rollback to v{rollbackConfirm.version}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeploymentHistory;

