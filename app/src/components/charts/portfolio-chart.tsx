'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time, AreaSeries } from 'lightweight-charts';

interface PortfolioChartProps {
  currentValue: number;
  height?: number;
  className?: string;
  timeframe?: '1H' | '4H' | '1D' | '1W';
}

export default function PortfolioChart({
  currentValue,
  height = 250,
  className = '',
  timeframe = '1D',
}: PortfolioChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Generate realistic simulated historical portfolio values ending at currentValue
    const dataPoints = 30;
    const now = Math.floor(Date.now() / 1000);
    const step = 86400; // 1 day
    const chartData = [];
    
    // Trailing simulation
    let tempValue = currentValue;
    for (let i = dataPoints - 1; i >= 0; i--) {
      const time = (now - i * step) as Time;
      // Add random price fluctuations (up to 3% daily variance)
      const dailyChange = (Math.random() - 0.46) * 0.03; // slight upward bias
      tempValue = tempValue / (1 + dailyChange);
      
      chartData.push({
        time,
        value: Number(tempValue.toFixed(2)),
      });
    }
    
    // Sort chronological
    chartData.sort((a, b) => (a.time as number) - (b.time as number));
    // Ensure the last element matches exactly the current value
    chartData[chartData.length - 1].value = currentValue;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#c6c9ab', // matching dexi design palette text
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(210, 240, 0, 0.2)', // primary color glow
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(210, 240, 0, 0.2)',
          width: 1,
          style: 3,
        },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#d2f000', // primary
      topColor: 'rgba(210, 240, 0, 0.15)',
      bottomColor: 'rgba(210, 240, 0, 0.0)',
      lineWidth: 2,
    });

    areaSeries.setData(chartData);
    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [currentValue, height]);

  return (
    <div
      ref={chartContainerRef}
      className={`w-full relative ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}
