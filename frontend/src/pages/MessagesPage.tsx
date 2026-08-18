import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchIcon from '@img/search-icon.svg?react';
import { Link } from 'react-router-dom';
import { useKeyboardOpen } from '../hooks/useKeyboardOpen';
import { persistListScroll, useSessionListScroll } from '../hooks/useSessionListScroll';
import { registerMessagesListFlush } from '../utils/listScrollRegistry';
import { useDialogsAutoUpdate } from '../hooks/useDialogsAutoUpdate';
import { useAppStore } from '../store/appStore';
import { dialogService } from '../api';
import Skeleton from '../components/Skeleton';
import { useBodyBackground } from '../hooks/useBodyBackground';
import type { Dialog } from '../api/types';

const fallbackIsoString = () => new Date().toISOString();

const chatPlural = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'чат';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'чата';
  return 'чатов';
};

const normalizeDialogTimestamp = (raw?: string): string => {
  if (!raw) return fallbackIsoString();
  const value = raw.trim();
  if (!value) return fallbackIsoString();

  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallbackIsoString() : date.toISOString();
  }

  const isoNoZoneMatch = value.match(
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?(?:\.([0-9]+))?$/
  );
  if (isoNoZoneMatch) {
    const [, y, m, d, hh, mm, ss = '0'] = isoNoZoneMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? fallbackIsoString() : date.toISOString();
  }

  const ddmmMatch = value.match(
    /^([0-9]{2})-([0-9]{2})-([0-9]{4})[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?(?:\.([0-9]+))?$/
  );
  if (ddmmMatch) {
    const [, d, m, y, hh, mm, ss = '0'] = ddmmMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? fallbackIsoString() : date.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackIsoString() : parsed.toISOString();
};

const parseDialogDate = (dateString: string): Date => {
  try {
    return new Date(normalizeDialogTimestamp(dateString));
  } catch (error) {
    console.error('Failed to parse date:', dateString, error);
    return new Date();
  }
};

const PAGE_SIZE = 200;

const MessagesPage: React.FC = () => {
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue, setDebouncedSearchValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [page, setPage] = useState(1);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isKeyboardOpen = useKeyboardOpen();

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDialogs, setSelectedDialogs] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const [searchResults, setSearchResults] = useState<Dialog[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearch, setHasMoreSearch] = useState(false);

  const { dialogs, addNotification } = useAppStore();

  const [fetchingDialogs, setFetchingDialogs] = useState(() => {
    try {
      const n = (useAppStore.getState().dialogs ?? []).filter((d) => !d.isDeleted).length;
      return n === 0;
    } catch {
      return true;
    }
  });

  const [afterMount, setAfterMount] = useState(false);
  useEffect(() => {
    setAfterMount(true);
  }, []);

  useBodyBackground('bg-gradient-noise');

  useDialogsAutoUpdate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchValue(searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    const q = debouncedSearchValue.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;

    const loadSearch = async () => {
      try {
        const results = await dialogService.searchDialogs({ q, page: 1, limit: PAGE_SIZE });
        if (cancelled) return;

        const normalized = results.map((d) => ({
          ...d,
          updatedAt: normalizeDialogTimestamp(d.updatedAt),
        }));

        normalized.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        setSearchResults(normalized);
        setSearchPage(1);
        setHasMoreSearch(results.length === PAGE_SIZE);
      } catch (error) {
        if (!cancelled) {
          console.error('Search failed:', error);
          addNotification({
            id: Date.now().toString(),
            message: 'Ошибка поиска диалогов. Проверьте подключение к интернету.',
            type: 'error',
            timestamp: Date.now(),
          });
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };

    loadSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchValue, addNotification]);

  useEffect(() => {
    const { setDialogs, setLoading, setError } = useAppStore.getState();
    let cancelled = false;

    const loadDialogs = async () => {
      const existingAll = useAppStore.getState().dialogs ?? [];
      const existing = Array.isArray(existingAll) ? existingAll.filter((d) => !d.isDeleted) : [];
      const hasLocalList = existing.length > 0;

      if (!hasLocalList) {
        setFetchingDialogs(true);
        setLoading(true);
      }

      try {
        const dialogsArr = await dialogService.getDialogs({ page: 1, limit: PAGE_SIZE });
        if (cancelled) return;

        const arr = Array.isArray(dialogsArr) ? dialogsArr : [];

        const uniqueDialogs = arr.filter((dialog, index, self) => index === self.findIndex((d) => d.id === dialog.id));

        const normalized = uniqueDialogs.map((d) => ({
          ...d,
          updatedAt: normalizeDialogTimestamp(d.updatedAt),
        }));

        normalized.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        if (!hasLocalList) {
          setDialogs(normalized);
          setPage(1);
          setHasMore(uniqueDialogs.length === PAGE_SIZE);
          return;
        }

        const mergedById = new Map<number, Dialog>();
        for (const d of existing) mergedById.set(d.id as number, d as Dialog);
        for (const d of normalized) mergedById.set(d.id as number, d as Dialog);
        const merged = Array.from(mergedById.values());
        merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        setDialogs(merged);
        const estPage = Math.max(1, Math.ceil(merged.length / PAGE_SIZE));
        setPage(estPage);
        setHasMore(uniqueDialogs.length === PAGE_SIZE);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load dialogs:', error);
          if (!hasLocalList) {
            addNotification({
              id: Date.now().toString(),
              message: 'Ошибка загрузки диалогов. Проверьте подключение к интернету.',
              type: 'error',
              timestamp: Date.now(),
            });
            setError(error instanceof Error ? error.message : 'Failed to load dialogs');
          }
        }
      } finally {
        setFetchingDialogs(false);
        setLoading(false);
      }
    };

    loadDialogs();
    return () => {
      cancelled = true;
    };
  }, [addNotification]);

  const loadNextPage = useCallback(async () => {
    if (isLoadingMore || fetchingDialogs || !hasMore || debouncedSearchValue.trim()) return;

    const { setDialogs } = useAppStore.getState();
    setIsLoadingMore(true);

    const nextPage = page + 1;

    try {
      const dialogsArr = await dialogService.getDialogs({ page: nextPage, limit: PAGE_SIZE });
      const arr = Array.isArray(dialogsArr) ? dialogsArr : [];

      if (arr.length < PAGE_SIZE) setHasMore(false);

      const prev = useAppStore.getState().dialogs as Dialog[];
      const existingIds = new Set(prev.map((d) => d.id));

      const toAdd = arr
        .filter((d: Dialog) => !existingIds.has(d.id))
        .map((d: Dialog) => ({
          ...d,
          updatedAt: normalizeDialogTimestamp(d.updatedAt),
        }));

      if (toAdd.length) {
        const merged = [...prev, ...toAdd];
        merged.sort((a: Dialog, b: Dialog) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setDialogs(merged);
      }

      setPage(nextPage);
    } catch (e) {
      console.error('Failed to load next dialogs page', e);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, isLoadingMore, fetchingDialogs, hasMore, debouncedSearchValue]);

  const loadNextSearchPage = useCallback(async () => {
    if (isLoadingMore || !hasMoreSearch || !debouncedSearchValue.trim()) return;

    setIsLoadingMore(true);
    const nextPage = searchPage + 1;

    try {
      const results = await dialogService.searchDialogs({ q: debouncedSearchValue.trim(), page: nextPage, limit: PAGE_SIZE });
      if (results.length < PAGE_SIZE) setHasMoreSearch(false);

      const normalized = results.map((d) => ({
        ...d,
        updatedAt: normalizeDialogTimestamp(d.updatedAt),
      }));

      setSearchResults((prev) => {
        const merged = [...prev, ...normalized];
        merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return merged;
      });

      setSearchPage(nextPage);
    } catch (e) {
      console.error('Failed to load next search page', e);
      setHasMoreSearch(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [searchPage, isLoadingMore, hasMoreSearch, debouncedSearchValue]);


  const handleSearchWrapperClick = () => {
    inputRef.current?.focus();
  };

  const visibleDialogs = React.useMemo(() => (dialogs || []).filter((d) => !d.isDeleted), [dialogs]);

  const displayedDialogs = React.useMemo(() => {
    return debouncedSearchValue.trim() ? searchResults : visibleDialogs;
  }, [debouncedSearchValue, searchResults, visibleDialogs]);

  const listScrollKey = useMemo(
    () => `messages:list:${debouncedSearchValue.trim().slice(0, 200) || 'all'}`,
    [debouncedSearchValue]
  );

  const canRestoreListScroll = afterMount && !isSearching && !fetchingDialogs;
  const listScrollRef = useSessionListScroll(listScrollKey, canRestoreListScroll, displayedDialogs.length);

  useEffect(() => {
    const flush = () => persistListScroll(listScrollKey, listScrollRef.current);
    return registerMessagesListFlush(flush);
  }, [listScrollKey]);

  useEffect(() => {
    const hasMoreToLoad = debouncedSearchValue.trim() ? hasMoreSearch : hasMore;
    if (!hasMoreToLoad) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let raf = 0;

    const attach = () => {
      const root = listScrollRef.current;
      const target = loadMoreRef.current;
      if (!root || !target || cancelled) return;

      observer?.disconnect();

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            if (debouncedSearchValue.trim()) {
              void loadNextSearchPage();
            } else {
              void loadNextPage();
            }
          });
        },
        { root, rootMargin: '200px', threshold: 0 }
      );
      observer.observe(target);
    };

    attach();
    raf = window.requestAnimationFrame(() => attach());

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [loadNextPage, loadNextSearchPage, hasMore, hasMoreSearch, debouncedSearchValue, displayedDialogs.length]);

  const allVisibleSelected = React.useMemo(() => {
    if (!displayedDialogs.length) return false;
    return displayedDialogs.every((d) => selectedDialogs.has(d.id as number));
  }, [displayedDialogs, selectedDialogs]);

  const toggleSelectAll = useCallback(() => {
    const ids = displayedDialogs.map((d) => d.id as number);
    if (!ids.length) return;

    setSelectedDialogs((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, [displayedDialogs]);

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedDialogs);
    if (ids.length === 0) return;

    setIsDeleting(true);

    try {
      await dialogService.deleteDialogs(ids);
      const { setDialogs } = useAppStore.getState();
      const remaining = (dialogs || []).filter((d) => !selectedDialogs.has(d.id as number));
      setDialogs(remaining);

      addNotification({
        id: Date.now().toString(),
        message: `Удалено ${ids.length} ${ids.length === 1 ? 'чат' : 'чатов'}`,
        type: 'success',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Ошибка при удалении диалогов:', error);
      addNotification({
        id: Date.now().toString(),
        message: 'Не удалось удалить чаты. Попробуйте позже.',
        type: 'error',
        timestamp: Date.now(),
      });
    } finally {
      setIsDeleting(false);
      setSelectedDialogs(new Set());
      setIsEditMode(false);
    }
  };

  return (
    <div className="fixed inset-0">
      <div
        ref={listScrollRef}
        className="h-full overflow-y-auto overscroll-y-contain touch-pan-y"
        style={{
          paddingBottom: isKeyboardOpen
            ? '15px'
            : isEditMode && selectedDialogs.size > 0
              ? 'calc(var(--navbar-height, 86px) + 96px)'
              : 'calc(var(--navbar-height, 86px) + 8px)',
        }}
      >
        {/* Sticky header — progressive-blur on the whole header */}
        <div
          className="sticky top-0 z-40 progressive-blur progressive-blur-no-dim px-4 pb-3"
          style={{ paddingTop: 'max(var(--safe-area-inset-top, 0px), 12px)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-white text-[28px] font-bold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Чаты</h1>
            <div className="flex items-center gap-3">
              {isEditMode && (
                <button
                  onClick={toggleSelectAll}
                  disabled={!displayedDialogs.length}
                  className="text-accent font-semibold text-[15px] active:opacity-70 transition whitespace-nowrap disabled:opacity-40"
                >
                  {allVisibleSelected ? 'Снять' : 'Все'}
                </button>
              )}
              <button
                onClick={() => {
                  if (isEditMode) setSelectedDialogs(new Set());
                  setIsEditMode(!isEditMode);
                }}
                className="text-accent font-semibold text-[15px] active:opacity-70 transition"
              >
                {isEditMode ? 'Готово' : 'Изм.'}
              </button>
            </div>
          </div>
          <div
            className={`text-text-secondary rounded-full flex px-4 py-2 transition-all duration-300 ease-in-out glass-border-light ${searchValue || isFocused ? 'justify-start' : 'justify-center'}`}
            onClick={handleSearchWrapperClick}
            style={{
              cursor: 'text',
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
            }}
          >
            <div
              className={`flex items-center transition-all duration-300 ease-in-out ${isFocused ? 'mr-auto' : 'mx-auto'}`}
            >
              <SearchIcon
                className={`w-5 h-5 flex-shrink-0 transition-all duration-300 ease-in-out ${isFocused ? 'mr-2' : 'mr-0'}`}
              />
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={isFocused ? '' : 'Поиск'}
                className={`bg-transparent text-white placeholder-text-secondary outline-none transition-all duration-300 ease-in-out ${searchValue || isFocused ? 'w-auto flex-1 text-left' : 'w-[60px] text-center'}`}
              />
            </div>
          </div>
        </div>
        {fetchingDialogs || isSearching ? (
          <div className="px-4 pt-2 space-y-3 animate-fadeIn">
            {[48, 62, 38, 55, 44, 50].map((textW, index) => (
              <div
                key={index}
                className="rounded-[20px] p-4 flex items-center gap-3 glass-border-light"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(16px) saturate(1.2)',
                  WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                  animationDelay: `${index * 60}ms`,
                  animationFillMode: 'both',
                }}
              >
                <Skeleton variant="circular" width={48} height={48} className="flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex justify-between items-center">
                    <Skeleton width={`${textW}%`} height={16} className="rounded-full" />
                    <Skeleton width={32} height={12} className="rounded-full" />
                  </div>
                  <Skeleton width={`${textW + 15}%`} height={12} className="rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !displayedDialogs || displayedDialogs.length === 0 ? (
          <div className="text-white/40 text-center py-16 text-[15px] font-medium">
            {debouncedSearchValue.trim() ? 'Ничего не найдено' : 'Нет диалогов'}
          </div>
        ) : (
          displayedDialogs
            .map((dialog: Dialog, index: number) => {
              const inactive = dialog.isActive === false;
              const isSelected = selectedDialogs.has(dialog.id as number);

              const content = (
                <>
                  <div className="w-14 h-14 rounded-[14px] overflow-hidden mr-3 flex-shrink-0 bg-gray-700 relative">
                    {dialog.dialogImage ? (
                      <img src={dialog.dialogImage} alt={dialog.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                        {dialog.title.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute z-10 bottom-1 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs font-semibold px-2 py-0.5 rounded-md">
                      {dialog.workerId}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center flex-1 min-w-0">
                        {dialog.isReserved && (
                          <span
                            title="Забронировано"
                            aria-label="Забронировано"
                            className="flex-shrink-0 mr-1.5 inline-flex items-center justify-center w-5 h-5 rounded-md bg-accent text-black"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                              <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
                            </svg>
                          </span>
                        )}
                        <h3 className="text-white font-medium truncate">{dialog.title}</h3>
                        {dialog.price && (
                          <span className="text-accent ml-2 font-medium flex-shrink-0">{dialog.price} ₽</span>
                        )}
                      </div>
                      <span className="text-text-secondary ml-2 text-sm flex-shrink-0">
                        {parseDialogDate(dialog.updatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between items-start">
                      <p className="text-text-secondary truncate">
                        {dialog.isLastByUser ? (
                          <>
                            <span className="text-text-secondary/60 mr-2">Вы</span>
                            {dialog.lastMessage.replace(/^Вы:\s?/, '')}
                          </>
                        ) : dialog.lastMessage?.startsWith('Вы:') ? (
                          <>
                            <span className="text-text-secondary/60 mr-2">Вы</span>
                            {dialog.lastMessage.replace(/^Вы:\s?/, '')}
                          </>
                        ) : (
                          dialog.lastMessage
                        )}
                      </p>
                      {dialog.newMessagesAmount > 0 && (
                        <span className="bg-accent text-black text-xs rounded-full w-6 h-6 flex items-center justify-center font-medium ml-2 flex-shrink-0">
                          {dialog.newMessagesAmount > 99 ? '99+' : dialog.newMessagesAmount}
                        </span>
                      )}
                    </div>
                  </div>
                  {isEditMode && (
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className={`w-6 h-6 rounded-full ml-3 flex-shrink-0 flex items-center justify-center transition-colors duration-150 ${isSelected
                        ? 'bg-accent'
                        : 'border-[1.5px] border-white/25 bg-white/5'
                        }`}
                    >
                      <AnimatePresence>
                        {isSelected && (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="black"
                            className="w-4 h-4"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-7.414 7.414a1 1 0 01-1.414 0L3.293 9.707a1 1 0 111.414-1.414L8 11.586l6.293-6.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </motion.svg>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </>
              );

              return (
                <div key={`${dialog.id}-${index}`}>
                  {isEditMode ? (
                    <div
                      className={`px-4 py-4 flex items-center transition-colors duration-200 cursor-pointer ${isSelected ? 'bg-accent/[0.08]' : 'hover:bg-white/5'} ${inactive ? 'opacity-60 grayscale' : ''
                        }`}
                      onClick={() => {
                        setSelectedDialogs((prev) => {
                          const next = new Set(prev);
                          const id = dialog.id as number;
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                    >
                      {content}
                    </div>
                  ) : (
                    <Link
                      data-scroll-anchor={dialog.id}
                      to={`/messages/chat/${dialog.id}`}
                      className={`px-4 py-4 flex items-center hover:bg-white/5 transition-colors duration-200 cursor-pointer ${inactive ? 'opacity-60 grayscale' : ''
                        }`}
                      onPointerDownCapture={() =>
                        persistListScroll(listScrollKey, listScrollRef.current, dialog.id as number)
                      }
                      onClick={() => {
                        persistListScroll(listScrollKey, listScrollRef.current, dialog.id as number);
                        const { setCurrentDialog } = useAppStore.getState();
                        setCurrentDialog(dialog as Dialog);
                      }}
                    >
                      {content}
                    </Link>
                  )}
                  <hr className="border-0 mx-4" style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
                </div>
              );
            })
        )}
        <div ref={loadMoreRef} className="h-6" />
      </div>

      <AnimatePresence>
        {isEditMode && selectedDialogs.size > 0 && (
          <motion.button
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            className="fixed left-4 right-4 z-[60] py-3.5 rounded-[20px] text-white font-semibold disabled:opacity-60 glass-border-light"
            style={{
              bottom: 'calc(var(--navbar-height, 86px) + 12px)',
              background: isDeleting ? 'rgba(120,120,128,0.35)' : 'rgba(255,59,48,0.55)',
              backdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(1.08)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            {isDeleting ? 'Удаление...' : `Удалить ${selectedDialogs.size} ${chatPlural(selectedDialogs.size)}`}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MessagesPage;
