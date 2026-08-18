import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PillTabs from '../components/ui/PillTabs';
import ProxySection from '../components/settings/ProxySection';
import { AccountsSection } from '../components/settings/AccountSection';
import { ParserSection } from '../components/settings/ParserSection';
import { useBodyBackground } from '../hooks/useBodyBackground';

type SettingsTab = 'proxy' | 'parser' | 'accounts';

const SettingsPage: React.FC = () => {
  const location = useLocation();
  const stateTab = (location.state as { tab?: string } | null)?.tab;
  const initialTab: SettingsTab = (stateTab === 'parser' || stateTab === 'accounts') ? stateTab : 'proxy';
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const accountsRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const registerAccountsRefresh = useCallback((loadFn: () => Promise<void>) => {
    accountsRefreshRef.current = loadFn;
  }, []);

  const tabs = useMemo(() => ([
    { id: 'proxy', label: 'Прокси' },
    { id: 'parser', label: 'Парсер' },
    { id: 'accounts', label: 'Аккаунты' },
  ]), []);

  // Track which tabs have been visited to keep them mounted
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(['proxy', initialTab]));

  const handleTabChange = useCallback((id: string) => {
    setTab(id as typeof tab);
    setMountedTabs(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (id === 'accounts' && accountsRefreshRef.current) {
      accountsRefreshRef.current();
    }
  }, []);

  useBodyBackground('bg-gradient-noise');

  return (
    <div className="min-h-screen pt-safe">
      <div className="px-4 pt-4" style={{ paddingBottom: 'calc(var(--navbar-height, 86px) + 8px)' }}>
        <h1 className="text-white text-[28px] font-bold mb-4">Настройки</h1>

        <PillTabs tabs={tabs} value={tab} onChange={handleTabChange} />

        {/* Keep tabs mounted once visited to preserve state */}
        <div style={{ display: tab === 'proxy' ? 'block' : 'none' }}>
          {mountedTabs.has('proxy') && <ProxySection />}
        </div>
        <div style={{ display: tab === 'parser' ? 'block' : 'none' }}>
          {mountedTabs.has('parser') && <ParserSection />}
        </div>
        <div style={{ display: tab === 'accounts' ? 'block' : 'none' }}>
          {mountedTabs.has('accounts') && <AccountsSection onMount={registerAccountsRefresh} />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
