(() => {
  const ACTIVE_TOASTS = new Set();

  function buildToast(message, options = {}) {
    const toast = document.createElement('div');
    toast.className = 'rpwsh-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    if (options.theme) {
      toast.dataset.theme = options.theme;
    }
    toast.textContent = message;
    if (options.action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = options.action.label;
      btn.addEventListener('click', () => {
        options.action.handler?.();
        dismissToast(toast);
      });
      toast.appendChild(btn);
    }
    return toast;
  }

  function dismissToast(toast) {
    if (!toast) return;
    ACTIVE_TOASTS.delete(toast);
    toast.remove();
  }

  function showToast(message, options = {}) {
    const toast = buildToast(message, options);
    ACTIVE_TOASTS.add(toast);
    document.body.appendChild(toast);
    const lifetime = options.duration ?? 5000;
    if (lifetime > 0) {
      setTimeout(() => dismissToast(toast), lifetime);
    }
    return () => dismissToast(toast);
  }

  window.RoboToast = {
    show: showToast,
    dismiss: dismissToast
  };
})();
