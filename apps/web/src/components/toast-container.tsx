'use client';

import { useToastStore } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const TOAST_STYLES: Record<string, { icon: typeof CheckCircle; bg: string; border: string; text: string }> = {
  success: {
    icon: CheckCircle,
    bg: 'bg-success-light',
    border: 'border-success/30',
    text: 'text-success-dark',
  },
  error: {
    icon: AlertCircle,
    bg: 'bg-danger-light',
    border: 'border-danger/30',
    text: 'text-danger-dark',
  },
  info: {
    icon: Info,
    bg: 'bg-primary-light',
    border: 'border-primary/30',
    text: 'text-primary-dark',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-warning-light',
    border: 'border-warning/30',
    text: 'text-warning-dark',
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              'toast-enter flex items-center gap-3 rounded-lg border px-4 py-3 shadow-dropdown',
              style.bg,
              style.border,
            )}
            role="alert"
          >
            <Icon className={cn('h-4 w-4 shrink-0', style.text)} />
            <span className={cn('text-sm font-medium', style.text)}>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className={cn(
                'ml-2 rounded p-0.5 transition-colors hover:bg-black/5',
                style.text,
              )}
              aria-label="关闭通知"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
