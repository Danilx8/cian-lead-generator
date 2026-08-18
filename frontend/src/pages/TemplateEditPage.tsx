import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { templateService } from '../api';
import Toggle from '../components/ui/Toggle';
import AiPromptTextarea from '../components/ai/AiPromptTextarea';
import { hasAiPrompt, TEMPLATE_MODIFIERS, AI_TEMPLATES_ENABLED } from '../utils/aiPrompt';
import SparklesIcon from '../components/ai/SparklesIcon';
import { useBodyBackground } from '../hooks/useBodyBackground';

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

const ModifiersSection: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <motion.button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-white/40 hover:text-white/60 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" stroke="currentColor" strokeWidth="1.5" /><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span className="text-xs font-medium">Доступные модификаторы</span>
        <motion.svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 mt-3">
              {TEMPLATE_MODIFIERS.map(m => (
                <div key={m.code} className="glass glass-border-light rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                  <code className="text-[11px] font-mono text-white/70">{m.code}</code>
                  <span className="text-[10px] text-white/30">{m.desc}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AI_EXAMPLE_PROMPT = 'Guten Tag! [[ Коротко расспроси продавца по имени {{seller_name}} про товар {{product_name}} ]]';

const AiSection: React.FC<{ onInsertExample: () => void; exampleInserted: boolean }> = ({
  onInsertExample,
  exampleInserted,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <motion.button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-second-accent/80 hover:text-second-accent transition-colors"
      >
        <SparklesIcon size={14} />
        <span className="text-xs font-medium">Генерация текста с ИИ</span>
        <motion.svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="glass glass-border-light rounded-[20px] p-4 mt-3 space-y-3">
              <p className="text-white/70 text-[13px] leading-relaxed">
                Напишите <span className="ai-prompt-mark font-mono text-[12px] rounded-md px-1.5 py-[1px]">[[ промпт ]]</span> прямо
                в тексте — при отправке сообщения ИИ сгенерирует текст на этом месте.
              </p>
              <ul className="text-white/40 text-[12px] leading-relaxed space-y-1 list-disc list-inside">
                <li>наберите <code className="font-mono text-white/60">[[</code> — скобки закроются сами;</li>
                <li>вставок может быть несколько, каждая генерируется отдельно;</li>
                <li>переменные <code className="font-mono text-white/60">{'{{…}}'}</code> внутри промпта подставятся до генерации;</li>
                <li>работает в шаблонах с параметром «Автоматический».</li>
              </ul>
              <motion.button
                type="button"
                onClick={onInsertExample}
                disabled={exampleInserted}
                whileTap={!exampleInserted ? { scale: 0.96 } : undefined}
                transition={SPRING_TAP}
                className="w-full py-2.5 rounded-[16px] text-[13px] font-semibold glass-border-light flex items-center justify-center gap-1.5"
                style={
                  exampleInserted
                    ? { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' }
                    : { background: 'rgba(12,198,255,0.10)', color: '#0CC6FF' }
                }
              >
                <SparklesIcon size={13} />
                {exampleInserted ? 'Пример уже в шаблоне' : 'Вставить пример'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TemplateEditPage: React.FC = () => {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const { addTemplate, updateTemplate, templates, notify } = useAppStore();
  const [name, setName] = useState('');
  const [texts, setTexts] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [isGreeting, setIsGreeting] = useState<boolean>(false);
  const [isSentWithQr, setIsSentWithQr] = useState<boolean>(false);
  const [isAutomatic, setIsAutomatic] = useState<boolean>(false);
  const [isSentImmediately, setIsSentImmediately] = useState<boolean>(false);
  const [isSentForEmail, setIsSentForEmail] = useState<boolean>(false);
  const [isSentForPayPal, setIsSentForPayPal] = useState<boolean>(false);
  const [templateLoading] = useState(false);

  useBodyBackground('bg-gradient-noise');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // В какую карточку вставлять пример ИИ-промпта из секции-подсказки.
  const lastFocusedIndexRef = useRef(0);

  const hasAiPrompts = useMemo(() => texts.some(hasAiPrompt), [texts]);
  const exampleInserted = useMemo(() => texts.some((t) => t.includes(AI_EXAMPLE_PROMPT)), [texts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      // Вертикальный скролл сперва отдаём textarea под курсором: пока внутри
      // есть куда листать в сторону жеста — не перехватываем, иначе длинный
      // шаблон невозможно прокрутить (колесо всегда уходило в карусель).
      const ta = (e.target as HTMLElement | null)?.closest('textarea');
      if (ta && ta.scrollHeight > ta.clientHeight) {
        const atTop = ta.scrollTop <= 0;
        const atBottom = ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 1;
        if (!(e.deltaY < 0 ? atTop : atBottom)) return;
      }
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (isNew || !id) return;

    const templateIndex = parseInt(id, 10);
    if (isNaN(templateIndex)) {
      navigate('/templates');
      return;
    }

    if (templates.length === 0) return;

    if (templateIndex < 0 || templateIndex >= templates.length) {
      navigate('/templates');
      return;
    }

    const localTemplate = templates[templateIndex];
    if (!localTemplate) {
      navigate('/templates');
      return;
    }

    setName(localTemplate.title || '');
    setTexts(Array.isArray(localTemplate.texts) && localTemplate.texts.length > 0
      ? localTemplate.texts
      : ['']);
    setIsGreeting(!!localTemplate.isGreeting);
    setIsSentWithQr(!!localTemplate.isSentWithQr);
    setIsAutomatic(!!localTemplate.isAutomatic);
    setIsSentImmediately(!!localTemplate.isSentImmediately);
    setIsSentForEmail(!!localTemplate.isSentForEmail);
    setIsSentForPayPal(!!localTemplate.isSentForPayPal);
  }, [id, isNew, navigate, templates]);


  const title = useMemo(() => (isNew ? 'Новый шаблон' : 'Изменить шаблон'), [isNew]);

  const handleSave = async () => {
    const nonEmptyTexts = texts.map(t => t.trim()).filter(t => t.length > 0);

    if (nonEmptyTexts.length === 0) {
      notify('Добавьте хотя бы один непустой шаблон', 'error');
      return;
    }

    setLoading(true);
    try {
      if (isNew) {
        const data = {
          title: name || 'Без названия',
          texts: nonEmptyTexts,
          isGreeting: isGreeting,
          isSentWithQr: isSentWithQr,
          isAutomatic: isAutomatic,
          isSentImmediately: isSentImmediately,
          isSentForEmail: isSentForEmail,
          isSentForPayPal: isSentForPayPal,
        };
        const created = await templateService.createTemplate(data);
        addTemplate(created);
      } else if (id) {
        const templateIndex = parseInt(id, 10);
        if (isNaN(templateIndex)) return;
        const updateData = {
          title: name || 'Без названия',
          texts: nonEmptyTexts,
          isGreeting: isGreeting,
          isSentWithQr: isSentWithQr,
          isAutomatic: isAutomatic,
          isSentImmediately: isSentImmediately,
          isSentForEmail: isSentForEmail,
          isSentForPayPal: isSentForPayPal,
        };
        const updated = await templateService.updateTemplate(templateIndex, updateData);
        updateTemplate(templateIndex, updated);
      }
      navigate('/templates');
    } catch {

    } finally {
      setLoading(false);
    }
  };

  const scrollTemplatesRowToEnd = () => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: 'smooth',
        });
      }
    });
  };

  const handleAddField = () => {
    setTexts((prev) => [...prev, '']);
    scrollTemplatesRowToEnd();
  };

  const handleRemoveField = (index: number) => {
    setTexts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeText = (index: number, value: string) => {
    setTexts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleInsertAiExample = () => {
    const index = Math.min(lastFocusedIndexRef.current, texts.length - 1);
    setTexts((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const gap = t && !/\s$/.test(t) ? ' ' : '';
        return `${t}${gap}${AI_EXAMPLE_PROMPT}`;
      })
    );
  };

  const handlePasteTemplateText = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted.includes('||')) return;

    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const current = texts[index] ?? '';
    const left = current.slice(0, start);
    const right = current.slice(end);

    const parts = pasted.split('||').map((p) => p.trim());
    if (parts.length < 2) return;

    const merged: string[] = [];
    merged.push(left + parts[0]);
    for (let j = 1; j < parts.length - 1; j += 1) {
      merged.push(parts[j]);
    }
    merged.push(parts[parts.length - 1] + right);

    setTexts((prev) => {
      const next = [...prev];
      next.splice(index, 1, ...merged);
      return next;
    });
    scrollTemplatesRowToEnd();
  };

  return (
    <div className="min-h-screen pt-safe">
      <div className="flex items-center gap-3 px-4 pt-4 mb-5">
        <div className="w-9 h-9 shrink-0">
          <motion.button
            type="button"
            onClick={() => navigate('/templates')}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_TAP}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light"
            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
            aria-label="Назад"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.button>
        </div>
        <h1 className="text-white text-[28px] font-bold">{title}</h1>
      </div>
      <div className="px-4 pt-4 pb-44 space-y-6">
        {templateLoading ? (
          <div className="text-center text-white/70 mt-8">Загрузка шаблона...</div>
        ) : (
          <>
            <div>
              <label className="block text-white text-lg font-semibold mb-2">Название</label>
              <input
                className="w-full rounded-[16px] px-4 py-3 text-white placeholder:text-white/30 outline-none glass-border-light"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                placeholder="Например: Приветствие"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {/* Template texts carousel — negative margin to bleed to edges */}
            <div>
              <label className="block text-white text-lg font-semibold mb-2">Тексты шаблонов</label>
              <div className="-mx-4">
                <div
                  ref={scrollRef}
                  className="flex gap-3 overflow-x-auto no-scrollbar pb-2 scroll-smooth horizontal-scroll px-4"
                  style={{ overscrollBehaviorX: 'contain' }}
                >
                  {texts.map((t, i) => (
                    <div
                      key={i}
                      className={`relative flex-shrink-0 glass glass-border-light rounded-[24px] p-3 ${texts.length === 1 ? 'w-[calc(100vw-92px)]' : 'w-[280px]'}`}
                    >
                      {texts.length > 1 && (
                        <motion.button
                          type="button"
                          onClick={() => handleRemoveField(i)}
                          whileTap={{ scale: 0.85 }}
                          transition={SPRING_TAP}
                          className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full flex items-center justify-center glass-border-light"
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                          aria-label="Удалить шаблон"
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" /></svg>
                        </motion.button>
                      )}
                      <AiPromptTextarea
                        className="h-[130px] pr-8 pb-7"
                        placeholder={`Шаблон ${i + 1}`}
                        value={t}
                        onChange={(v) => handleChangeText(i, v)}
                        onPaste={(e) => handlePasteTemplateText(i, e)}
                        onFocus={() => { lastFocusedIndexRef.current = i; }}
                      />
                      <AnimatePresence>
                        {AI_TEMPLATES_ENABLED && hasAiPrompt(t) && (
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={SPRING_TAP}
                            className="absolute bottom-2.5 right-2.5 z-10 h-7 px-2.5 rounded-full flex items-center gap-1 glass-border-light"
                            style={{ background: 'rgba(0,119,182,0.12)', color: '#0077B6' }}
                            aria-label="Текст будет сгенерирован ИИ при отправке"
                          >
                            <SparklesIcon size={12} />
                            <span className="text-[11px] font-semibold">ИИ</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                  <motion.button
                    type="button"
                    onClick={handleAddField}
                    whileTap={{ scale: 0.95 }}
                    transition={SPRING_TAP}
                    className="flex-shrink-0 w-[48px] h-[160px] glass glass-border-light rounded-[24px] flex items-center justify-center text-white/40 hover:text-white/70"
                    aria-label="Добавить шаблон"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </motion.button>
                </div>
              </div>
              <p className="text-white/30 text-xs mt-2">
                Разделитель <code className="px-1 rounded bg-white/[0.08] font-mono text-white/50">||</code> при вставке создаёт несколько карточек.
                {AI_TEMPLATES_ENABLED && (
                  <> Вставка <code className="px-1 rounded bg-white/[0.08] font-mono text-second-accent/70">[[ промпт ]]</code> — текст от ИИ при отправке.</>
                )}
              </p>
              <AnimatePresence>
                {AI_TEMPLATES_ENABLED && hasAiPrompts && !isAutomatic && (
                  <motion.p
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="text-amber-300/80 text-xs mt-2 overflow-hidden"
                  >
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* AI generation — collapsible hint */}
            {AI_TEMPLATES_ENABLED && (
              <AiSection onInsertExample={handleInsertAiExample} exampleInserted={exampleInserted} />
            )}

            {/* Modifiers — collapsible */}
            <ModifiersSection />

            {/* Toggles — glass card with Toggle component */}
            <div>
              <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider ml-1 mb-2">Параметры</h3>
              <div className="glass glass-border-light rounded-[24px] divide-y divide-white/[0.06] overflow-hidden">
                {([
                  // «Подряд» работает только вместе с «Автоматический», поэтому тогглятся связкой.
                  { label: 'Автоматический', hint: 'Отправляется автоматически на ответы', value: isAutomatic, setter: (v: boolean) => { setIsAutomatic(v); if (v) setIsGreeting(false); else setIsSentImmediately(false); } },
                  { label: 'С QR-кодом', hint: 'QR-код сразу после сообщения', value: isSentWithQr, setter: setIsSentWithQr },
                  { label: 'Приветственный', hint: 'Первое сообщение при отписке на объявление', value: isGreeting, setter: (v: boolean) => { setIsGreeting(v); if (v) { setIsAutomatic(false); setIsSentImmediately(false); } } },
                  { label: 'Подряд', hint: 'Сразу после предыдущего сообщения. Включает «Автоматический»', value: isSentImmediately, setter: (v: boolean) => { setIsSentImmediately(v); if (v) { setIsAutomatic(true); setIsGreeting(false); } } },
                  { label: 'После почты', hint: 'Отправляется после получения email', value: isSentForEmail, setter: setIsSentForEmail },
                  { label: 'После PayPal', hint: 'При упоминании PayPal или paypal.me', value: isSentForPayPal, setter: setIsSentForPayPal },
                ] as const).map((opt) => (
                  <div key={opt.label} className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex-1 min-w-0 mr-3">
                      <span className="text-white text-[15px] font-medium block">{opt.label}</span>
                      <span className="text-white/35 text-[12px] block mt-0.5">{opt.hint}</span>
                    </div>
                    <Toggle checked={opt.value} onChange={opt.setter} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
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
              onClick={handleSave}
              disabled={loading}
              whileTap={!loading ? { scale: 0.96 } : undefined}
              transition={SPRING_TAP}
              className="w-full py-3.5 rounded-[24px] text-[15px] font-semibold glass-border-light"
              style={!loading
                ? { background: 'rgba(204,255,0,0.10)', color: '#CCFF00', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)' }
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.20)' }
              }
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </motion.button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {aiPreviewText !== null && (
          <AiPreviewSheet text={aiPreviewText} onClose={() => setAiPreviewText(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TemplateEditPage;