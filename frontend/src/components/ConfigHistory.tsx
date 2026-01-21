import React, { useEffect, useState } from 'react';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { ConfigHistory } from '../types/config.types';
import configApi from '../services/configApi';

interface ConfigHistoryProps {
  configKey: string;
  gameId: string;
  onRollback?: () => void;
}

const ConfigHistoryComponent: React.FC<ConfigHistoryProps> = ({ configKey, gameId, onRollback }) => {
  const [history, setHistory] = useState<ConfigHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [configKey, gameId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await configApi.getConfigHistory(gameId, configKey);
      setHistory(data.history || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (historyId: string) => {
    if (!window.confirm('Are you sure you want to rollback to this version?')) return;

    setRollingBack(true);
    try {
      // Find the config ID from history
      const historyEntry = history.find((h) => h.id === historyId);
      if (!historyEntry) return;

      await configApi.rollbackConfig(historyEntry.configId);
      await fetchHistory();
      onRollback?.();
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('Failed to rollback. Please try again.');
    } finally {
      setRollingBack(false);
    }
  };

  const getChangeTypeBadge = (changeType: string): React.ReactNode => {
    const badgeClasses: Record<string, string> = {
      created: 'bg-green-100 text-green-800',
      updated: 'bg-blue-100 text-blue-800',
      deleted: 'bg-red-100 text-red-800',
      rollback: 'bg-purple-100 text-purple-800',
    };

    return (
      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${badgeClasses[changeType] || 'bg-gray-100 text-gray-800'}`}>
        {changeType.charAt(0).toUpperCase() + changeType.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3>Version History</h3>
        <button
          onClick={fetchHistory}
          className="btn btn-secondary"
        >
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading history...</div>
      ) : history.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
          No version history available
        </div>
      ) : (
        <div className="space-y-3">
          {/* Timeline */}
          {history.map((entry, index) => (
            <div key={entry.id} className="relative">
              {/* Timeline line */}
              {index < history.length - 1 && (
                <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-300"></div>
              )}

              {/* Timeline item */}
              <div className="flex gap-4">
                {/* Timeline dot */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center border-2 border-white shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                </div>

                {/* Content */}
                <div className="flex-1 mt-1">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                    className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getChangeTypeBadge(entry.changeType)}
                          <span className="text-sm font-medium text-gray-700">
                            {entry.changeType === 'created' && 'Config created'}
                            {entry.changeType === 'updated' && 'Config updated'}
                            {entry.changeType === 'deleted' && 'Config deleted'}
                            {entry.changeType === 'rollback' && 'Rollback performed'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">
                            {new Date(entry.changedAt).toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500">by {entry.changedBy}</span>
                        </div>
                      </div>

                      {expandedId === entry.id ? (
                        <ChevronUp size={18} className="text-gray-400 group-hover:text-gray-600" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400 group-hover:text-gray-600" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {expandedId === entry.id && (
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                      {/* Previous Value */}
                      {entry.previousValue !== undefined && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Previous Value:</p>
                          <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto font-mono text-gray-600">
                            {typeof entry.previousValue === 'object'
                              ? JSON.stringify(entry.previousValue, null, 2)
                              : String(entry.previousValue)}
                          </pre>
                        </div>
                      )}

                      {/* New Value */}
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1">New Value:</p>
                        <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto font-mono text-gray-600">
                          {typeof entry.newValue === 'object'
                            ? JSON.stringify(entry.newValue, null, 2)
                            : String(entry.newValue)}
                        </pre>
                      </div>

                      {/* Rollback Button */}
                      {entry.changeType !== 'rollback' && (
                        <button
                          onClick={() => handleRollback(entry.id)}
                          disabled={rollingBack}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          <RotateCcw size={16} />
                          Rollback to This Version
                        </button>
                      )}

                      {entry.changeType === 'rollback' && (
                        <div className="text-xs text-gray-600 italic">This is a rollback entry</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-gray-700">
        <p className="font-semibold mb-2 text-blue-600">Version History</p>
        <ul className="list-disc list-inside space-y-1">
          <li>All config changes are tracked automatically</li>
          <li>Click on any entry to see detailed changes</li>
          <li>Use rollback to restore to a previous version</li>
        </ul>
      </div>
    </div>
  );
};

export default ConfigHistoryComponent;

