(() => {
  const browserAPI = window.browser ?? window.chrome;
  if (!browserAPI?.storage) {
    return;
  }

  const DEFAULT_SETTINGS = {
    selectors: '',
    preferredHighlighter: 'auto',
    fontSize: 14,
    tabSize: 4,
    wordWrap: false,
    theme: 'auto'
  };

  const SETTINGS_KEY = 'robopackRocketSettings';
  const SIZE_PREFIX = 'robopackRocketSize:';
  let toastPromise = null;
  const processedTextareas = new WeakSet();
  let domObserver = null;

  const ready = document.readyState === 'complete' || document.readyState === 'interactive'
    ? Promise.resolve()
    : new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));

  ready.then(async () => {
    const settings = await loadSettings();
    ensureToastInjected();
    attemptEnhancements(settings);
    observeTextareaAppearance(settings);
  });

  browserAPI.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'robopack-rocket-test-selectors') {
      const settings = message.settings;
      const matches = collectCandidateTextareas(settings);
      matches.forEach((ta) => {
        ta.classList.add('rpwsh-testing-outline');
        ta.style.outline = '2px dashed #38bdf8';
        setTimeout(() => {
          ta.style.outline = '';
          ta.classList.remove('rpwsh-testing-outline');
        }, 1500);
      });
      return Promise.resolve({ count: matches.length });
    }
    return undefined;
  });

  async function loadSettings() {
    const stored = await browserAPI.storage.local.get(SETTINGS_KEY);
    return Object.assign({}, DEFAULT_SETTINGS, stored?.[SETTINGS_KEY] ?? {});
  }

  function parseSelectors(selectorString) {
    return selectorString
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isEligibleTextarea(node) {
    if (!(node instanceof HTMLTextAreaElement)) {
      return false;
    }
    if (processedTextareas.has(node)) {
      return false;
    }
    if (node.dataset.rpwshProcessed === 'true') {
      return false;
    }
    if (node.closest('.rpwsh-command-host')) {
      return false;
    }
    return true;
  }

  function markTextareaProcessed(textarea) {
    processedTextareas.add(textarea);
    try {
      textarea.dataset.rpwshProcessed = 'true';
    } catch (err) {
      // ignore inability to set dataset (e.g. in cross-origin iframes)
    }
  }

  function collectCandidateTextareas(settings) {
    const selectors = parseSelectors(settings.selectors);
    const candidates = new Set();
    selectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((node) => {
          if (isEligibleTextarea(node)) {
            candidates.add(node);
            return;
          }
          node.querySelectorAll?.('textarea').forEach((textarea) => {
            if (isEligibleTextarea(textarea)) {
              candidates.add(textarea);
            }
          });
        });
      } catch (err) {
        console.warn('[Robopack Rocket] Invalid selector', sel, err);
      }
    });

    if (!selectors.length) {
      const heuristicSelectors = [
        'textarea[spellcheck="false"]',
        'textarea[id*="script" i]',
        'textarea[name*="script" i]',
        'textarea[class*="code" i]'
      ];
      heuristicSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((node) => {
          if (isEligibleTextarea(node)) {
            candidates.add(node);
          }
        });
      });
    }

    return Array.from(candidates);
  }

  function attemptEnhancements(settings) {
    let enhanced = false;
    let nextTextarea = findTargetTextarea(settings);
    while (nextTextarea) {
      markTextareaProcessed(nextTextarea);
      try {
        enhanceTextarea(nextTextarea, settings);
        enhanced = true;
      } catch (error) {
        processedTextareas.delete(nextTextarea);
        if (nextTextarea.dataset) {
          delete nextTextarea.dataset.rpwshProcessed;
        }
        throw error;
      }
      nextTextarea = findTargetTextarea(settings);
    }
    return enhanced;
  }

  function observeTextareaAppearance(settings) {
    if (domObserver || !document.documentElement) {
      return;
    }
    const root = document.body || document.documentElement;
    if (!root) {
      return;
    }
    const enqueueMicrotask = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
    let scheduled = false;
    const scheduleEnhancement = () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      enqueueMicrotask(() => {
        scheduled = false;
        attemptEnhancements(settings);
      });
    };
    domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLTextAreaElement && isEligibleTextarea(node)) {
            scheduleEnhancement();
            return;
          }
          if (node instanceof Element) {
            const textareas = node.querySelectorAll?.('textarea');
            if (!textareas) {
              continue;
            }
            for (const textarea of textareas) {
              if (isEligibleTextarea(textarea)) {
                scheduleEnhancement();
                return;
              }
            }
          }
        }
      }
    });
    domObserver.observe(root, { childList: true, subtree: true });
  }

  function pickBestTextarea(textareas) {
    let best = null;
    let bestScore = -Infinity;
    textareas.forEach((ta) => {
      const rows = Number(ta.rows || 0) || 10;
      const cols = Number(ta.cols || 0) || 80;
      const rect = ta.getBoundingClientRect();
      const areaScore = Math.max(rect.width * rect.height, rows * cols * 10);
      const lengthScore = (ta.value?.length ?? 0) / 10;
      const score = areaScore + lengthScore;
      if (score > bestScore) {
        bestScore = score;
        best = ta;
      }
    });
    return best;
  }

  function findTargetTextarea(settings) {
    const candidates = collectCandidateTextareas(settings);
    if (!candidates.length) {
      return null;
    }
    return pickBestTextarea(candidates);
  }

  function detectTheme(preference) {
    if (preference && preference !== 'auto') {
      return preference;
    }

    const isDarkViaMedia = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    if (isDarkViaMedia) {
      return 'dark';
    }

    const body = document.body;
    if (body) {
      const style = window.getComputedStyle(body);
      const bg = style.backgroundColor || '#ffffff';
      if (isDarkColor(bg)) {
        return 'dark';
      }
    }
    return 'light';
  }

  function isDarkColor(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) {
      return false;
    }
    ctx.fillStyle = color;
    const rgba = ctx.fillStyle;
    const match = rgba.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return false;
    }
    const [r, g, b] = match[1].split(',').map((v) => parseFloat(v));
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.5;
  }

  function ensureToastInjected() {
    if (window.RoboToast) {
      return Promise.resolve();
    }
    if (toastPromise) {
      return toastPromise;
    }
    toastPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = browserAPI.runtime.getURL('lib/toast.js');
      script.type = 'text/javascript';
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', (error) => reject(error), { once: true });
      document.documentElement.appendChild(script);
    }).catch((error) => {
      console.warn('Failed to load Robopack Rocket toast helper', error);
    });
    return toastPromise;
  }

  function enhanceTextarea(textarea, settings) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rpwsh-wrapper';
    textarea.parentNode?.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);

    const toolbar = document.createElement('div');
    toolbar.className = 'rpwsh-toolbar';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'rpwsh-toggle';
    toggleBtn.textContent = 'Enhance PS Editor';
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.setAttribute('aria-label', 'Toggle Robopack Rocket editor');
    toolbar.appendChild(toggleBtn);

    const commandsBtn = document.createElement('button');
    commandsBtn.type = 'button';
    commandsBtn.className = 'rpwsh-command-toggle';
    commandsBtn.textContent = 'Command Builder';
    commandsBtn.disabled = true;
    commandsBtn.setAttribute('aria-expanded', 'false');
    commandsBtn.setAttribute('aria-label', 'Toggle PSADT command builder');
    toolbar.appendChild(commandsBtn);

    wrapper.insertBefore(toolbar, textarea);

    const workspace = document.createElement('div');
    workspace.className = 'rpwsh-workspace';
    workspace.dataset.panel = 'closed';
    wrapper.insertBefore(workspace, textarea);

    const host = document.createElement('div');
    host.className = 'rpwsh-editor-host rpwsh-hidden';
    const surface = document.createElement('div');
    surface.className = 'rpwsh-editor-surface';
    host.appendChild(surface);

    const resizer = document.createElement('div');
    resizer.className = 'rpwsh-resize-handle';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.tabIndex = 0;
    const grip = document.createElement('div');
    grip.className = 'rpwsh-resize-grip';
    resizer.appendChild(grip);
    host.appendChild(resizer);

    const commandHost = document.createElement('aside');
    commandHost.className = 'rpwsh-command-host rpwsh-hidden';
    const panelId = `rpwsh-command-panel-${Math.random().toString(36).slice(2, 10)}`;
    commandHost.id = panelId;
    commandsBtn.setAttribute('aria-controls', panelId);

    workspace.appendChild(host);
    workspace.appendChild(commandHost);

    const resizeState = {
      active: false,
      startY: 0,
      startHeight: 0
    };

    const sizeKey = buildSizeKey(textarea);

    applyStoredSize(host, sizeKey);

    let pendingSizeSave = null;
    const resizeObserver = new ResizeObserver(() => {
      if (pendingSizeSave) {
        cancelAnimationFrame(pendingSizeSave);
      }
      pendingSizeSave = requestAnimationFrame(() => {
        saveSize(host, sizeKey);
        pendingSizeSave = null;
      });
    });
    resizeObserver.observe(host);

    const onPointerMove = (event) => {
      if (!resizeState.active) return;
      const delta = event.clientY - resizeState.startY;
      const newHeight = Math.max(200, resizeState.startHeight + delta);
      host.style.height = `${newHeight}px`;
    };

    const stopResize = () => {
      if (!resizeState.active) return;
      resizeState.active = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      saveSize(host, sizeKey);
    };

    resizer.addEventListener('pointerdown', (event) => {
      resizeState.active = true;
      resizeState.startY = event.clientY;
      resizeState.startHeight = host.getBoundingClientRect().height;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
      event.preventDefault();
    });

    resizer.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 40 : 10;
      if (event.key === 'ArrowUp') {
        adjustHeight(-step);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        adjustHeight(step);
        event.preventDefault();
      }
    });

    function adjustHeight(delta) {
      const rect = host.getBoundingClientRect();
      const next = Math.max(200, rect.height + delta);
      host.style.height = `${next}px`;
      saveSize(host, sizeKey);
    }

    let commandPanelModulePromise = null;
    let commandPanelInstance = null;
    let commandPanelOpen = false;
    let activeTheme = 'light';

    let editorModulePromise = null;
    let editorInstance = null;
    let editorApi = null;
    let disconnectTextareaListener = null;
    let suppressSync = false;

    async function showCommandPanel() {
      if (commandPanelOpen || commandsBtn.disabled) {
        return;
      }
      commandsBtn.disabled = true;
      try {
        if (!commandPanelModulePromise) {
          commandPanelModulePromise = import(browserAPI.runtime.getURL('content/command-panel.js'));
        }
        const module = await commandPanelModulePromise;
        if (!commandPanelInstance) {
          commandPanelInstance = module.createCommandPanel(commandHost, {
            theme: activeTheme,
            onInsert: (commandText) => insertCommandSnippet(commandText),
            onClose: () => hideCommandPanel()
          });
        }
        commandHost.dataset.theme = activeTheme;
        commandPanelInstance?.setTheme?.(activeTheme);
        commandHost.classList.remove('rpwsh-hidden');
        workspace.dataset.panel = 'open';
        commandsBtn.setAttribute('aria-expanded', 'true');
        commandsBtn.classList.add('rpwsh-command-toggle--active');
        commandPanelOpen = true;
        commandPanelInstance?.focusSearch?.();
      } catch (error) {
        console.error('Failed to load PSADT command builder', error);
        window.RoboToast?.show('Unable to load PSADT command builder. See console for details.', {
          duration: 4000,
          theme: activeTheme
        });
      } finally {
        commandsBtn.disabled = false;
      }
    }

    function hideCommandPanel() {
      if (!commandPanelOpen) {
        return;
      }
      commandHost.classList.add('rpwsh-hidden');
      workspace.dataset.panel = 'closed';
      commandsBtn.setAttribute('aria-expanded', 'false');
      commandsBtn.classList.remove('rpwsh-command-toggle--active');
      commandPanelOpen = false;
    }

    function insertCommandSnippet(commandText) {
      if (typeof commandText !== 'string') {
        return;
      }
      const trimmed = commandText.trim();
      if (!trimmed) {
        return;
      }
      const currentValue = (editorApi?.getValue?.() ?? textarea.value ?? '').toString();
      const needsLeadingNewline = currentValue.length > 0 && !/\r?\n$/.test(currentValue);
      let snippet = commandText.trimEnd();
      if (!/\r?\n$/.test(snippet)) {
        snippet += '\n';
      }
      if (needsLeadingNewline) {
        snippet = `\n${snippet}`;
      }
      if (editorApi?.insertSnippet) {
        editorApi.insertSnippet(snippet);
      } else {
        insertIntoTextarea(textarea, snippet);
      }
      editorApi?.focus?.();
    }

    function insertIntoTextarea(target, text) {
      const element = target;
      const value = element.value ?? '';
      const start = typeof element.selectionStart === 'number' ? element.selectionStart : value.length;
      const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      element.value = `${before}${text}${after}`;
      const caret = start + text.length;
      if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        element.selectionStart = caret;
        element.selectionEnd = caret;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function enableEditor() {
      if (editorInstance) {
        return;
      }
      textarea.classList.add('rpwsh-hidden');
      host.classList.remove('rpwsh-hidden');
      toggleBtn.setAttribute('aria-pressed', 'true');
      toggleBtn.textContent = 'Revert to Original';

      const theme = detectTheme(settings.theme);
      activeTheme = theme;
      host.dataset.theme = theme;
      commandHost.dataset.theme = theme;
      commandPanelInstance?.setTheme?.(theme);

      editorModulePromise = editorModulePromise || import(browserAPI.runtime.getURL('content/editor.js'));
      try {
        const module = await editorModulePromise;
        editorInstance = await module.initEditor(textarea, {
          hostElement: surface,
          settings,
          theme
        });
        editorApi = editorInstance.api;
        editorApi.setTheme(theme);
        editorApi.setValue(textarea.value);
        disconnectTextareaListener = attachTextareaSync();
        commandsBtn.disabled = false;
        window.RoboToast?.show(`Robopack Rocket active (${editorInstance.mode === 'monaco' ? 'Monaco' : 'Prism'})`, {
          theme,
          duration: 3000
        });
        if (editorInstance.fallbackReason) {
          const reason = String(editorInstance.fallbackReason).slice(0, 160);
          window.RoboToast?.show(`Monaco editor unavailable: ${reason}`, {
            theme,
            duration: 5000
          });
        }
      } catch (error) {
        console.error('Failed to initialise Robopack Rocket', error);
        window.RoboToast?.show('Unable to load enhanced editor. See console for details.', {
          duration: 5000
        });
        disableEditor();
      }
    }

    function attachTextareaSync() {
      if (!editorApi) return null;
      const onEditorChange = editorApi.onChange((value) => {
        if (suppressSync) return;
        suppressSync = true;
        if (textarea.value !== value) {
          textarea.value = value;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
        suppressSync = false;
      });
      const onTextareaInput = (event) => {
        if (suppressSync) return;
        suppressSync = true;
        const newValue = textarea.value;
        if (editorApi.getValue() !== newValue) {
          editorApi.setValue(newValue);
        }
        suppressSync = false;
      };
      textarea.addEventListener('input', onTextareaInput);
      textarea.addEventListener('change', onTextareaInput);
      return () => {
        onEditorChange?.();
        textarea.removeEventListener('input', onTextareaInput);
        textarea.removeEventListener('change', onTextareaInput);
      };
    }

    async function disableEditor() {
      toggleBtn.setAttribute('aria-pressed', 'false');
      toggleBtn.textContent = 'Enhance PS Editor';
      textarea.classList.remove('rpwsh-hidden');
      host.classList.add('rpwsh-hidden');
      host.dataset.theme = '';
      commandHost.dataset.theme = '';
      hideCommandPanel();
      commandsBtn.disabled = true;
      disconnectTextareaListener?.();
      disconnectTextareaListener = null;
      if (editorInstance?.dispose) {
        editorInstance.dispose();
      }
      editorInstance = null;
      editorApi = null;
    }

    toggleBtn.addEventListener('click', () => {
      if (editorInstance) {
        disableEditor();
      } else {
        enableEditor();
      }
    });

    toggleBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleBtn.click();
      }
    });

    commandsBtn.addEventListener('click', () => {
      if (commandPanelOpen) {
        hideCommandPanel();
      } else {
        showCommandPanel();
      }
    });

    commandsBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        commandsBtn.click();
      }
    });

    enableEditor();
  }

  function buildSizeKey(textarea) {
    const identifier = textarea.id || textarea.name || textarea.getAttribute('data-testid') || 'default';
    return `${SIZE_PREFIX}${location.origin}${location.pathname}::${identifier}`;
  }

  async function applyStoredSize(host, key) {
    const stored = await browserAPI.storage.local.get(key);
    const size = stored?.[key];
    if (size?.height) {
      host.style.height = `${size.height}px`;
    }
    if (size?.width) {
      host.style.width = `${size.width}px`;
    }
  }

  function saveSize(host, key) {
    const rect = host.getBoundingClientRect();
    const payload = { [key]: { width: rect.width, height: rect.height } };
    browserAPI.storage.local.set(payload).catch((err) => console.warn('Failed to persist size', err));
  }
})();
