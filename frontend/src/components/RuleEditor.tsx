import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check } from 'lucide-react';
import type {
  CreateRuleInput,
  VersionOperator,
  RuleFormState,
  RuleSummary,
  ValidationError,
} from '../types/config.types';

interface RuleEditorProps {
  configDataType: string;
  currentValue?: any;
  initialRule?: RuleFormState;
  onSave: (rule: CreateRuleInput) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

const VERSION_OPERATORS: VersionOperator[] = ['=', '!=', '>', '>=', '<', '<='];

const PLATFORMS = ['iOS', 'Android'];

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'TR', name: 'Turkey' },
];

const SEGMENTS = [
  { value: 'all_users', label: 'All Users' },
  { value: 'new_users', label: 'New Users' },
];

interface PlatformState {
  enabled: boolean;
  versionFrom: string;
  versionTo: string;
}

const RuleEditor: React.FC<RuleEditorProps> = ({
  configDataType,
  currentValue,
  initialRule,
  onSave,
  onClose,
  isLoading = false,
}) => {
  // Debug logging
  useEffect(() => {
    console.log('RuleEditor received currentValue:', currentValue);
  }, [currentValue]);

  const [platformStates, setPlatformStates] = useState<Record<string, PlatformState>>({
    iOS: { enabled: true, versionFrom: '', versionTo: '' },
    Android: { enabled: true, versionFrom: '', versionTo: '' },
  });
  
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<RuleFormState>(
    initialRule || {
      priority: 1,
      enabled: true,
      overrideValue: currentValue !== undefined 
        ? (typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : currentValue)
        : getDefaultOverrideValue(configDataType),
      platformCondition: null,
      versionOperator: null,
      versionValue: null,
      countryCondition: null,
      segmentCondition: null,
      activeAfter: null,
      activeBetweenStart: null,
      activeBetweenEnd: null,
    }
  );

  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [success, setSuccess] = useState(false);

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleSegment = (value: string) => {
    setSelectedSegments(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  const togglePlatform = (platform: string) => {
    setPlatformStates(prev => ({
      ...prev,
      [platform]: { ...prev[platform], enabled: !prev[platform].enabled }
    }));
  };

  const updatePlatformVersion = (platform: string, field: 'versionFrom' | 'versionTo', value: string) => {
    setPlatformStates(prev => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value }
    }));
  };

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (!formData.priority || formData.priority < 1) {
      newErrors.push({ field: 'priority', message: 'Priority must be at least 1' });
    }

    if (formData.overrideValue === undefined || formData.overrideValue === '') {
      newErrors.push({ field: 'overrideValue', message: 'Override value is required' });
    }

    // Validate platform version ranges
    Object.entries(platformStates).forEach(([platform, state]) => {
      if (state.enabled) {
        if (state.versionFrom && !isValidSemver(state.versionFrom)) {
          newErrors.push({ field: `${platform}VersionFrom`, message: `Invalid version format for ${platform}` });
        }
        if (state.versionTo && !isValidSemver(state.versionTo)) {
          newErrors.push({ field: `${platform}VersionTo`, message: `Invalid version format for ${platform}` });
        }
      }
    });

    if (formData.activeBetweenStart && formData.activeBetweenEnd) {
      if (new Date(formData.activeBetweenStart) >= new Date(formData.activeBetweenEnd)) {
        newErrors.push({
          field: 'activeBetweenEnd',
          message: 'End date must be after start date',
        });
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      // Build platform condition from enabled platforms
      const enabledPlatforms = Object.entries(platformStates)
        .filter(([_, state]) => state.enabled)
        .map(([platform]) => platform);

      const ruleInput: CreateRuleInput = {
        priority: formData.priority,
        enabled: formData.enabled,
        overrideValue: convertOverrideValue(formData.overrideValue, configDataType),
        platformCondition: enabledPlatforms.length > 0 ? enabledPlatforms.join(',') : undefined,
        countryCondition: selectedCountries.length > 0 ? selectedCountries.join(',') : undefined,
        segmentCondition: selectedSegments.length > 0 ? selectedSegments.join(',') : undefined,
        activeAfter: formData.activeAfter || undefined,
        activeBetweenStart: formData.activeBetweenStart || undefined,
        activeBetweenEnd: formData.activeBetweenEnd || undefined,
      };

      await onSave(ruleInput);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      setErrors([{ field: 'general', message: 'Failed to save rule. Please try again.' }]);
    }
  };

  const getRuleSummary = (): RuleSummary => {
    const conditions: string[] = [];

    const enabledPlatforms = Object.entries(platformStates)
      .filter(([_, state]) => state.enabled)
      .map(([platform, state]) => {
        let str = platform;
        if (state.versionFrom || state.versionTo) {
          const from = state.versionFrom || '*';
          const to = state.versionTo || '*';
          str += ` (${from} - ${to})`;
        }
        return str;
      });

    if (enabledPlatforms.length > 0) {
      conditions.push(`Platforms: ${enabledPlatforms.join(', ')}`);
    }

    if (selectedCountries.length > 0) {
      conditions.push(`Countries: ${selectedCountries.join(', ')}`);
    }

    if (selectedSegments.length > 0) {
      conditions.push(`Segments: ${selectedSegments.join(', ')}`);
    }

    if (formData.activeAfter) {
      conditions.push(`Active after: ${new Date(formData.activeAfter).toLocaleDateString()}`);
    }

    if (formData.activeBetweenStart && formData.activeBetweenEnd) {
      conditions.push(
        `Active: ${new Date(formData.activeBetweenStart).toLocaleDateString()} - ${new Date(
          formData.activeBetweenEnd
        ).toLocaleDateString()}`
      );
    }

    const description = conditions.length > 0 ? conditions.join(' • ') : 'No conditions (applies to all)';

    return { conditions, description };
  };

  const summary = getRuleSummary();

  return (
    <div className="modal-overlay">
      <div className="modal modal-large">
        {/* Header */}
        <div className="modal-header">
          <h2>{initialRule ? 'Edit Rule' : 'Create New Rule'}</h2>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="modal-body space-y-4">
          {/* Rule Summary Preview */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderLeft: '4px solid var(--accent-primary)',
            padding: '16px',
            borderRadius: '8px'
          }}>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Rule Summary:</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0' }}>{summary.description}</p>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '16px'
            }}>
              {errors.map((error) => (
                <div key={error.field} style={{ display: 'flex', gap: '8px', color: '#ef4444', marginBottom: '8px' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: '600', margin: '0' }}>{error.field}</p>
                    <p style={{ fontSize: '0.875rem', margin: '0' }}>{error.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Priority & Enable Toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Priority</label>
              <input
                type="number"
                min="1"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                className="form-input"
                disabled={isLoading}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Lower numbers evaluated first</p>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  disabled={isLoading}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>Enabled</span>
              </label>
            </div>
          </div>

          {/* Override Value with Current Value */}
          <div className="form-group">
            <label>Override Value</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Expected type: <strong>{configDataType}</strong></p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                {currentValue !== undefined ? (
                  <>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: '500' }}>Current Value (read-only)</label>
                    <textarea
                      value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue)}
                      className="form-input"
                      style={{ 
                        fontFamily: "'SF Mono', monospace", 
                        fontSize: '0.875rem', 
                        background: 'var(--bg-primary)',
                        color: 'var(--text-secondary)',
                        cursor: 'not-allowed'
                      }}
                      rows={6}
                      disabled
                    />
                  </>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No current value available</div>
                )}
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: '500' }}>New Override Value</label>
                {configDataType === 'boolean' ? (
                  <select
                    value={formData.overrideValue === true ? 'true' : formData.overrideValue === false ? 'false' : ''}
                    onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value === 'true' })}
                    className="form-input"
                    disabled={isLoading}
                  >
                    <option value="">-- Select override value --</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : configDataType === 'json' ? (
                  <textarea
                    value={typeof formData.overrideValue === 'string' ? formData.overrideValue : formData.overrideValue === getDefaultOverrideValue(configDataType) ? '' : JSON.stringify(formData.overrideValue, null, 2)}
                    onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value })}
                    className="form-input"
                    style={{ fontFamily: "'SF Mono', monospace", fontSize: '0.875rem' }}
                    rows={6}
                    placeholder='Enter JSON override value...'
                    disabled={isLoading}
                  />
                ) : (
                  <input
                    type={configDataType === 'number' ? 'number' : 'text'}
                    value={formData.overrideValue === getDefaultOverrideValue(configDataType) && configDataType !== 'number' ? '' : formData.overrideValue}
                    onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value })}
                    className="form-input"
                    placeholder={`Enter ${configDataType} override value...`}
                    disabled={isLoading}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Platform & Version Conditions */}
          <div className="form-group">
            <label>Platform & Version Filters</label>
            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '16px',
              background: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {Object.keys(platformStates).map((platform) => (
                <div key={platform} style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  padding: '16px',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={platformStates[platform].enabled}
                        onChange={() => togglePlatform(platform)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)', minWidth: '80px' }}>{platform}</span>
                    </label>

                    {platformStates[platform].enabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Version:</span>
                        <input
                          type="text"
                          placeholder="from"
                          value={platformStates[platform].versionFrom}
                          onChange={(e) => updatePlatformVersion(platform, 'versionFrom', e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.875rem', flex: 1 }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>to</span>
                        <input
                          type="text"
                          placeholder="to"
                          value={platformStates[platform].versionTo}
                          onChange={(e) => updatePlatformVersion(platform, 'versionTo', e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.875rem', flex: 1 }}
                        />
                      </div>
                    )}
                  </div>
                  {platformStates[platform].enabled && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '28px', margin: '0' }}>Empty fields mean no constraint (e.g., from 3.0.0 to 4.0.0)</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Country Filters */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label>Country Filters</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedCountries(COUNTRIES.map(c => c.code))}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)')}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCountries([])}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--border-primary)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-primary)')}
                >
                  Clear
                </button>
              </div>
            </div>
            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px'
            }}>
              {COUNTRIES.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => toggleCountry(country.code)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '6px',
                    border: selectedCountries.includes(country.code) ? '1px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                    background: selectedCountries.includes(country.code) ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
                    color: selectedCountries.includes(country.code) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {country.name} ({country.code})
                </button>
              ))}
            </div>
            {selectedCountries.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', margin: '0' }}>Selected: {selectedCountries.join(', ')}</p>
            )}
          </div>

          {/* Segment Filters */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label>Segment Filters</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedSegments(SEGMENTS.map(s => s.value))}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)')}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSegments([])}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--border-primary)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-primary)')}
                >
                  Clear
                </button>
              </div>
            </div>
            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {SEGMENTS.map((segment) => (
                <button
                  key={segment.value}
                  type="button"
                  onClick={() => toggleSegment(segment.value)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '6px',
                    border: selectedSegments.includes(segment.value) ? '1px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                    background: selectedSegments.includes(segment.value) ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
                    color: selectedSegments.includes(segment.value) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: '100%'
                  }}
                >
                  {segment.label}
                </button>
              ))}
            </div>
            {selectedSegments.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', margin: '0' }}>Selected: {selectedSegments.map(s => SEGMENTS.find(seg => seg.value === s)?.label).join(', ')}</p>
            )}
          </div>

          {/* Date Conditions */}
          <div className="form-group">
            <label>Active After (Optional)</label>
            <input
              type="datetime-local"
              value={formData.activeAfter ? formData.activeAfter.slice(0, 16) : ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  activeAfter: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Active Between Start (Optional)</label>
              <input
                type="datetime-local"
                value={formData.activeBetweenStart ? formData.activeBetweenStart.slice(0, 16) : ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    activeBetweenStart: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="form-input"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label>Active Between End (Optional)</label>
              <input
                type="datetime-local"
                value={formData.activeBetweenEnd ? formData.activeBetweenEnd.slice(0, 16) : ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    activeBetweenEnd: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="form-input"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#22c55e'
            }}>
              <Check size={18} />
              <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Rule saved successfully!</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="modal-footer">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper functions
function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?(\+[a-zA-Z0-9]+)?$/;
  return semverRegex.test(version);
}

function getDefaultOverrideValue(dataType: string): any {
  switch (dataType) {
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'json':
      return '{}';
    default:
      return '';
  }
}

function convertOverrideValue(value: any, dataType: string): any {
  if (dataType === 'number') return Number(value);
  if (dataType === 'boolean') return value === true || value === 'true';
  if (dataType === 'json') {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  }
  return value;
}

export default RuleEditor;

