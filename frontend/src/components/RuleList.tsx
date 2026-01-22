import React, { useEffect, useState } from 'react';
import { Edit2, Trash2, Plus, Power } from 'lucide-react';
import type { RuleOverwrite, CreateRuleInput, UpdateRuleInput } from '../types/config.types';
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
        // Convert CreateRuleInput to UpdateRuleInput by removing configId
        const updateData: UpdateRuleInput = {
          priority: ruleData.priority,
          enabled: ruleData.enabled,
          overrideValue: ruleData.overrideValue,
          platformConditions: ruleData.platformConditions,
          countryConditions: ruleData.countryConditions,
          segmentConditions: ruleData.segmentConditions,
          activeBetweenStart: ruleData.activeBetweenStart,
          activeBetweenEnd: ruleData.activeBetweenEnd,
        };
        await configApi.updateRule(configId, editingRule.id, updateData);
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

    // Display platform conditions with their version ranges
    const platforms = (rule as any).platformConditions;
    if (platforms && Array.isArray(platforms)) {
      const platformSummaries = platforms.map((pc: any) => {
        if (pc.minVersion || pc.maxVersion) {
          return `${pc.platform}(${pc.minVersion || '*'}-${pc.maxVersion || '*'})`;
        }
        return pc.platform;
      });
      conditions.push(platformSummaries.join(', '));
    }

    // Handle country conditions
    const countries = (rule as any).countryConditions;
    if (countries && Array.isArray(countries)) {
      conditions.push(countries.join(', '));
    }

    // Handle segment conditions
    const segments = (rule as any).segmentConditions;
    if (segments && Array.isArray(segments)) {
      conditions.push(segments.join(', '));
    }

    // Handle activation period
    if (rule.activeBetweenStart && rule.activeBetweenEnd) {
      conditions.push(
        `${new Date(rule.activeBetweenStart).toLocaleDateString()} - ${new Date(
          rule.activeBetweenEnd
        ).toLocaleDateString()}`
      );
    } else if (rule.activeBetweenStart) {
      conditions.push(`From ${new Date(rule.activeBetweenStart).toLocaleDateString()}`);
    } else if (rule.activeBetweenEnd) {
      conditions.push(`Until ${new Date(rule.activeBetweenEnd).toLocaleDateString()}`);
    }

    return conditions.length > 0 ? conditions.join(' • ') : 'No conditions';
  };

  const renderRuleConditions = (rule: RuleOverwrite) => {
    const platforms = (rule as any).platformConditions;
    const countries = (rule as any).countryConditions;
    const segments = (rule as any).segmentConditions;
    const hasDateRange = rule.activeBetweenStart || rule.activeBetweenEnd;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Platforms */}
        {platforms && Array.isArray(platforms) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {platforms.map((pc: any, idx: number) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{pc.platform}</span>
                {(pc.minVersion || pc.maxVersion) && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ({pc.minVersion || '*'}-{pc.maxVersion || '*'})
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Countries */}
        {countries && Array.isArray(countries) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {countries.map((country: string, idx: number) => (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '3px',
                  fontSize: '0.7rem',
                  color: 'var(--accent-primary)',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                }}
              >
                {country}
              </span>
            ))}
          </div>
        )}

        {/* Segments */}
        {segments && Array.isArray(segments) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {segments.map((segment: string, idx: number) => (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '3px',
                  fontSize: '0.7rem',
                  color: '#22c55e',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                }}
              >
                {segment}
              </span>
            ))}
          </div>
        )}

        {/* Date Range */}
        {hasDateRange && (
          <div
            style={{
              padding: '4px 8px',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '4px',
              fontSize: '0.7rem',
              color: '#a855f7',
              fontWeight: '500',
              whiteSpace: 'nowrap',
            }}
          >
            📅{' '}
            {rule.activeBetweenStart && rule.activeBetweenEnd
              ? `${new Date(rule.activeBetweenStart).toLocaleDateString()} - ${new Date(
                  rule.activeBetweenEnd
                ).toLocaleDateString()}`
              : rule.activeBetweenStart
              ? `From ${new Date(rule.activeBetweenStart).toLocaleDateString()}`
              : `Until ${new Date(rule.activeBetweenEnd!).toLocaleDateString()}`}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Rules ({rules.length})</h3>
        <button
          onClick={handleAddRule}
          disabled={showEditor}
          style={{
            padding: '10px 18px',
            backgroundColor: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            opacity: showEditor ? 0.5 : 1,
            pointerEvents: showEditor ? 'none' : 'auto'
          }}
          onMouseOver={(e) => !showEditor && (e.currentTarget.style.opacity = '0.9')}
          onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={16} />
          Add Rule
        </button>
      </div>

      {/* Rules List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Loading rules...
        </div>
      ) : rules.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-primary)',
          fontSize: '0.875rem'
        }}>
          No rules configured. Add one to override this config for specific players.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '12px',
                padding: '16px',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  {/* Priority & Conditions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--accent-primary)',
                        borderRadius: '50%',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      {rule.priority}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                      Conditions
                    </span>
                  </div>

                  {/* Conditions Display */}
                  <div style={{ marginLeft: '0px', marginTop: '8px' }}>
                    {renderRuleConditions(rule)}
                  </div>

                  {/* Override Value */}
                  <div style={{ marginLeft: '0px', marginTop: '8px' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '4px' }}>Override value:</p>
                    <code style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace",
                      color: 'var(--text-primary)',
                      background: 'var(--bg-primary)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      overflow: 'auto',
                      maxWidth: '400px'
                    }}>
                      {typeof rule.overrideValue === 'object'
                        ? JSON.stringify(rule.overrideValue).substring(0, 100) + (JSON.stringify(rule.overrideValue).length > 100 ? '...' : '')
                        : String(rule.overrideValue)}
                    </code>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                      color: rule.enabled ? '#22c55e' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = rule.enabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  >
                    <Power size={18} />
                  </button>

                  <button
                    onClick={() => handleEditRule(rule)}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                      color: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-primary)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    title="Edit rule"
                  >
                    <Edit2 size={18} />
                  </button>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
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
          configDataType={configDataType}
          currentValue={currentValue}
          initialRule={
            editingRule
              ? {
                  priority: editingRule.priority,
                  enabled: editingRule.enabled,
                  overrideValue: editingRule.overrideValue,
                  platformCondition: null,
                  activeBetweenStart: editingRule.activeBetweenStart || null,
                  activeBetweenEnd: editingRule.activeBetweenEnd || null,
                  // Extracted as pseudo-fields for RuleEditor to use
                  relatedPlatforms: (editingRule as any).platformConditions || [],
                  relatedCountries: (editingRule as any).countryConditions || [],
                  relatedSegments: (editingRule as any).segmentConditions || [],
                } as any
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

