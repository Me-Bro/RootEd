// A tiny store, not a context: mutation callbacks (see App.jsx) fire outside React.
let toasts = [];
let nextId = 1;
const listeners = new Set();

const emit = () => listeners.forEach((l) => l());

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getToasts = () => toasts;

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** variant: 'success' | 'error'. Errors stay longer so they can be read. */
export function pushToast(message, variant = 'success') {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  emit();
  setTimeout(() => dismissToast(id), variant === 'error' ? 8000 : 4000);
}
