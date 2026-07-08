'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time, CandlestickData, HistogramData, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface CandlestickChartProps {
  data?: CandlestickData<Time>[];
  volumeData?: HistogramData<Time>[];
  height?: number;
  className?: string;
}

// Generate mock data starting from $1.00
function generateMockData(): { ohlc: CandlestickData<Time>[], volume: HistogramData<Time>[] } {
  const ohlc: CandlestickData<Time>[] = [];
  const volume: HistogramData<Time>[] = [];
  let currentPrice = 1.0;
  
  const now = new Date();
  const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const timeStr = date.toISOString().split('T')[0] as Time;
    
    const volatility = 0.05;
    const open = currentPrice;
    const close = open * (1 + (Math.random() - 0.48) * volatility); // Slight upward bias
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    
    currentPrice = close;
    
    ohlc.push({
      time: timeStr,
      open,
      high,
      low,
      close,
    });
    
    const isUp = close >= open;
    const vol = Math.floor(Math.random() * 10000) + 1000;
    
    volume.push({
      time: timeStr,
      value: vol,
      color: isUp ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 71, 87, 0.3)',
    });
  }
  
  return { ohlc, volume };
}

export default function CandlestickChart({ 
  data, 
  volumeData, 
  height = 400, 
  className = '' 
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Use provided data or generate mock data
    const chartData = data && data.length > 0 ? data : undefined;
    let actualOhlc = chartData;
    let actualVolume = volumeData;
    
    if (!actualOhlc) {
      const mock = generateMockData();
      actualOhlc = mock.ohlc;
      if (!actualVolume) actualVolume = mock.volume;
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      crosshair: {
        mode: 0, // Normal mode
        vertLine: {
          color: 'rgba(255,255,255,0.1)',
          width: 1,
          style: 3, // Dashed
        },
        horzLine: {
          color: 'rgba(255,255,255,0.1)',
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

    // Add Candlestick Series
    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff88',
      downColor: '#ff4757',
      borderVisible: false,
      wickUpColor: '#00ff88',
      wickDownColor: '#ff4757',
    });

    mainSeries.setData(actualOhlc!);

    // Add Volume Series
    if (actualVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });
      chart.priceScale('').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
      volumeSeries.setData(actualVolume);
    }

    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, volumeData, height]);

  return (
    <div 
      ref={chartContainerRef} 
      className={`w-full relative ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}
