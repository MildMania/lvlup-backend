import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

interface FunnelData {
  checkpointName: string;
  completionRate: number;
  completedUsers: number;
  totalUsers: number;
  order?: number;
}

interface FunnelChartProps {
  data: FunnelData[];
  chartColors?: {
    grid: string;
    text: string;
    background: string;
  };
}

const FunnelChart: React.FC<FunnelChartProps> = ({ data, chartColors }) => {
  // Sort data by order to ensure proper funnel sequence
  const sortedData = data.sort((a, b) => (a.order || 0) - (b.order || 0));

  // Default colors if not provided
  const colors = chartColors || {
    grid: '#e2e8f0',
    text: '#64748b',
    background: '#ffffff'
  };

  // Color gradient from green to red based on completion rate
  const getBarColor = (rate: number) => {
    if (rate >= 80) return '#10b981'; // Green
    if (rate >= 60) return '#f59e0b'; // Yellow
    if (rate >= 40) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const formatLabel = (name: string) => {
    return name.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart 
        data={sortedData}
        margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis 
          dataKey="checkpointName"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11, fill: colors.text }}
          tickFormatter={formatLabel}
          stroke={colors.text}
        />
        <YAxis 
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 12, fill: colors.text }}
          stroke={colors.text}
        />
        <Tooltip 
          formatter={(value: any, _name: any, props: any) => {
            const data = props.payload;
            return [
              `${Number(value).toFixed(1)}% (${data.completedUsers}/${data.totalUsers} users)`,
              'Completion Rate'
            ];
          }}
          labelFormatter={(label) => formatLabel(label)}
          contentStyle={{
            backgroundColor: colors.background,
            border: `1px solid ${colors.grid}`,
            borderRadius: '8px',
            fontSize: '14px',
            color: colors.text
          }}
          labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: colors.text }}
        />
        <Bar dataKey="completionRate" radius={[4, 4, 0, 0]}>
          {sortedData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={getBarColor(entry.completionRate)} 
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default FunnelChart;