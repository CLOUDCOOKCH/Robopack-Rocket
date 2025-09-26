const PRISM_VERSION = '1.29.0';
const PRISM_BASE = `https://cdn.jsdelivr.net/npm/prismjs@${PRISM_VERSION}`;
let prismPromise = null;
let loadedThemes = new Set();

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
    document.head.appendChild(script);
  });
}

function loadCSS(url) {
  return new Promise((resolve, reject) => {
    try {
      if ([...document.styleSheets].some((sheet) => sheet.href === url)) {
        resolve();
        return;
      }
    } catch (error) {
      // Accessing sheet.href can fail because of CORS; ignore and proceed to inject.
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
    document.head.appendChild(link);
  });
}

async function ensurePrism(theme) {
  if (!prismPromise) {
    prismPromise = new Promise(async (resolve, reject) => {
      try {
        await loadScript(`${PRISM_BASE}/components/prism-core.min.js`);
        await loadScript(`${PRISM_BASE}/components/prism-clike.min.js`);
        await loadScript(`${PRISM_BASE}/components/prism-powershell.min.js`);
        await loadScript(`${PRISM_BASE}/plugins/line-numbers/prism-line-numbers.min.js`);
        resolve(window.Prism);
      } catch (error) {
        reject(error);
      }
    });
  }
  const Prism = await prismPromise;
  await ensureTheme(theme || 'light');
  return Prism;
}

async function ensureTheme(theme) {
  const key = theme === 'dark' ? 'prism-tomorrow' : 'prism';
  if (loadedThemes.has(key)) return;
  const cssUrl = theme === 'dark'
    ? `${PRISM_BASE}/themes/prism-tomorrow.min.css`
    : `${PRISM_BASE}/themes/prism.min.css`;
  await loadCSS(cssUrl);
  await loadCSS(`${PRISM_BASE}/plugins/line-numbers/prism-line-numbers.min.css`);
  loadedThemes.add(key);
}

export async function createPrismAdapter(textarea, config) {
  const hostElement = config.hostElement;
  const options = config.options || {};
  const theme = config.theme || 'light';
  const fallbackReason = config.fallbackReason || null;
  const Prism = await ensurePrism(theme);

  hostElement.textContent = '';
  const container = document.createElement('div');
  container.className = 'rpwsh-prism-container rpwsh-editor-canvas';
  hostElement.appendChild(container);

  const highlight = document.createElement('pre');
  highlight.className = 'language-powershell rpwsh-prism-highlight line-numbers';
  const code = document.createElement('code');
  code.className = 'language-powershell';
  highlight.appendChild(code);

  const editable = document.createElement('div');
  editable.className = 'rpwsh-prism-editable';
  editable.contentEditable = 'true';
  editable.spellcheck = false;
  editable.setAttribute('role', 'textbox');
  editable.setAttribute('aria-label', 'PowerShell code editor');
  editable.setAttribute('aria-multiline', 'true');
  editable.style.fontSize = `${options.fontSize || 14}px`;
  editable.style.tabSize = String(options.tabSize || 4);
  editable.style.whiteSpace = options.wordWrap ? 'pre-wrap' : 'pre';
  highlight.style.whiteSpace = editable.style.whiteSpace;
  highlight.style.tabSize = editable.style.tabSize;

  const updateHighlight = () => {
    const value = getValue();
    highlight.querySelectorAll('.line-numbers-rows').forEach((node) => node.remove());
    code.textContent = value;
    Prism.highlightElement(code);
  };

  const syncScroll = () => {
    highlight.scrollTop = editable.scrollTop;
    highlight.scrollLeft = editable.scrollLeft;
  };

  editable.addEventListener('scroll', syncScroll);

  let applying = false;
  const listeners = new Set();
  const debouncedNotify = debounce(() => {
    const value = getValue();
    listeners.forEach((cb) => {
      try {
        cb(value);
      } catch (error) {
        console.error('Listener error', error);
      }
    });
  }, 120);

  const observer = new MutationObserver(() => {
    if (applying) return;
    updateHighlight();
    debouncedNotify();
  });
  observer.observe(editable, { characterData: true, childList: true, subtree: true });

  editable.addEventListener('input', () => {
    if (applying) return;
    updateHighlight();
    debouncedNotify();
  });

  editable.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      insertAtCursor(' '.repeat(options.tabSize || 2));
    }
  });

  editable.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text');
    insertAtCursor(text);
  });

  container.appendChild(highlight);
  container.appendChild(editable);

  setValue(textarea.value);
  setTheme(theme);

  function insertAtCursor(text) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function getValue() {
    return editable.textContent || '';
  }

  function setValue(value) {
    applying = true;
    editable.textContent = value ?? '';
    applying = false;
    updateHighlight();
  }

  function setTheme(nextTheme) {
    ensureTheme(nextTheme).catch((error) => console.warn('Failed to load Prism theme', error));
    container.dataset.theme = nextTheme;
    editable.style.caretColor = nextTheme === 'dark' ? '#f8fafc' : '#0f172a';
  }

  return {
    api: {
      getValue,
      setValue,
      onChange: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      focus: () => editable.focus(),
      setTheme,
      insertSnippet: (text) => {
        if (typeof text !== 'string' || !text) {
          return;
        }
        editable.focus();
        insertAtCursor(text);
      }
    },
    dispose: () => {
      listeners.clear();
      observer.disconnect();
      container.remove();
    },
    fallbackReason
  };
}

function debounce(fn, delay) {
  let handle = null;
  return function (...args) {
    clearTimeout(handle);
    handle = setTimeout(() => fn.apply(this, args), delay);
  };
}
