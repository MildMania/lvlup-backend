import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw, Save } from 'lucide-react';
import type { RuleOverwrite } from '../types/config.types';
import configApi from '../services/configApi';

interface DraggableRuleListProps {
  configId: string;
  onReorderComplete?: () => void;
}

interface SortableRuleItemProps {
  rule: RuleOverwrite;
}

/**
 * Sortable rule item component
 */
const SortableRuleItem: React.FC<SortableRuleItemProps> = ({ rule }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="p-1 hover:bg-gray-100 rounded-lg cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
        >
          <GripVertical size={18} />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
              {rule.priority}
            </span>
            <span className="text-sm font-medium text-gray-700">
              {rule.platformConditions && rule.platformConditions.length > 0 && `Platform: ${rule.platformConditions.join(', ')}`}
              {rule.countryConditions && rule.countryConditions.length > 0 && ` Country: ${rule.countryConditions.join(', ')}`}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Override: <span className="font-mono">{String(rule.overrideValue)}</span>
          </p>
        </div>

        <div className="text-right text-xs text-gray-500">
          {rule.enabled ? <span className="text-green-600 font-medium">Active</span> : <span>Disabled</span>}
        </div>
      </div>
    </div>
  );
};

/**
 * Draggable rule list component with reordering
 */
const DraggableRuleList: React.FC<DraggableRuleListProps> = ({ configId, onReorderComplete }) => {
  const [orderedRules, setOrderedRules] = useState<RuleOverwrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalOrder, setOriginalOrder] = useState<RuleOverwrite[]>([]);

  useEffect(() => {
    fetchRules();
  }, [configId]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await configApi.listRules(configId);
      setOrderedRules(data.rules || []);
      setOriginalOrder(data.rules || []);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = orderedRules.findIndex((rule) => rule.id === active.id);
      const newIndex = orderedRules.findIndex((rule) => rule.id === over.id);

      const newOrder = arrayMove(orderedRules, oldIndex, newIndex);

      // Auto-renumber priorities
      const renumberedRules = newOrder.map((rule, index) => ({
        ...rule,
        priority: index + 1,
      }));

      setOrderedRules(renumberedRules);
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const reorderInput = {
        ruleOrder: orderedRules.map((rule, index) => ({
          ruleId: rule.id,
          newPriority: index + 1,
        })),
      };

      await configApi.reorderRules(configId, reorderInput);
      setHasChanges(false);
      setOriginalOrder(orderedRules);
      onReorderComplete?.();
    } catch (error) {
      console.error('Failed to save rule order:', error);
      alert('Failed to save rule order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setOrderedRules(originalOrder);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">Rule Priority Order</h3>
        {hasChanges && (
          <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
            Reordered
          </span>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading rules...</div>
      ) : orderedRules.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">No rules to reorder</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedRules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {orderedRules.map((rule) => (
                <SortableRuleItem key={rule.id} rule={rule} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Actions */}
      {hasChanges && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Priorities will be auto-renumbered</span> starting from 1 (evaluated first)
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
            >
              <Save size={16} />
              Save Changes
            </button>

            <button
              onClick={handleCancel}
              disabled={saving}
              className="btn btn-secondary"
            >
              <RotateCcw size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-gray-700">
        <p className="font-semibold mb-2 text-blue-600">How priority works:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Rules are evaluated in order (1 = highest priority, checked first)</li>
          <li>First matching rule wins and its override value is returned</li>
          <li>Drag items to reorder and change priority</li>
        </ul>
      </div>
    </div>
  );
};

export default DraggableRuleList;

