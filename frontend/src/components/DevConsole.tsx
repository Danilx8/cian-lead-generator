import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';

interface LogEntry { level: 'log' | 'warn' | 'error'; args: unknown[]; ts: number }

const MAX_LOGS = 400;

const formatArg = (a: unknown) => {
  if (typeof a === 'string') return a;
  if (typeof a === 'number' || typeof a === 'boolean' || a === null) return String(a);
  try { return JSON.stringify(a); } catch { return Object.prototype.toString.call(a); }
};

const colorFor = (lvl: LogEntry['level']) => (
  lvl === 'error' ? '#D93025' : lvl === 'warn' ? '#B36B00' : '#0077B6'
);

import type { TelegramWA } from '../types/telegram';

interface WindowWithTG extends Window {
  Telegram?: {
    WebApp?: TelegramWA & {
      platform?: string;
      viewportHeight?: number;
      viewportStableHeight?: number;
    }
  }
}

const grabMetrics = () => {
  const root = document.documentElement;
  const css = (v: string) => getComputedStyle(root).getPropertyValue(v).trim();
  const vv = window.visualViewport;
  const tg = (window as WindowWithTG).Telegram?.WebApp;
  return {
    inner: window.innerWidth + 'x' + window.innerHeight,
    screen: screen.width + 'x' + screen.height,
    safeTop: css('--safe-area-inset-top'),
    safeBottom: css('--safe-area-inset-bottom'),
    tgVH: css('--tg-vh'),
    appHeight: css('--app-height'),
    platform: tg?.platform,
    tgViewportH: tg?.viewportHeight,
    tgStableH: tg?.viewportStableHeight,
    vvSize: vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) : 'n/a',
    vvOffset: vv ? vv.offsetTop + '/' + vv.offsetLeft : 'n/a'
  } as const;
};

export const DevConsole: React.FC<{ defaultOpen?: boolean }> = ({ defaultOpen }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const { notify } = useAppStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<ReturnType<typeof grabMetrics>>(() => grabMetrics());
  const originals = useRef<{ log: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void } | null>(null);

  useEffect(() => {
    if (originals.current) return;
    originals.current = { log: console.log, warn: console.warn, error: console.error };
    const push = (level: LogEntry['level'], args: unknown[]) => {
      setLogs(l => [...l.slice(-MAX_LOGS + 1), { level, args, ts: Date.now() }]);
    };
    console.log = (...a) => { push('log', a); originals.current!.log(...a); };
    console.warn = (...a) => { push('warn', a); originals.current!.warn(...a); };
    console.error = (...a) => { push('error', a); originals.current!.error(...a); };
    const interval = setInterval(() => setMetrics(grabMetrics()), 1500);
    window.addEventListener('resize', () => setMetrics(grabMetrics()));
    const vv = window.visualViewport;
    const vvHandler = () => setMetrics(grabMetrics());
    vv?.addEventListener('resize', vvHandler);
    vv?.addEventListener('scroll', vvHandler);
    return () => {
      if (originals.current) {
        console.log = originals.current.log;
        console.warn = originals.current.warn;
        console.error = originals.current.error;
      }
      clearInterval(interval);
      vv?.removeEventListener('resize', vvHandler);
      vv?.removeEventListener('scroll', vvHandler);
    };
  }, []);

  const clear = () => setLogs([]);

  const bottomVar = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0px';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          right: 12,
          bottom: `calc(${bottomVar} + 14px)`,
          zIndex: 9999,
          background: '#FFFFFF',
          color: '#0B2430',
          border: '1px solid rgba(11,36,48,0.20)',
          borderRadius: 22,
          padding: '6px 12px',
          fontSize: 12,
          fontFamily: 'monospace'
        }}
      >{open ? 'Close' : 'Dev'}</button>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: '8% 4% 8% 4%',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
            border: '1px solid rgba(11,36,48,0.15)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'monospace'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8, borderBottom: '1px solid rgba(11,36,48,0.15)', fontSize: 12 }}>
            <strong style={{ fontWeight: 600 }}>Dev Console</strong>
            <button onClick={clear} style={btnStyle}>Clear</button>
            <button onClick={() => notify('Тестовая ошибка', 'error')} style={btnStyle}>Error</button>
            <button onClick={() => notify('Тестовый успех', 'success')} style={btnStyle}>Success</button>
            <button onClick={() => notify('Тестовая информация', 'info')} style={btnStyle}>Info</button>
            <button onClick={() => setOpen(false)} style={btnStyle}>×</button>
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(11,36,48,0.15)', fontSize: 11, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 4 }}>
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k}><span style={{ color: '#5E7C8B' }}>{k}:</span> {String(v)}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 11, lineHeight: 1.3, padding: '6px 10px' }}>
            {logs.map(l => (
              <div key={l.ts + Math.random()} style={{ color: colorFor(l.level), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                [{new Date(l.ts).toLocaleTimeString()}] {l.level.toUpperCase()}: {l.args.map(formatArg).join(' ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

const btnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: '#EAF6FC',
  color: '#0B2430',
  border: '1px solid rgba(11,36,48,0.20)',
  padding: '4px 8px',
  fontSize: 11,
  borderRadius: 6,
  cursor: 'pointer'
};

export default DevConsole;
