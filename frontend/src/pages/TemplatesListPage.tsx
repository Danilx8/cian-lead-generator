import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { templateService } from '../api';
import type { Template } from '../api/types';
import Skeleton from '../components/Skeleton';
import { useBodyBackground } from '../hooks/useBodyBackground';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

const IconPencil: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.7 6.3l5 5L8 21H3v-5l9.7-9.7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 4l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconTrash: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 7l1-2h4l1 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ConfirmModal: React.FC<{ title: string; text: string; onCancel: () => void; onConfirm: () => void; }> = ({ title, text, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-[200]">
    <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
    <div className="absolute left-0 right-0 bottom-0 p-4 pt-safe" style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 16px)' }}>
      <div
        className="glass-border-light rounded-[24px] p-4"
        style={{
          background: 'rgba(255,255,255,0.10)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
        }}
      >
        <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
        <p className="text-white/80 mb-4">{text}</p>
        <div className="flex gap-3">
          <motion.button
            onClick={onCancel}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            className="flex-1 py-3 rounded-[20px] glass glass-border-light text-white"
          >
            Отмена
          </motion.button>
          <motion.button
            onClick={onConfirm}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            className="flex-1 py-3 rounded-[20px] bg-red-600/80 text-white"
          >
            Удалить
          </motion.button>
        </div>
      </div>
    </div>
  </div>
);

const TemplatesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { templates, setTemplates, removeTemplate, notify } = useAppStore();
  const [toDelete, setToDelete] = useState<{ index: number, template: Template } | null>(null);
  const [loading, setLoading] = useState(() => templates.length === 0);

  useBodyBackground('bg-gradient-noise');

  const handleReorderTemplates = useCallback(async (fromIndex: number, toIndex: number) => {
    console.log(`Reordering template from ${fromIndex} to ${toIndex}`);
    console.log('Current templates before reorder:', templates);

    const reorderedTemplates = [...templates];
    const [moved] = reorderedTemplates.splice(fromIndex, 1);
    reorderedTemplates.splice(toIndex, 0, moved);

    console.log('Templates after reorder:', reorderedTemplates);

    setTemplates(reorderedTemplates);

    try {
      const response = await templateService.reorderTemplates({
        fromIndex: fromIndex,
        toIndex: toIndex
      });
      console.log('Templates reordered successfully:', response);
    } catch (error) {
      console.error('Failed to reorder templates:', error);
      console.log('Rolling back to original templates:', templates);
      setTemplates(templates);
    }
  }, [templates, setTemplates]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    index: number;
    startY: number;
    currentY: number;
    rects: { top: number; height: number }[];
    draggedHeight: number;
  } | null>(null);

  const [disableAnimations, setDisableAnimations] = useState(false);

  const rafIdRef = useRef<number | null>(null);
  const currYRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      const hasCached = templates.length > 0;
      if (!hasCached) setLoading(true);
      try {
        const response = await templateService.getUserTemplates();
        if (cancelled) return;
        setTemplates(response.templates || []);
      } catch {
        if (!cancelled && templates.length === 0) {
          notify('Ошибка загрузки шаблонов. Попробуйте обновить страницу.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTemplates();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTemplates, notify]);

  const computeHoverIndex = useCallback((d: NonNullable<typeof drag>, currentY: number) => {
    const dy = currentY - d.startY;
    const center = d.rects[d.index].top + dy + d.draggedHeight / 2;
    let target = d.index;
    for (let i = 0; i < d.rects.length; i++) {
      const r = d.rects[i];
      const mid = r.top + r.height / 2;
      if (center <= mid) { target = i; break; }
      target = i;
    }
    return target;
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      currYRef.current = e.clientY;
      if (rafIdRef.current == null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          setDrag(prev => (prev ? { ...prev, currentY: currYRef.current } : prev));
        });
      }
    };

    const onUp = () => {
      console.log('Drag ended');
      document.body.style.userSelect = '';

      setDisableAnimations(true);

      const d = drag;
      if (d) {
        const to = computeHoverIndex(d, d.currentY);
        const from = d.index;
        console.log(`Drag result: from=${from}, to=${to}`);
        if (from !== to) {
          console.log('Indices are different, calling handleReorderTemplates');
          handleReorderTemplates(from, to);
        } else {
          console.log('Indices are the same, no reordering needed');
        }
      } else {
        console.log('No drag state found');
      }

      setTimeout(() => {
        setDrag(null);
        setTimeout(() => {
          setDisableAnimations(false);
        }, 100);
      }, 50);

      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      if (rafIdRef.current != null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    };

    window.addEventListener('pointermove', onMove, { passive: false, capture: true });
    window.addEventListener('pointerup', onUp, { passive: false, capture: true });
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      if (rafIdRef.current != null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    };
  }, [drag, computeHoverIndex, templates, setTemplates, handleReorderTemplates, setDisableAnimations]);

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    console.log(`Starting drag for template at index ${idx}`);

    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest('button')) return;

    const container = listRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('[data-tpl-item]')) as HTMLElement[];
    if (!nodes.length) return;

    const rects = nodes.map(n => ({ top: n.offsetTop, height: n.offsetHeight }));
    const draggedHeight = rects[idx]?.height || 0;

    document.body.style.userSelect = 'none';
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    setDrag({ index: idx, startY: e.clientY, currentY: e.clientY, rects, draggedHeight });
  };

  const getItemTranslateY = (i: number, hoverIdx: number | null) => {
    if (!drag) return 0;
    const from = drag.index;
    const to = hoverIdx ?? from;
    const dy = drag.currentY - drag.startY;
    if (i === from) return dy;
    if (from < to && i > from && i <= to) return -drag.draggedHeight;
    if (to < from && i >= to && i < from) return drag.draggedHeight;
    return 0;
  };

  const handleEdit = (index: number) => navigate(`/templates/${index}`);
  const handleDelete = (index: number, template: Template) => {
    setToDelete({ index, template });
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    try {
      await templateService.deleteTemplate(toDelete.index);
      removeTemplate(toDelete.index);
      notify('Шаблон успешно удален', 'success');
      setToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
      notify('Ошибка удаления шаблона. Попробуйте еще раз.', 'error');
    }
  };

  const hasTemplates = !loading && templates.length > 0;

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-40 progressive-blur px-4 pb-3"
        style={{ paddingTop: 'max(var(--safe-area-inset-top, 0px), 12px)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0">
            <motion.button
              type="button"
              onClick={() => navigate('/')}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_TAP}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
              style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
              aria-label="Назад"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </motion.button>
          </div>
          <h1 className="text-white text-[22px] font-bold">Шаблоны</h1>
        </div>
      </div>
      <div className="px-4 pb-44 pt-4">

        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass glass-border-light rounded-[24px] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Skeleton width="50%" height={18} className="mb-2 rounded-md" />
                      <Skeleton width="75%" height={13} className="rounded-md" />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Skeleton width={36} height={36} className="rounded-xl" />
                      <Skeleton width={36} height={36} className="rounded-xl" />
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2.5">
                    <Skeleton width={80} height={20} className="rounded-md" />
                    <Skeleton width={50} height={20} className="rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3" ref={listRef}>
              {templates.filter(tpl => tpl && typeof tpl === 'object').map((tpl, idx) => {
                const hoverIdx = drag ? computeHoverIndex(drag, drag.currentY) : null;
                const translateY = getItemTranslateY(idx, hoverIdx);
                const dragging = !!drag && drag.index === idx;
                return (
                  <div
                    key={idx}
                    data-tpl-item
                    className={`glass glass-border-light rounded-[24px] p-4 select-none ${dragging ? 'z-50 shadow-2xl opacity-90' : ''} ${!dragging && !disableAnimations ? 'transition-transform duration-200 ease-out' : ''}`}
                    style={{
                      transform: `translate3d(0, ${translateY}px, 0)`,
                      touchAction: 'none',
                      willChange: 'transform',
                      transition: dragging || disableAnimations ? 'none' : 'transform 0.2s ease-out'
                    }}
                    onPointerDown={startDrag(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white text-[16px] font-semibold truncate">{tpl.title || 'Без названия'}</h3>
                        <p className="text-white/40 text-[13px] mt-0.5 truncate">
                          {tpl.texts && tpl.texts.length > 0
                            ? tpl.texts[0].replace(/\n/g, ' ').slice(0, 60) + (tpl.texts[0].length > 60 ? '…' : '')
                            : 'Пустой шаблон'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleEdit(idx)}
                          className="w-9 h-9 rounded-xl glass-border-light flex items-center justify-center active:scale-95 transition-all"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                          aria-label="Изменить"
                        >
                          <IconPencil className="text-white/60 w-[18px] h-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(idx, tpl)}
                          className="w-9 h-9 rounded-xl border border-red-500/20 flex items-center justify-center active:scale-95 transition-all"
                          style={{ background: 'rgba(239,68,68,0.10)' }}
                          aria-label="Удалить"
                        >
                          <IconTrash className="text-red-400/70 w-[18px] h-[18px]" />
                        </button>
                      </div>
                    </div>
                    {(tpl.isAutomatic || tpl.isSentWithQr || tpl.isGreeting || tpl.isSentImmediately || tpl.isSentForEmail || tpl.isSentForPayPal) && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {tpl.isAutomatic && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">Авто</span>}
                        {tpl.isSentWithQr && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">QR</span>}
                        {tpl.isGreeting && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">Приветствие</span>}
                        {tpl.isSentImmediately && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">Подряд</span>}
                        {tpl.isSentForEmail && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">Email</span>}
                        {tpl.isSentForPayPal && <span className="text-[10px] text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded-md">PayPal</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!loading && templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 glass glass-border-light rounded-[24px] flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              </div>
              <p className="text-white/45 text-[15px] font-medium mb-1">Нет шаблонов</p>
              <p className="text-white/25 text-sm mb-4">Создайте первый шаблон для рассылки</p>
              <motion.button
                onClick={() => navigate('/templates/new')}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="h-9 px-5 rounded-[24px] glass-border-light inline-flex items-center text-sm font-semibold"
                style={{
                  background: 'rgba(204, 255, 0, 0.10)',
                  backdropFilter: 'blur(24px) saturate(1.3)',
                  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                  color: '#CCFF00',
                }}
              >
                + Добавить
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom button — only when templates exist */}
      {hasTemplates && (
        <div className="fixed left-0 right-0 bottom-0 z-40 pointer-events-none">
          <div
            style={{
              background: 'linear-gradient(to top, rgba(9,9,9,1) 0%, rgba(9,9,9,0.85) 40%, rgba(9,9,9,0.4) 75%, transparent 100%)',
              paddingTop: '48px',
              paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 16px)',
            }}
            className="px-4"
          >
            <div className="pointer-events-auto">
              <motion.button
                onClick={() => navigate('/templates/new')}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="w-full h-[52px] rounded-[24px] text-[#CCFF00] text-[15px] font-semibold glass-border-light"
                style={{
                  background: 'rgba(204, 255, 0, 0.10)',
                  backdropFilter: 'blur(24px) saturate(1.3)',
                  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                }}
              >
                + Добавить шаблон
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          title="Удалить шаблон?"
          text={`Вы действительно хотите удалить «${toDelete.template.title}»? Это действие необратимо.`}
          onCancel={() => setToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};

export default TemplatesListPage;
