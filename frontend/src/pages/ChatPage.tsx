import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { copyToClipboard } from '../utils/clipboard';
import { useChatAutoUpdate } from '../hooks/useChatAutoUpdate';
import { dialogService, templateService, type Template } from '../api';
import SendIcon from '@img/send-message-icon.svg?react';
import AttachIcon from '@img/attachment-icon.svg?react';
import QrSampleIcon from '@img/qr-sample-icon.svg?react';
import Skeleton from '../components/Skeleton';
import { API_BASE_URL } from '../api/config';
import { useBodyBackground } from '../hooks/useBodyBackground';
import { useSmoothKeyboard } from '../hooks/useSmoothKeyboard';

const buildImageUrl = (raw: string | undefined): string | undefined => {
  if (!raw) return raw;
  const r = raw.trim();
  if (/^https?:\/\//i.test(r)) return r;
  const file = r.split(/[\\/]/).pop() || r;
  return `${API_BASE_URL}/images/${file}`;
};

const FOOTER_HEIGHT = 64;

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [imageModal, setImageModal] = useState<{ src: string; visible: boolean }>({ src: '', visible: false });
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadButton, setShowUnreadButton] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  // Поле ушло в скролл (>4 строк) — добавляем нижний отступ контейнеру.
  const [isInputScrolling, setIsInputScrolling] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const {
    templates: storeTemplates,
    messages,
    setMessages,
    addMessage,
    dialogs,
    currentDialog,
    setCurrentDialog,
    addNotification,
    setTemplates,
    setDialogs,
  } = useAppStore();

  const dialogId = Number(id);
  const dialog = dialogs.find((d) => d.id === dialogId) || currentDialog;
  const inactiveDialog = !!(dialog && dialog.isActive === false);

  useBodyBackground('bg-gradient-noise');

  useChatAutoUpdate(dialogId);

  const prevMessagesLength = useRef(0);
  const prevLastCreatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) {
        console.log('No dialog ID provided');
        return;
      }
      const dialogIdNum = Number(id);

      try {
        let dialogsState = dialogs;
        if (!dialogsState.length || !dialogsState.some((d) => d.id === dialogIdNum)) {
          try {
            console.log('🔄 Загружаем список диалогов (прямой вход)...');
            const fetched = await dialogService.getDialogs();
            setDialogs(Array.isArray(fetched) ? fetched : []);
            dialogsState = Array.isArray(fetched) ? fetched : [];
          } catch (e) {
            console.warn('Не удалось загрузить диалоги при прямом входе', e);
          }
        }

        const currentDialogData = dialogsState.find((d) => d.id === dialogIdNum) || null;
        if (currentDialogData) {
          setCurrentDialog(currentDialogData);
        } else {
          console.log('Диалог не найден после загрузки списка — продолжим, покажем только сообщения.');
        }

        const messagesData = await dialogService.getMessages(dialogIdNum);
        setMessages(dialogIdNum, messagesData);

      } catch (error) {
        console.error('Failed to load data:', error);
        addNotification({
          id: Date.now().toString(),
          message: 'Ошибка загрузки данных. Проверьте подключение к интернету.',
          type: 'error',
          timestamp: Date.now(),
        });
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, setMessages, setCurrentDialog, addNotification, setDialogs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isMenuOpen) return;
      const t = event.target as Element;
      if (menuBtnRef.current?.contains(t)) return;
      if (t.closest('[data-chat-menu]')) return;
      setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const markMessagesAsRead = useCallback(async () => {
    if (!dialogId) return;
    try {
      const currentDialogs = useAppStore.getState().dialogs;
      const updatedDialogs = currentDialogs.map((d) => (d.id === dialogId ? { ...d, newMessagesAmount: 0 } : d));
      setDialogs(updatedDialogs);
      setUnreadCount(0);
      setShowUnreadButton(false);
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [dialogId, setDialogs]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distance = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distance < 50;

    setIsAtBottom(isNearBottom);

    if (!programmaticScrollRef.current) {
      userScrolledUpRef.current = !isNearBottom;
    }

    if (isNearBottom) {
      setShowUnreadButton(false);
      setUnreadCount(0);
    }
  }, []);

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      const container = chatContainerRef.current;
      if (container) {
        programmaticScrollRef.current = true;
        const scrollTarget = container.scrollHeight - container.clientHeight;
        if (behavior === 'auto') {
          container.scrollTop = scrollTarget;
        } else {
          container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }

      if (unreadCount > 0) {
        markMessagesAsRead();
      }
    },
    [unreadCount, markMessagesAsRead]
  );

  const truncateText = (text: string, maxLength: number) => (text.length > maxLength ? text.slice(0, maxLength) + '...' : text);

  const chatName = dialog ? truncateText(dialog.title, 28) : 'Диалог';

  const TEMPLATE_MAX_LENGTH = 28;
  const truncateTemplateTitle = (title: string) =>
    title.length > TEMPLATE_MAX_LENGTH ? title.slice(0, TEMPLATE_MAX_LENGTH - 3) + '...' : title;

  useEffect(() => {
    if (storeTemplates.length === 0) {
      (async () => {
        try {
          const res = await templateService.getUserTemplates();
          if (res && Array.isArray(res.templates)) {
            setTemplates(res.templates as Template[]);
          }
        } catch (e) {
          console.error('Failed to load templates', e);
          addNotification({
            id: Date.now().toString(),
            message: 'Не удалось загрузить шаблоны',
            type: 'error',
            timestamp: Date.now(),
          });
        }
      })();
    }
  }, [storeTemplates.length, setTemplates, addNotification]);

  const templates = storeTemplates;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      scrollToBottom('auto');
    }
  }, [scrollToBottom]);

  useEffect(() => {
    if (!isLoadingMessages && chatContainerRef.current) {
      const timer = setTimeout(() => {
        scrollToBottom('smooth');
        setUnreadCount(0);
        setShowUnreadButton(false);

        const curr = (useAppStore.getState().messages[dialogId] || []);
        prevMessagesLength.current = curr.length;
        prevLastCreatedAtRef.current = curr[curr.length - 1]?.createdAt || null;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoadingMessages, scrollToBottom, dialogId]);

  const handleImageLoad = useCallback(() => {
    if (isAtBottom && !isLoadingMessages) {
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  }, [isAtBottom, isLoadingMessages, scrollToBottom]);

  useEffect(() => {
    const currentMessages = messages[dialogId] || [];
    const last = currentMessages[currentMessages.length - 1];
    const lastCreatedAt = last?.createdAt || null;

    if (prevLastCreatedAtRef.current === null) {
      prevLastCreatedAtRef.current = lastCreatedAt;
      prevMessagesLength.current = currentMessages.length;
      return;
    }

    if (!isLoadingMessages && prevMessagesLength.current > 0 && currentMessages.length > prevMessagesLength.current) {
      const newMessages = currentMessages.slice(prevMessagesLength.current);
      const prevTailTime = prevLastCreatedAtRef.current ? new Date(prevLastCreatedAtRef.current).getTime() : 0;

      const trulyNewIncoming = newMessages.filter((m) => !m.isSentByUser && new Date(m.createdAt).getTime() > prevTailTime).length;

      if (trulyNewIncoming > 0) {
        if (isAtBottom) {
          setTimeout(() => scrollToBottom('auto'), 30);
          setShowUnreadButton(false);
        } else if (userScrolledUpRef.current) {
          setUnreadCount((prev) => prev + trulyNewIncoming);
          setShowUnreadButton(true);
        }
      }
    }

    prevMessagesLength.current = currentMessages.length;
    prevLastCreatedAtRef.current = lastCreatedAt;
  }, [messages, dialogId, isAtBottom, isLoadingMessages, scrollToBottom]);

  useEffect(() => {
    if (!dialog) return;
    const currentCount = dialog.newMessagesAmount || 0;

    if (isAtBottom) {
      setUnreadCount(0);
      setShowUnreadButton(false);
    } else {
      setUnreadCount(currentCount);
      setShowUnreadButton(userScrolledUpRef.current && currentCount > 0);
    }
  }, [dialog, isAtBottom]);

  useEffect(() => {
    if (!isLoadingMessages && dialogId) {
      markMessagesAsRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingMessages, dialogId]);

  const templatesPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isPanelOpen && templatesPanelRef.current) {
      templatesPanelRef.current.scrollTop = 0;
    }
  }, [isPanelOpen]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const kbSpacerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState<number>(FOOTER_HEIGHT);
  const MAX_ROWS = 4;

  // Плавное появление/скрытие клавиатуры: страница верстается от «высоты
  // покоя», ресайз вьюпорта ничего не двигает, футер и лента едут только
  // нашей анимацией (см. useSmoothKeyboard).
  useSmoothKeyboard(footerRef, chatContainerRef, kbSpacerRef);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const cs = window.getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight || '20');
    const padTop = parseFloat(cs.paddingTop || '0');
    const padBottom = parseFloat(cs.paddingBottom || '0');
    const maxHeight = lineHeight * MAX_ROWS + padTop + padBottom;
    const overflowing = ta.scrollHeight > maxHeight;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    ta.style.overflowY = overflowing ? 'auto' : 'hidden';
    // Нижний отступ даём снаружи скролла (на контейнере) — иначе паддинг textarea
    // не виден в покое: браузер скроллит к каретке и ставит строку впритык.
    setIsInputScrolling(overflowing);
  }, [inputValue]);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const update = () => setFooterHeight(el.offsetHeight || FOOTER_HEIGHT);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!dialogId) return;
    if (!text && !pendingImageFile && !pendingImagePreview) return;

    try {
      let attachmentUrl: string | undefined;

      if (pendingImageFile) {
        setUploading(true);
        try {
          const { uploadService } = await import('../api');
          const up = await uploadService.uploadPhoto(pendingImageFile);

          const raw = up.url || '';
          let relative: string;
          if (raw.startsWith('storage/pictures/')) {
            relative = raw;
          } else if (raw.startsWith('//')) {
            relative = 'storage/pictures/' + raw.replace(/^\/+/, '');
          } else if (raw.startsWith('/')) {
            relative = 'storage/pictures' + raw;
          } else {
            relative = 'storage/pictures/' + raw;
          }
          attachmentUrl = relative;
        } catch (e) {
          console.error('Upload failed', e);
          addNotification({ id: Date.now().toString(), message: 'Ошибка загрузки фото', type: 'error', timestamp: Date.now() });
          setUploading(false);
          return;
        } finally {
          setUploading(false);
        }
      }

      const response = await dialogService.sendMessage(dialogId, {
        messageData: { text, attachment: attachmentUrl },
      });

      let newMessage: any;
      if (response.message) {
        newMessage = {
          ...response.message,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        // Бэк не вернул сообщение — показываем оптимистичную копию с временным
        // отрицательным id и pending: true, чтобы стор заменил её настоящей
        // версией из сокета/поллинга, а не показал обе.
        newMessage = {
          id: -Date.now(),
          pending: true,
          isSentByUser: true,
          isRead: false,
          text,
          attachment: attachmentUrl,
          dialogId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      addMessage(newMessage);

      setInputValue('');
      setPendingImageFile(null);
      if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
      setPendingImagePreview('');

      setTimeout(() => scrollToBottom('smooth'), 100);
      setUnreadCount(0);
      setShowUnreadButton(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      addNotification({
        id: Date.now().toString(),
        message: 'Ошибка отправки сообщения',
        type: 'error',
        timestamp: Date.now(),
      });
    }
  };

  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      addNotification({ id: Date.now().toString(), message: 'Недопустимый формат изображения', type: 'error', timestamp: Date.now() });
      e.target.value = '';
      return;
    }
    const max = 5 * 1024 * 1024;
    if (file.size > max) {
      addNotification({ id: Date.now().toString(), message: 'Файл > 5MB', type: 'error', timestamp: Date.now() });
      e.target.value = '';
      return;
    }

    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    const url = URL.createObjectURL(file);
    setPendingImageFile(file);
    setPendingImagePreview(url);
    e.target.value = '';
  };

  const handleInputFocus = () => {
    setIsPanelOpen(false);
  };

  const handleToggleAutomatic = async () => {
    if (!dialogId) return;
    const currentIsAutomatic = dialog?.isAutomatic || false;
    const nextIsAutomatic = !currentIsAutomatic;

    // Синхронно проставляем isAutomatic по свежему состоянию стора,
    // чтобы не затирать параллельные обновления диалога (новые сообщения и т.п.).
    const applyIsAutomatic = (value: boolean) => {
      const store = useAppStore.getState();
      store.setDialogs(store.dialogs.map((d) => (d.id === dialogId ? { ...d, isAutomatic: value } : d)));
      if (store.currentDialog?.id === dialogId) {
        store.setCurrentDialog({ ...store.currentDialog, isAutomatic: value });
      }
    };

    // Оптимистично переключаем галочку И показываем тост сразу, не дожидаясь ответа сервера.
    applyIsAutomatic(nextIsAutomatic);
    // Закрываем меню чуть позже — чтобы пользователь увидел, как галочка переключилась.
    window.setTimeout(() => setIsMenuOpen(false), 1000);
    addNotification({
      id: Date.now().toString(),
      message: nextIsAutomatic ? 'Автоотправка включена' : 'Автоотправка отключена',
      type: 'success',
      timestamp: Date.now(),
    });

    try {
      const response = await dialogService.toggleAutomatic(dialogId, currentIsAutomatic);
      // Подстраховка: синхронизируемся с фактическим значением сервера, если оно разошлось.
      if (response.isAutomatic !== nextIsAutomatic) applyIsAutomatic(response.isAutomatic);
    } catch {
      // Откат при ошибке.
      applyIsAutomatic(currentIsAutomatic);
      addNotification({
        id: Date.now().toString(),
        message: 'Ошибка переключения автоотправки',
        type: 'error',
        timestamp: Date.now(),
      });
    }
  };

  const handleOpenAd = () => {
    if (!dialog?.kleinId) {
      addNotification({
        id: Date.now().toString(),
        message: 'ID объявления не найден',
        type: 'error',
        timestamp: Date.now(),
      });
      return;
    }
    const url = `https://kleinanzeigen.de/s-anzeige/${dialog.kleinId}`;
    window.open(url, '_blank');
    setIsMenuOpen(false);
  };

  const handleCopyAdLink = async () => {
    if (!dialog?.kleinId) {
      addNotification({
        id: Date.now().toString(),
        message: 'ID объявления не найден',
        type: 'error',
        timestamp: Date.now(),
      });
      return;
    }
    const url = `https://kleinanzeigen.de/s-anzeige/${dialog.kleinId}`;
    try {
      await copyToClipboard(url);
      addNotification({
        id: Date.now().toString(),
        message: 'Ссылка скопирована',
        type: 'success',
        timestamp: Date.now(),
      });
      setIsMenuOpen(false);
    } catch {
      addNotification({
        id: Date.now().toString(),
        message: 'Не удалось скопировать ссылку',
        type: 'error',
        timestamp: Date.now(),
      });
    }
  };

  const swipeActiveRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const EDGE_PX = 80;
  const TRIGGER_X = 80;

  const onRootPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.clientX > EDGE_PX) return;
    // Касание по тексту сообщения — это выделение, а не свайп назад.
    // Иначе долгий тап + перетаскивание маркеров выделения по горизонтали
    // ловится как жест назад и выкидывает в список диалогов.
    if ((e.target as Element | null)?.closest?.('.message-bubble')) return;
    swipeActiveRef.current = true;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    dxRef.current = 0;
    dyRef.current = 0;
  };

  const onRootPointerMove = (e: React.PointerEvent) => {
    if (!swipeActiveRef.current || pointerIdRef.current !== e.pointerId) return;
    dxRef.current = e.clientX - startXRef.current;
    dyRef.current = e.clientY - startYRef.current;
  };

  const finishSwipe = (e: React.PointerEvent) => {
    if (!swipeActiveRef.current || pointerIdRef.current !== e.pointerId) return;
    const dx = dxRef.current;
    const dy = dyRef.current;
    swipeActiveRef.current = false;
    pointerIdRef.current = null;
    // Пока есть активное выделение текста — не уходим назад: пользователь
    // выделяет, а не свайпает.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    if (dx > TRIGGER_X && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigate('/messages');
    }
  };

  const glassStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
    // Собственный GPU-слой: без него WebKit пере-растеризует backdrop-filter
    // при ресайзе вьюпорта под клавиатуру, и стекло моргает.
    transform: 'translateZ(0)',
  };

  // Текст сообщения: пока переводится/переведён — та же анимация, что у поля
  // ввода (оригинал держится до первой дельты, «уезжает», стрим печатается).
  const renderMessageText = (msg: { id: number; text: string }, extraClass = '') => {
    const isTr = translatingMessages.has(msg.id);
    const translated = translatedMessages[msg.id];
    const showTranslated = isTr || (translated != null && translated.length > 0);
    return showTranslated ? (
      <TranslatedMessageText
        original={msg.text}
        translated={translated}
        translating={isTr}
        className={`select-text ${extraClass}`}
      />
    ) : (
      <span className={`select-text ${extraClass}`}>{msg.text}</span>
    );
  };

  return (
    <div
      className="h-screen flex flex-col"
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={finishSwipe}
    >
      {/* ── Floating header ── */}
      <div className="fixed top-0 left-0 right-0 z-40">
        <div
          className="px-3 flex items-center gap-2"
          style={{
            paddingTop: 'max(var(--safe-area-inset-top, 0px), 8px)',
            paddingBottom: 8,
          }}
        >
        {/* Back button */}
        <motion.div whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
          <Link
            to="/messages"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light flex-shrink-0"
            style={glassStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
        </motion.div>

        {/* Info pill: name + price + menu */}
        <div
          className="flex-1 min-w-0 h-9 rounded-full flex items-center px-3 gap-2 glass-border-light"
          style={glassStyle}
        >
          {dialog?.isReserved && (
            <span
              title="Забронировано"
              aria-label="Забронировано"
              className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md bg-accent text-black"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
              </svg>
            </span>
          )}
          <span className="text-white text-[14px] font-semibold truncate">{chatName}</span>
          {dialog?.price && <span className="text-accent text-[13px] font-medium flex-shrink-0">{dialog.price} €</span>}
          <div className="ml-auto flex-shrink-0">
            <button
              ref={menuBtnRef}
              onClick={() => {
                if (!isMenuOpen && menuBtnRef.current) {
                  const r = menuBtnRef.current.getBoundingClientRect();
                  setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
                }
                setIsMenuOpen(!isMenuOpen);
              }}
              className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="2.5" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13.5" r="1.5" fill="currentColor"/></svg>
            </button>
          </div>
        </div>

        {/* Avatar in glass circle */}
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 glass-border-light"
          style={glassStyle}
        >
          <div className="w-8 h-8 rounded-full overflow-hidden">
            {dialog?.dialogImage ? (
              <img src={buildImageUrl(dialog.dialogImage)} alt={dialog.title} className="w-full h-full object-cover" onLoad={handleImageLoad} onError={(e) => { console.warn('Dialog image failed', { src: (e.target as HTMLImageElement).src }); }} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                {dialog?.title.substring(0, 2).toUpperCase() || 'DI'}
              </div>
            )}
          </div>
        </div>
        </div>
        <div className="progressive-blur" style={{ height: 40 }} />
      </div>

      {/* ── Three-dot menu (portal — outside glass ancestors so backdrop-filter works) ── */}
      {isMenuOpen && menuPos && createPortal(
        <div
          data-chat-menu
          className="fixed z-[100] rounded-[16px] min-w-[200px] glass-border-light"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            background: 'rgba(28,28,28,0.35)',
            backdropFilter: 'blur(8px) saturate(180%) brightness(1.08)',
            WebkitBackdropFilter: 'blur(8px) saturate(180%) brightness(1.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 40px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={handleToggleAutomatic}
            className="w-full px-4 py-3 text-left text-white hover:bg-white/5 flex items-center gap-3 transition-colors rounded-t-[16px]"
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${dialog?.isAutomatic ? 'bg-accent border-accent' : 'border-white/40'}`}>
              {dialog?.isAutomatic && (
                <svg width="12" height="9" viewBox="0 0 12 9" fill="none"><path d="M10 1.5L4.5 7L2 4.5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </div>
            <span className="text-sm font-medium">Автоотправка</span>
          </button>
          {dialog?.kleinId && (
            <>
              <button type="button" onClick={handleOpenAd} className="w-full px-4 py-3 text-left text-white hover:bg-white/5 flex items-center gap-3 transition-colors">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9 2H14V7M14 2L8 8M6 3H3C2.44772 3 2 3.44772 2 4V13C2 13.5523 2.44772 14 3 14H12C12.5523 14 13 13.5523 13 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="text-sm font-medium">Открыть объявление</span>
              </button>
              <button type="button" onClick={() => void handleCopyAdLink()} className="w-full px-4 py-3 text-left text-white hover:bg-white/5 flex items-center gap-3 transition-colors rounded-b-[16px]">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.5 4.5H3.5C2.94772 4.5 2.5 4.94772 2.5 5.5V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5H10.5C11.0523 13.5 11.5 13.0523 11.5 12.5V10.5M6.5 2.5H12.5C13.0523 2.5 13.5 2.94772 13.5 3.5V9.5C13.5 10.0523 13.0523 10.5 12.5 10.5H6.5C5.94772 10.5 5.5 10.0523 5.5 9.5V3.5C5.5 2.94772 5.94772 2.5 6.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="text-sm font-medium">Скопировать ссылку</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* ── Messages area ── */}
      <div
        ref={chatContainerRef}
        className="messages-area overflow-y-auto px-4"
        style={{
          height: 'var(--viewport-rest-height, 100dvh)',
          paddingBottom: `${footerHeight + 16}px`,
          paddingTop: 'calc(max(var(--safe-area-inset-top, 0px), 8px) + 56px)',
        }}
        onClick={() => setIsPanelOpen(false)}
        onScroll={handleScroll}
      >
        <div className="flex flex-col space-y-3 justify-end min-h-full">
          {isLoadingMessages ? (
            <div className="space-y-3 animate-fadeIn">
              {[
                { right: false, w: 65 },
                { right: true, w: 55 },
                { right: false, w: 75 },
                { right: true, w: 45 },
                { right: false, w: 58 },
              ].map((cfg, index) => (
                <div key={index} className={`flex ${cfg.right ? 'justify-end' : 'justify-start'}`} style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}>
                  <div
                    className="rounded-[16px] glass-border-light"
                    style={{
                      width: `${cfg.w}%`,
                      height: 48,
                      background: cfg.right ? 'rgba(204,255,0,0.06)' : 'rgba(255,255,255,0.04)',
                      backdropFilter: 'blur(16px) saturate(1.2)',
                      WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                    }}
                  >
                    <div className="p-3 space-y-2">
                      <Skeleton width="70%" height={10} className="rounded-full" />
                      <Skeleton width="40%" height={8} className="rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            (messages[dialogId] || [])
              .slice()
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((msg, index) => (
                <div key={`${msg.id}-${msg.createdAt}-${index}`} className={`flex ${msg.isSentByUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`message-bubble max-w-[80%] whitespace-pre-line relative glass-border-light${!msg.attachment ? ' rounded-[16px]' : ' rounded-[16px]'}`}
                    style={
                      msg.attachment
                        ? {
                          padding: 0,
                          borderRadius: '16px',
                          background: 'transparent',
                          position: 'relative',
                          overflow: 'visible',
                        }
                        : {
                          paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '12px',
                          background: msg.isSentByUser ? 'rgba(204,255,0,0.12)' : 'rgba(255,255,255,0.08)',
                          backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
                          WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
                          color: 'white',
                        }
                    }
                  >
                    {msg.attachment ? (
                      (() => {
                        const att = buildImageUrl(msg.attachment);
                        return (
                          <div
                            className="text-white rounded-[16px] overflow-hidden inline-block glass-border-light"
                            style={{
                              maxWidth: 220,
                              background: msg.isSentByUser ? 'rgba(204,255,0,0.12)' : 'rgba(255,255,255,0.08)',
                              backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
                              WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
                            }}
                          >
                            <img
                              src={att}
                              alt="attachment"
                              className="block w-full max-h-[240px] object-cover"
                              onClick={() => setImageModal({ src: att || '', visible: true })}
                              onLoad={handleImageLoad}
                              onError={(e) => {
                                console.warn('Attachment image failed', { src: (e.target as HTMLImageElement).src });
                              }}
                            />
                            {(translatedMessages[msg.id] || msg.text)?.trim() && (
                              <div className="px-3 pt-2 pb-1 text-sm whitespace-pre-line break-words">
                                {renderMessageText(msg)}
                              </div>
                            )}
                            <div className="text-[10px] text-white/50 text-right px-3 pb-2">
                              {new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        {renderMessageText(msg)}
                        <div className={`text-xs text-right mt-1 ${msg.isSentByUser ? 'text-accent/50' : 'text-white/40'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </>
                    )}
                    {!msg.isSentByUser && (
                      <button
                        className="absolute -right-12 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center glass-border-light"
                        style={glassStyle}
                        onClick={() => handleTranslate(msg.id, msg.text)}
                        disabled={translatingMessages.has(msg.id)}
                      >
                        {translatingMessages.has(msg.id) ? (
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <TranslateIcon className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}
          <div ref={messagesEndRef} />
          {/* Распорка под клавиатуру: высоту анимирует useSmoothKeyboard */}
          <div ref={kbSpacerRef} className="flex-shrink-0" aria-hidden />
        </div>
      </div>
      {inactiveDialog ? (
        <div
          className="fixed left-0 right-0 bottom-0 z-20 px-3 text-center"
          style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom-limited, 0px) + 12px)' }}
        >
          <div
            className="rounded-full py-3 px-4 text-white/60 text-sm font-medium glass-border-light"
            style={glassStyle}
          >
            Диалог неактивен
          </div>
        </div>
      ) : (
        <div
          className="fixed top-0 left-0 right-0 z-20 pointer-events-none"
          style={{ height: 'var(--viewport-rest-height, 100dvh)' }}
        >
        {/* Холст «высоты покоя»: футер якорится к его низу, а не к вьюпорту —
            ресайз WebView под клавиатуру его не двигает (двигаем только мы). */}
        <div
          ref={footerRef}
          className="absolute left-0 right-0 bottom-0 px-4 flex items-end gap-2 pointer-events-auto"
          style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom-limited, 0px) + 8px)' }}
        >
          {pendingImagePreview && (
            <div className="absolute left-16 bottom-full mb-2 w-14 h-14">
              <img src={pendingImagePreview} alt="preview" className="w-14 h-14 object-cover rounded-xl border border-white/20" />
              <button
                className="absolute -top-2 -right-2 bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                onClick={() => {
                  if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
                  setPendingImagePreview('');
                  setPendingImageFile(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>
          )}
          {/* ── Таблетка перевода: на уровне футера (без backdrop-предка → блюр работает),
                выровнена по левому краю поля ввода (16px паддинг + 42px скрепка + 8px gap) ── */}
          <AnimatePresence>
            {showTranslatePill && (
              <motion.button
                key="translate-pill"
                type="button"
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                whileTap={{ scale: 0.96 }}
                // Не уводим фокус/клавиатуру при нажатии (важно на телефоне).
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleTranslateInput}
                className="absolute left-[66px] bottom-full mb-2 h-9 pl-3 pr-3.5 rounded-full flex items-center gap-2 text-white text-[13px] font-medium glass-border-light overflow-hidden z-10"
                style={glassStyle}
              >
                {/* Бегущий белый блик поверх стекла во время перевода */}
                {translateBusy && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.28) 50%, transparent 80%)',
                    }}
                    initial={{ x: '-120%' }}
                    animate={{ x: '120%' }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <span className="relative flex items-center justify-center w-4 h-4">
                  {translateBusy ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <TranslateIcon className="w-4 h-4 text-accent" />
                  )}
                </span>
                <span className="relative">
                  {translateBusy ? 'Перевод…' : 'Перевести на немецкий'}
                </span>
              </motion.button>
            )}
          </AnimatePresence>
          {/* Attach button — matches input height */}
          <label
            className="h-[42px] w-[42px] rounded-full flex items-center justify-center cursor-pointer flex-shrink-0 glass-border-light"
            style={glassStyle}
          >
            <AttachIcon className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleAttachImage} disabled={uploading} />
          </label>
          {/* Input pill */}
          <div
            className="relative flex-1 min-w-0 min-h-[42px] rounded-[21px] glass-border-light"
            style={{ ...glassStyle, paddingBottom: isInputScrolling ? 8 : undefined }}
          >
            {/* Стрим перевода — в потоке, задаёт высоту контейнера */}
            {showStream && (
              <motion.div
                ref={streamViewRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: translatePhase === 'finishing' ? 0 : 1 }}
                transition={{ duration: translatePhase === 'finishing' ? 0.18 : 0.28, ease: 'easeOut' }}
                className="w-full min-w-0 max-h-[120px] overflow-y-auto px-4 py-[9px] text-white text-[15px] leading-[24px] whitespace-pre-wrap"
                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              >
                {translateStreamText ? (
                  <StreamingText text={translateStreamText} streaming={translatePhase === 'streaming'} />
                ) : (
                  <span className="text-white/40">Переводим…</span>
                )}
              </motion.div>
            )}

            {/* Textarea всегда в DOM — держит фокус/клавиатуру; при стриминге прячется невидимым оверлеем */}
            <motion.div
              animate={
                translatePhase === 'streaming'
                  ? { opacity: 0 }
                  : translatePhase === 'exiting'
                    ? { opacity: 0, filter: 'blur(6px)', y: -6 }
                    : { opacity: 1, filter: 'blur(0px)', y: 0 }
              }
              transition={{ duration: translatePhase === 'exiting' ? 0.32 : 0.2, ease: [0.4, 0, 0.6, 1] }}
              className={showStream ? 'absolute inset-0 pointer-events-none' : 'relative'}
            >
              <textarea
                ref={textareaRef}
                placeholder="Сообщение"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                rows={1}
                className="block placeholder:text-white/50 placeholder:leading-[24px] w-full bg-transparent rounded-[21px] px-4 py-[9px] pr-12 outline-none resize-none h-[42px] leading-[24px] align-top"
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              {!translateBusy && (
                <button
                  type="button"
                  onClick={() => setIsPanelOpen((prev) => !prev)}
                  className="absolute right-3 bottom-[7px] w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <QrSampleIcon className="w-5 h-5 block" />
                </button>
              )}
            </motion.div>
          </div>
          {/* Send button — matches input height */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="h-[42px] w-[42px] rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-60 glass-border-light"
            style={{ ...glassStyle, background: 'rgba(204,255,0,0.9)' }}
            onClick={handleSend}
            disabled={uploading}
          >
            {uploading ? <div className="w-5 h-5 border-2 border-black/40 border-t-transparent rounded-full animate-spin" /> : <SendIcon className="w-5 h-5 text-black" />}
          </motion.button>
        </div>
        </div>
      )}
      <div
        className={`fixed left-0 right-0 bottom-0 z-10 p-4 transform transition-transform duration-300 ${isPanelOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        style={{
          borderTop: '0.5px solid rgba(255,255,255,0.08)',
          paddingBottom: 'calc(var(--safe-area-inset-bottom-limited, 0px) + 16px)',
          background: 'rgba(32,32,32,0.85)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
        }}
      >
        <div className="max-h-[220px] overflow-y-auto pb-6" ref={templatesPanelRef} style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom-limited, 0px) + 24px)' }}>
          <div className="flex gap-2 mb-3">
            <button
              className="flex-1 h-11 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 glass-border-light"
              style={{
                background: 'rgba(204,255,0,0.10)',
                color: '#CCFF00',
              }}
              onClick={() => setShowEmailModal(true)}
            >
              Отправить письмо
            </button>
            <button
              className="flex-1 h-11 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 glass-border-light"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
              }}
              onClick={openPriceModal}
            >
              Изменить цены
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pb-2">
            {templates.map((tpl, i) => (
              <button
                key={i}
                className="text-white px-2 rounded-[14px] font-medium min-w-0 text-center truncate text-[15px] glass-border-light"
                style={{
                  // Базис ~1/3 (макс. 3 в ряд), grow растягивает элементы, заполняя строку:
                  // 1 шаблон → вся ширина, 2 → пополам, неполная последняя строка тоже растягивается.
                  flex: '1 1 calc(33.333% - 8px)',
                  // Вертикальные отступы уменьшаются с числом строк (строк = ceil(len/3)):
                  // 1 строка (≤3) — 12px, 2 строки (≤6) — 9px, 3+ строк — 6px.
                  paddingTop: templates.length <= 3 ? 12 : templates.length <= 6 ? 9 : 6,
                  paddingBottom: templates.length <= 3 ? 12 : templates.length <= 6 ? 9 : 6,
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(16px) saturate(1.2)',
                  WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                }}
                onClick={() => {
                  setInputValue(tpl.texts?.[Math.floor(Math.random() * tpl.texts.length)] || '');
                  setIsPanelOpen(false);
                }}
                title={tpl.title}
              >
                {truncateTemplateTitle(tpl.title)}
              </button>
            ))}
            {templates.length === 0 && <div className="w-full text-center text-white/60 text-sm py-4">Нет шаблонов</div>}
            <div className="w-full h-6" />
          </div>
        </div>
      </div>
      {imageModal.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setImageModal({ src: '', visible: false })}>
          <img
            src={buildImageUrl(imageModal.src) || ''}
            alt="attachment-full"
            className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              console.warn('Modal image failed', { src: (e.target as HTMLImageElement).src });
            }}
          />
        </div>
      )}
      {showUnreadButton && unreadCount > 0 && (
        <div className="fixed right-4 z-30" style={{ bottom: `${footerHeight + 20}px` }}>
          <button
            onClick={() => scrollToBottom()}
            className="text-white rounded-full p-3 shadow-lg flex items-center gap-2 relative glass-border-light"
            style={{
              background: 'rgba(32,32,32,0.85)',
              backdropFilter: 'blur(24px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            <span className="absolute -top-2 -right-2 bg-accent text-black text-xs rounded-full w-6 h-6 flex items-center justify-center font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </button>
        </div>
      )}
      {isPriceModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closePriceModal}
        >
          <div
            className="w-full max-w-sm rounded-[24px] p-5 space-y-4 glass-border-light"
            style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-white text-lg font-semibold">Изменить цены</h3>
              <p className="text-sm text-white/40">Изменения сохраняются автоматически</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Цена товара</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceInput}
                    onChange={(e) => handlePriceInputChange(e.target.value)}
                    onBlur={() => flushPriceField('price')}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-full text-white placeholder-white/30 focus:outline-none glass-border-light"
                    style={{ background: 'rgba(0,0,0,0.3)' }}
                  />
                  {priceSaving.price && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Цена доставки</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={deliveryInput}
                    onChange={(e) => handleDeliveryInputChange(e.target.value)}
                    onBlur={() => flushPriceField('deliveryPrice')}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-full text-white placeholder-white/30 focus:outline-none glass-border-light"
                    style={{ background: 'rgba(0,0,0,0.3)' }}
                  />
                  {priceSaving.delivery && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-sm rounded-[24px] p-5 space-y-4 glass-border-light"
            style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.08)',
            }}
          >
            <div className="space-y-1">
              <h3 className="text-white text-lg font-semibold">Отправить письмо</h3>
              <p className="text-sm text-white/40">Введите email адрес получателя</p>
            </div>
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="example@email.com"
              className="w-full px-4 py-3 rounded-full text-white placeholder-white/30 focus:outline-none glass-border-light"
              style={{ background: 'rgba(0,0,0,0.3)' }}
              disabled={sendingEmail}
              autoFocus
            />
            <div className="flex gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailAddress('');
                }}
                disabled={sendingEmail}
                className="flex-1 h-11 rounded-full text-white font-medium transition disabled:opacity-50 glass-border-light"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                Отмена
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                onClick={handleSendEmail}
                disabled={sendingEmail || !emailAddress.trim()}
                className="flex-1 h-11 rounded-full text-black font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'rgba(204,255,0,0.85)' }}
              >
                {sendingEmail && <div className="w-4 h-4 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />}
                Отправить
              </motion.button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default ChatPage;
