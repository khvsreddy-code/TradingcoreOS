import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, User, Key, Settings, CreditCard, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface UserMenuProps {
  onNavigate?: (view: string) => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] px-2.5 py-1.5 text-xs font-medium text-[var(--tco-text)] transition-all hover:border-[#33384f] hover:bg-[var(--tco-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#1e2230] border border-[var(--tco-border)]">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="font-mono text-[10px] font-bold text-[#3b82f6]">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <span className="hidden sm:inline-block max-w-[120px] truncate font-medium text-[var(--tco-text)]">
          {user.name}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--tco-muted)] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--tco-text)]' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-3)] shadow-2xl"
          >
            {/* User Header Info */}
            <div className="border-b border-[var(--tco-border)] p-3.5 bg-[var(--tco-surface-2)]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[var(--tco-text)] truncate block">{user.name}</span>
                <span className="rounded bg-[#3b82f6]/10 border border-[#3b82f6]/30 px-1.5 py-0.2 font-mono text-[9px] text-[#3b82f6] font-semibold">
                  {user.plan}
                </span>
              </div>
              <span className="text-[11px] text-[var(--tco-muted)] truncate block font-mono mt-0.5">{user.email}</span>
            </div>

            {/* Menu Options */}
            <div className="p-1 space-y-0.5 text-xs font-medium">
              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onNavigate) onNavigate('profile');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-hover)] hover:text-[var(--tco-text)] cursor-pointer"
              >
                <User className="h-4 w-4 text-[var(--tco-muted)]" />
                <span>Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onNavigate) onNavigate('broker-connection');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-hover)] hover:text-[var(--tco-text)] cursor-pointer"
              >
                <Key className="h-4 w-4 text-[var(--tco-muted)]" />
                <span>Connected Brokers</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onNavigate) onNavigate('billing');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-hover)] hover:text-[var(--tco-text)] cursor-pointer"
              >
                <CreditCard className="h-4 w-4 text-[var(--tco-muted)]" />
                <span>Billing</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onNavigate) onNavigate('settings');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-hover)] hover:text-[var(--tco-text)] cursor-pointer"
              >
                <Settings className="h-4 w-4 text-[var(--tco-muted)]" />
                <span>Settings</span>
              </button>

              <div className="my-1 border-t border-[var(--tco-border)]" />

              <button
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[#ef4444] transition-colors hover:bg-[#ef4444]/10 cursor-pointer font-semibold"
              >
                <LogOut className="h-4 w-4 text-[#ef4444]" />
                <span>Logout</span>
              </button>
            </div>

            <div className="border-t border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2 text-center font-mono text-[10px] text-[var(--tco-muted)]">
              <ShieldCheck className="h-3 w-3 inline-block mr-1 text-[#3b82f6]" />
              OAuth Session Secured
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
