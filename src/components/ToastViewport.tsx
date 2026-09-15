import { CircleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useAppStore } from '../store/use-app-store'

export function ToastViewport() {
  const toasts = useAppStore((state) => state.toasts)
  const dismissToast = useAppStore((state) => state.dismissToast)
  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.slice(-3).map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: { id: string; title: string; message: string }; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 5_200)
    return () => window.clearTimeout(timer)
  }, [onDismiss, toast.id])

  return (
    <div className="toast-card" role="status">
      <CircleAlert size={17} />
      <div><strong>{toast.title}</strong><p>{toast.message}</p></div>
      <button type="button" onClick={() => onDismiss(toast.id)} aria-label="关闭通知"><X size={14} /></button>
    </div>
  )
}
