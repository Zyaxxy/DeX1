'use client';

import { useEffect, useState } from 'react';

interface SparklineProps {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function Sparkline({
  data,
  width = 120,
  height = 40,
  color = '#00ff88',
  className = ''
}: SparklineProps) {
  const [points, setPoints] = useState<number[]>([]);

  useEffect(() => {
    if (data && data.length > 0) {
      setPoints(data);
    } else {
      // Generate mock data if none provided
      const mockPoints = [];
      let val = 50;
      for (let i = 0; i < 20; i++) {
        val = val + (Math.random() * 10 - 5);
        mockPoints.push(val);
      }
      setPoints(mockPoints);
    }
  }, [data]);

  if (points.length === 0) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1; // Prevent div by 0

  // Calculate coordinates
  const xStep = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * xStep;
    // Invert Y axis since SVG 0 is at top
    const y = height - ((p - min) / range) * height * 0.8 - (height * 0.1); 
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  // Create a unique ID for the gradient based on color
  const gradientId = `sparkline-gradient-${color.replace('#', '')}`;

  return (
    <div className={`inline-block ${className}`} style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Fill Area */}
        <path d={areaD} fill={`url(#${gradientId})`} stroke="none" />
        
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
