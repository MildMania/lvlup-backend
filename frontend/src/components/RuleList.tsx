import React, { useEffect, useState } from 'react';
import { Edit2, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import type { RuleOverwrite, CreateRuleInput } from '../types/config.types';
import configApi from '../services/configApi';
import RuleEditor from './RuleEditor';

interface RuleListProps {
  configId: string;
  configDataType: string;
  currentValue?: any;
  onRulesChange?: () => void;
}

const RuleList: React.FC<RuleListProps> = ({ configId, configDataType, currentValue, onRulesChange }) => {
  const [rules, setRules] = useState<RuleOverwrite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleOverwrite | null>(null);

  useEffect(() => {
    fetchRules();
  }, [configId]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await configApi.listRules(configId);
      setRules(data.rules || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleAddRule = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule: RuleOverwrite) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleSaveRule = async (ruleData: CreateRuleInput) => {
    try {
      if (editingRule) {
        await configApi.updateRule(configId, editingRule.id, ruleData);
      } else {
        await configApi.createRule(configId, ruleData);
      }
      await fetchRules();
      onRulesChange?.();
      setShowEditor(false);
    } catch (error) {
      console.error('Failed to save rule:', error);
      throw error;
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;

    try {
      await configApi.deleteRule(configId, ruleId);
      await fetchRules();
      onRulesChange?.();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      await configApi.toggleRule(configId, ruleId);
      await fetchRules();
      onRulesChange?.();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const getRuleConditionSummary = (rule: RuleOverwrite): string => {
    const conditions: string[] = [];

    if (rule.platformCondition) {
      conditions.push(`${rule.platformCondition}`);
    }

    if (rule.versionOperator && rule.versionValue) {
      conditions.push(`v${rule.versionOperator}${rule.versionValue}`);
    }

    if (rule.countryCondition) {
      conditions.push(`${rule.countryCondition}`);
    }

    if (rule.activeAfter) {
      conditions.push(`⏰ ${new Date(rule.activeAfter).toLocaleDateString()}`);
    }

    if (rule.activeBetweenStart && rule.activeBetweenEnd) {
      conditions.push(
        `📅 ${new Date(rule.activeBetweenStart).toLocaleDateString()} - ${new Date(
          rule.activeBetweenEnd
        ).toLocaleDateString()}`
      );
    }

    return conditions.length > 0 ? conditions.join(' • ') : 'No conditions';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3>Rules ({rules.length})</h3>
        <button
          onClick={handleAddRule}
          disabled={showEditor}
          className="btn btn-primary"
        >
          <Plus size={16} />
          Add Rule
        </button>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
          No rules configured. Add one to override this config for specific players.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Priority & Conditions */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                      {rule.priority}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{getRuleConditionSummary(rule)}</span>
                    {rule.enabled && <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>}
                  </div>

                  {/* Override Value */}
                  <div className="ml-9">
                    <p className="text-xs text-gray-500">Override value:</p>
                    <p className="text-sm font-mono text-gray-700">
                      {typeof rule.overrideValue === 'object'
                        ? JSON.stringify(rule.overrideValue)
                        : String(rule.overrideValue)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  >
                    {rule.enabled ? (
                      <Eye size={18} className="text-green-600" />
                    ) : (
                      <EyeOff size={18} className="text-gray-400" />
                    )}
                  </button>

                  <button
                    onClick={() => handleEditRule(rule)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-blue-600"
                    title="Edit rule"
                  >
                    <Edit2 size={18} />
                  </button>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                    title="Delete rule"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rule Editor Modal */}
      {showEditor && (
        <RuleEditor
          configId={configId}
          configDataType={configDataType}
          currentValue={currentValue}
          initialRule={
            editingRule
              ? {
                  priority: editingRule.priority,
                  enabled: editingRule.enabled,
                  overrideValue: editingRule.overrideValue,
                  platformCondition: editingRule.platformCondition || null,
                  versionOperator: (editingRule.versionOperator as any) || null,
                  versionValue: editingRule.versionValue || null,
                  countryCondition: editingRule.countryCondition || null,
                  segmentCondition: editingRule.segmentCondition || null,
                  activeAfter: editingRule.activeAfter || null,
                  activeBetweenStart: editingRule.activeBetweenStart || null,
                  activeBetweenEnd: editingRule.activeBetweenEnd || null,
                }
              : undefined
          }
          onSave={handleSaveRule}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
};

export default RuleList;

