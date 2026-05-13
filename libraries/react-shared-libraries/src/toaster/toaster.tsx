'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EventEmitter from 'events';
import { Toast, ToastVariant } from './toast';

const toaster = new EventEmitter();

export { Toast, type ToastProps, type ToastVariant } from './toast';

export const Toaster = () => {
  const [showToaster, setShowToaster] = useState(false);
  const [toasterText, setToasterText] = useState('');
  const [toasterType, setToasterType] = useState<ToastVariant>('success');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onShow = (params: { text: string; type?: ToastVariant }) => {
      const { text, type } = params;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setToasterText(text);
      setToasterType(type === 'warning' ? 'warning' : 'success');
      setShowToaster(true);
      hideTimerRef.current = setTimeout(() => {
        setShowToaster(false);
        hideTimerRef.current = null;
      }, 4200);
    };
    toaster.on('show', onShow);
    return () => {
      toaster.removeListener('show', onShow);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  if (!showToaster) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[900] flex items-center justify-center p-4"
      role="presentation"
      aria-live="polite"
    >
      <Toast
        message={toasterText}
        variant={toasterType}
        className="pointer-events-auto max-w-[min(100vw-2rem,32rem)] animate-fadeDown shadow-2xl"
      />
    </div>
  );
};

export const useToaster = () => {
  return {
    show: useCallback((text: string, type?: ToastVariant) => {
      toaster.emit('show', {
        text,
        type,
      });
    }, []),
  };
};
