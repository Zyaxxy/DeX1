'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time, CandlestickData, HistogramData, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { PricePoint } from '@/hooks/usePoolTrades';

interface CandlestickChartProps {
  priceHistory?: PricePoint[];
  height?: number;
  className?: string;
  timeframe?: '1H' | '4H' | '1D' | '1W' | '1M';
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

function buildCandles(
  priceHistory: PricePoint[],
  timeframe: string
): { ohlc: CandlestickData<Time>[]; volume: HistogramData<Time>[] } {
  if (priceHistory.length < 2) {
    if (priceHistory.length === 1) {
      const p = priceHistory[0];
      return {
        ohlc: [{ time: p.timestamp as Time, open: p.price, high: p.price, low: p.price, close: p.price }],
        volume: [],
      };
    }
    return { ohlc: [], volume: [] };
  }

  const windowSec = TIMEFRAME_SECONDS[timeframe] || 86400;
  const buckets = new Map<number, PricePoint[]>();

  for (const point of priceHistory) {
    const bucket = Math.floor(point.timestamp / windowSec) * windowSec;
    const existing = buckets.get(bucket);
    if (existing) {
      existing.push(point);
    } else {
      buckets.set(bucket, [point]);
    }
  }

  const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  const ohlc: CandlestickData<Time>[] = [];
  const volume: HistogramData<Time>[] = [];

  for (const time of sortedTimes) {
    const points = buckets.get(time)!;
    const open = points[0].price;
    const close = points[points.length - 1].price;
    const high = Math.max(...points.map(p => p.price));
    const low = Math.min(...points.map(p => p.price));
    const isUp = close >= open;

    ohlc.push({ time: time as Time, open, high, low, close });
    volume.push({
      time: time as Time,
      value: points.length,
      color: isUp ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 71, 87, 0.3)',
    });
  }

  return { ohlc, volume };
}

export default function CandlestickChart({
  priceHistory,
  height = 400,
  className = '',
  timeframe = '1D',
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const candles = priceHistory ? buildCandles(priceHistory, timeframe) : { ohlc: [], volume: [] };

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
        textColor: '#94a3b8',
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
          color: 'rgba(255,255,255,0.1)',
          width: 1,
          style: 3,
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

    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#3bc978',
      downColor: '#e05050',
      borderVisible: false,
      wickUpColor: '#3bc978',
      wickDownColor: '#e05050',
    });

    if (candles.ohlc.length > 0) {
      mainSeries.setData(candles.ohlc);
    }

    if (candles.volume.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      chart.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(candles.volume);
    }

    if (candles.ohlc.length > 0) {
      chart.timeScale().fitContent();
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [priceHistory, timeframe, height]);

  return (
    <div
      ref={chartContainerRef}
      className={`w-full relative ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}
