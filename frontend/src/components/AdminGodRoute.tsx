import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { userService } from '../api';
import Skeleton from './Skeleton';

const hasAdminKey = Boolean((import.meta.env.VITE_ADMIN_KEY ?? '').toString().trim());

const AdminGodRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    if (user) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const u = await userService.getMe();
        if (mounted) setUser(u);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user, setUser]);

  if (loading) {
    return (
      <div className="min-h-screen pt-safe p-4 bg-[#F5FAFD]">
        <div className="flex flex-col gap-3 mt-4">
          <Skeleton variant="rectangular" className="w-full h-12 rounded-xl" />
          <Skeleton variant="rectangular" className="w-full h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin' || hasAdminKey;
  if (!isAdmin) {
    return <Navigate to="/profile" replace />;
  }

  // display: contents — обёртка не создаёт бокс и не трогает вёрстку страниц,
  // но .admin-selectable из index.css включает выделение текста для всей админки.
  return (
    <div className="admin-selectable" style={{ display: 'contents' }}>
      {children}
    </div>
  );
};

export default AdminGodRoute;
