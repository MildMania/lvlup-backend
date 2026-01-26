// @ts-nocheck
import React, { useState } from 'react';
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

const PLATFORMS = ['iOS', 'Android', 'Web'];

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
  const [platformStates, setPlatformStates] = useState<Record<string, PlatformState>>({
    iOS: { enabled: false, versionFrom: '', versionTo: '' },
    Android: { enabled: false, versionFrom: '', versionTo: '' },
    Web: { enabled: false, versionFrom: '', versionTo: '' },
  });
  
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<RuleFormState>(
    initialRule || {
      priority: 1,
      enabled: true,
      overrideValue: getDefaultOverrideValue(configDataType),
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

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (!formData.priority || formData.priority < 1) {
      newErrors.push({ field: 'priority', message: 'Priority must be at least 1' });
    }

    if (formData.overrideValue === undefined || formData.overrideValue === '') {
      newErrors.push({ field: 'overrideValue', message: 'Override value is required' });
    }

    if (formData.versionOperator && !formData.versionValue) {
      newErrors.push({ field: 'versionValue', message: 'Version value required when operator is set' });
    }

    if (formData.versionValue && !formData.versionOperator) {
      newErrors.push({ field: 'versionOperator', message: 'Version operator required when value is set' });
    }

    // Validate semver format if provided
    if (formData.versionValue && !isValidSemver(formData.versionValue)) {
      newErrors.push({ field: 'versionValue', message: 'Invalid semantic version format (e.g., 3.5.0)' });
    }

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
      const ruleInput: CreateRuleInput = {
        priority: formData.priority,
        enabled: formData.enabled,
        overrideValue: convertOverrideValue(formData.overrideValue, configDataType),
        platformCondition: formData.platformCondition || undefined,
        versionOperator: formData.versionOperator || undefined,
        versionValue: formData.versionValue || undefined,
        countryCondition: formData.countryCondition || undefined,
        segmentCondition: formData.segmentCondition || undefined,
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

    if (formData.platformCondition) {
      conditions.push(`Platform: ${formData.platformCondition}`);
    }

    if (formData.versionOperator && formData.versionValue) {
      conditions.push(`Version ${formData.versionOperator} ${formData.versionValue}`);
    }

    if (formData.countryCondition) {
      const country = COUNTRIES.find((c) => c.code === formData.countryCondition);
      conditions.push(`Country: ${country?.name || formData.countryCondition}`);
    }

    if (formData.segmentCondition) {
      conditions.push(`Segment: ${formData.segmentCondition}`);
    }

    if (formData.activeAfter) {
      conditions.push(`Active after: ${new Date(formData.activeAfter).toLocaleDateString()}`);
    }

    if (formData.activeBetweenStart && formData.activeBetweenEnd) {
      conditions.push(
        `Active between: ${new Date(formData.activeBetweenStart).toLocaleDateString()} - ${new Date(
          formData.activeBetweenEnd
        ).toLocaleDateString()}`
      );
    }

    const description = conditions.length > 0 ? conditions.join(' • ') : 'No conditions (applies to all)';

    return { conditions, description };
  };

  const summary = getRuleSummary();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-50 border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">{initialRule ? 'Edit Rule' : 'Create New Rule'}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors"
            disabled={isLoading}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Rule Summary Preview */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <p className="text-sm font-semibold text-gray-700 mb-2">Rule Summary:</p>
            <p className="text-sm text-gray-600">{summary.description}</p>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              {errors.map((error) => (
                <div key={error.field} className="flex items-start gap-2 text-red-700">
                  <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{error.field}</p>
                    <p className="text-sm">{error.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Priority & Enable Toggle */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <input
                type="number"
                min="1"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers evaluated first</p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  disabled={isLoading}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {/* Override Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Value</label>
            <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 mb-2">
              Expected type: <strong>{configDataType}</strong>
            </div>
            {configDataType === 'boolean' ? (
              <select
                value={formData.overrideValue === true ? 'true' : formData.overrideValue === false ? 'false' : ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    overrideValue: e.target.value === 'true',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="">Select value</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : configDataType === 'json' ? (
              <textarea
                value={typeof formData.overrideValue === 'string' ? formData.overrideValue : JSON.stringify(formData.overrideValue, null, 2)}
                onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                rows={6}
                placeholder='{"key": "value"}'
                disabled={isLoading}
              />
            ) : (
              <input
                type={configDataType === 'number' ? 'number' : 'text'}
                value={formData.overrideValue}
                onChange={(e) => setFormData({ ...formData, overrideValue: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            )}
          </div>

          {/* Platform Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platform (Optional)</label>
            <select
              value={formData.platformCondition || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  platformCondition: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="">No platform restriction</option>
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>

          {/* Version Condition */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Version Operator (Optional)</label>
              <select
                value={formData.versionOperator || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    versionOperator: (e.target.value as VersionOperator) || null,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="">No version filter</option>
                {VERSION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Version Value</label>
              <input
                type="text"
                placeholder="e.g., 3.5.0"
                value={formData.versionValue || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    versionValue: e.target.value || null,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || !formData.versionOperator}
              />
              <p className="text-xs text-gray-500 mt-1">Semantic version (major.minor.patch)</p>
            </div>
          </div>

          {/* Country Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Country (Optional)</label>
            <select
              value={formData.countryCondition || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  countryCondition: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="">No country restriction</option>
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.code})
                </option>
              ))}
            </select>
          </div>

          {/* Segment Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Segment (Optional)</label>
            <select
              value={formData.segmentCondition || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  segmentCondition: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="">No segment filter</option>
              {SEGMENTS.map((segment) => (
                <option key={segment.value} value={segment.value}>
                  {segment.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Conditions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Active After (Optional)</label>
            <input
              type="datetime-local"
              value={formData.activeAfter ? formData.activeAfter.slice(0, 16) : ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  activeAfter: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Active Between Start (Optional)</label>
              <input
                type="datetime-local"
                value={formData.activeBetweenStart ? formData.activeBetweenStart.slice(0, 16) : ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    activeBetweenStart: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Active Between End (Optional)</label>
              <input
                type="datetime-local"
                value={formData.activeBetweenEnd ? formData.activeBetweenEnd.slice(0, 16) : ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    activeBetweenEnd: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-green-700">
              <Check size={18} />
              <span className="text-sm font-medium">Rule saved successfully!</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
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

