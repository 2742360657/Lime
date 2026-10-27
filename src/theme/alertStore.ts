import type { AlertButton, AlertOptions } from 'react-native';

type Request = { id: number; title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let queue: Request[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const alertStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => queue[0] ?? null,
  show(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue = [...queue, { id: ++sequence, title, message, buttons: buttons?.length ? buttons.slice(0, 3) : [{ text: '确定' }], options }];
    notify();
  },
  choose(id: number, buttonIndex: number) {
    const request = queue[0];
    if (!request || request.id !== id || !request.buttons[buttonIndex]) return;
    queue = queue.slice(1); notify();
    request.buttons[buttonIndex].onPress?.();
  },
  dismiss(id: number) {
    const request = queue[0];
    if (!request || request.id !== id || !request.options?.cancelable) return;
    queue = queue.slice(1); notify(); request.options.onDismiss?.();
  },
};

export const Alert = { alert: alertStore.show };
