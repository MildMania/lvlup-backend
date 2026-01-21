import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import './RemoteConfigRules.css';

interface Rule {
  id: string;
  configId: string;
  priority: number;
  overrideValue: any;
  enabled: boolean;
  platformCondition?: string;
  versionOperator?: string;
  versionValue?: string;
  countryCondition?: string;
  activeAfter?: string;
  activeBetweenStart?: string;
  activeBetweenEnd?: string;
  createdAt: string;
}

interface CreateRuleForm {
  priority: number;
  overrideValue: any;
  platformCondition?: string;
  versionOperator?: string;
  versionValue?: string;
  countryCondition?: string;
  activeAfter?: string;
  activeBetweenStart?: string;
  activeBetweenEnd?: string;
}

interface RemoteConfigRulesProps {
  configId: string;
  onClose?: () => void;
}

const RemoteConfigRules: React.FC<RemoteConfigRulesProps> = ({ configId }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateRuleForm>({
    priority: 1,
    overrideValue: '',
  });

  // ...existing code...

  // Fetch rules
  const fetchRules = async () => {
    if (!configId) return;

    setLoading(true);
    try {
      const response = await apiClient.get(
        `/config/configs/${configId}/rules`
      );
      setRules(response.data.data.rules || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    }
    setLoading(false);
  };

  // Create rule
  const handleCreateRule = async () => {
    if (formData.priority === undefined || formData.overrideValue === '') {
      alert('Please fill priority and override value');
      return;
    }

    try {
      const response = await apiClient.post(
        `/config/configs/${configId}/rules`,
        {
          ...formData,
          overrideValue: parseFloat(formData.overrideValue),
        }
      );

      setRules([...rules, response.data.data]);
      setShowCreateModal(false);
      setFormData({
        priority: rules.length + 1,
        overrideValue: '',
      });
      alert('Rule created successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create rule');
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure?')) return;

    try {
      await apiClient.delete(
        `/config/configs/${configId}/rules/${ruleId}`
      );
      setRules(rules.filter((r) => r.id !== ruleId));
      alert('Rule deleted successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete rule');
    }
  };

  const getConditionSummary = (rule: Rule): string => {
    const parts: string[] = [];

    if (rule.platformCondition) parts.push(`Platform: ${rule.platformCondition}`);
    if (rule.versionOperator && rule.versionValue)
      parts.push(`Version: ${rule.versionOperator} ${rule.versionValue}`);
    if (rule.countryCondition) parts.push(`Country: ${rule.countryCondition}`);
    if (rule.activeAfter) parts.push(`After: ${new Date(rule.activeAfter).toLocaleDateString()}`);
    if (rule.activeBetweenStart && rule.activeBetweenEnd)
      parts.push(
        `Between: ${new Date(rule.activeBetweenStart).toLocaleDateString()} - ${new Date(
          rule.activeBetweenEnd
        ).toLocaleDateString()}`
      );

    return parts.length > 0 ? parts.join(' | ') : 'No conditions';
  };

  useEffect(() => {
    fetchRules();
  }, [configId]);

  return (
    <div className="rules-container">
      <div className="rules-header">
        <h2>Rules for Config</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-success btn-sm">
          + Add Rule
        </button>
      </div>

      {loading ? (
        <p>Loading rules...</p>
      ) : rules.length === 0 ? (
        <p className="empty-message">No rules configured. Create one to get started!</p>
      ) : (
        <div className="rules-list">
          {rules
            .sort((a, b) => a.priority - b.priority)
            .map((rule) => (
              <div key={rule.id} className="rule-card">
                <div className="rule-priority">
                  <strong>Priority: {rule.priority}</strong>
                </div>
                <div className="rule-value">
                  <strong>Value:</strong> {JSON.stringify(rule.overrideValue)}
                </div>
                <div className="rule-conditions">{getConditionSummary(rule)}</div>
                <div className="rule-actions">
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="btn btn-danger btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Rule</h3>

            <label>Priority *</label>
            <input
              type="number"
              min="1"
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: parseInt(e.target.value) })
              }
              className="input"
            />

            <label>Override Value *</label>
            <input
              type="text"
              placeholder="e.g., 150"
              value={formData.overrideValue}
              onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value })}
              className="input"
            />

            <label>Platform (Optional)</label>
            <select
              value={formData.platformCondition || ''}
              onChange={(e) =>
                setFormData({ ...formData, platformCondition: e.target.value || undefined })
              }
              className="select"
            >
              <option value="">-- None --</option>
              <option value="iOS">iOS</option>
              <option value="Android">Android</option>
              <option value="Web">Web</option>
            </select>

            {formData.platformCondition && (
              <>
                <label>Version Operator</label>
                <select
                  value={formData.versionOperator || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, versionOperator: e.target.value || undefined })
                  }
                  className="select"
                >
                  <option value="">-- None --</option>
                  <option value="equal">=</option>
                  <option value="not_equal">!=</option>
                  <option value="greater_than">{'>}'}</option>
                  <option value="greater_or_equal">{'>='}</option>
                  <option value="less_than">&lt;</option>
                  <option value="less_or_equal">&lt;=</option>
                </select>

                {formData.versionOperator && (
                  <>
                    <label>Version</label>
                    <input
                      type="text"
                      placeholder="e.g., 3.5.0"
                      value={formData.versionValue || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, versionValue: e.target.value || undefined })
                      }
                      className="input"
                    />
                  </>
                )}
              </>
            )}

            <label>Country (Optional)</label>
            <input
              type="text"
              placeholder="e.g., DE, US"
              maxLength={2}
              value={formData.countryCondition || ''}
              onChange={(e) =>
                setFormData({ ...formData, countryCondition: e.target.value.toUpperCase() || undefined })
              }
              className="input"
            />

            <label>Active After (Optional)</label>
            <input
              type="datetime-local"
              value={formData.activeAfter || ''}
              onChange={(e) =>
                setFormData({ ...formData, activeAfter: e.target.value || undefined })
              }
              className="input"
            />

            <label>Active Between Start (Optional)</label>
            <input
              type="datetime-local"
              value={formData.activeBetweenStart || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  activeBetweenStart: e.target.value || undefined,
                })
              }
              className="input"
            />

            <label>Active Between End (Optional)</label>
            <input
              type="datetime-local"
              value={formData.activeBetweenEnd || ''}
              onChange={(e) =>
                setFormData({ ...formData, activeBetweenEnd: e.target.value || undefined })
              }
              className="input"
            />

            <div className="modal-actions">
              <button onClick={handleCreateRule} className="btn btn-success">
                Create Rule
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemoteConfigRules;

