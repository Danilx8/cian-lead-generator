import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../api/authService';
import { ApiError } from '../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await authService.login(email.trim(), password);
      // Полная перезагрузка — хук авторизации заново валидирует сессию.
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Аккаунт ожидает одобрения администратора');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Неверный email или пароль');
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось войти');
      }
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex items-center justify-center min-h-[var(--app-height,100vh)] p-4 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #FDFEFF 0%, #F5FAFD 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="ambient-orb ambient-orb--accent" />
        <div className="ambient-orb ambient-orb--blue" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="relative z-[1] w-full max-w-sm rounded-ios-3xl p-6 sm:p-8"
        style={{
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(11,36,48,0.10)',
          boxShadow: '0 12px 40px rgba(11,36,48,0.08)',
        }}
      >
        <h1 className="text-2xl font-bold text-center mb-1" style={{ color: '#0B2430' }}>
          Cian Sender
        </h1>
        <p className="text-sm text-center mb-6" style={{ color: '#5E7C8B' }}>
          Вход в аккаунт
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-ios-xl bg-white/10 border border-white/10 text-white placeholder:text-gray-500 outline-none focus:border-accent transition-colors"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-ios-xl bg-white/10 border border-white/10 text-white placeholder:text-gray-500 outline-none focus:border-accent transition-colors"
          />

          {error && (
            <p className="text-sm text-red-600 text-center text-balance leading-snug">{error}</p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.96 }}
            className="w-full mt-1 py-3 rounded-ios-xl bg-accent text-black font-semibold disabled:opacity-60"
          >
            {loading ? 'Входим…' : 'Войти'}
          </motion.button>
        </form>

        <p className="text-sm text-center mt-5" style={{ color: '#5E7C8B' }}>
          Нет аккаунта?{' '}
          <Link to="/register" className="text-accent font-semibold">
            Зарегистрироваться
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
