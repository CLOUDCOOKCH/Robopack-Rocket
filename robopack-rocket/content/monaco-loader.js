const CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min';
let monacoLoaderPromise = null;

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureMonaco() {
  if (window.monaco) {
    return window.monaco;
  }
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = new Promise(async (resolve, reject) => {
      try {
        await loadScriptOnce(`${CDN_BASE}/vs/loader.js`);
        if (!window.require) {
          reject(new Error('Monaco AMD loader missing'));
          return;
        }
        window.require.config({ paths: { vs: `${CDN_BASE}/vs` } });
        window.MonacoEnvironment = {
          getWorkerUrl: function (_moduleId, label) {
            const workerPath = label === 'json' ? 'json.worker.js' : label === 'css' || label === 'scss' || label === 'less'
              ? 'css.worker.js'
              : label === 'html' || label === 'handlebars' || label === 'razor'
                ? 'html.worker.js'
                : label === 'typescript' || label === 'javascript'
                  ? 'ts.worker.js'
                  : 'editor.worker.js';
            const proxy = `self.MonacoEnvironment = { baseUrl: '${CDN_BASE}/' }; importScripts('${CDN_BASE}/vs/base/worker/${workerPath}');`;
            return URL.createObjectURL(new Blob([proxy], { type: 'text/javascript' }));
          }
        };
        window.require(['vs/editor/editor.main'], () => {
          resolve(window.monaco);
        }, reject);
      } catch (error) {
        reject(error);
      }
    });
  }
  return monacoLoaderPromise;
}

export async function createMonacoAdapter(textarea, config) {
  const monaco = await ensureMonaco();
  const options = config.options || {};
  const hostElement = config.hostElement;
  const theme = config.theme || 'light';

  hostElement.textContent = '';
  const container = document.createElement('div');
  container.className = 'rpwsh-editor-canvas';
  hostElement.appendChild(container);

  const model = monaco.editor.createModel(textarea.value, 'powershell');
  model.updateOptions({
    tabSize: Number(options.tabSize) || 4,
    insertSpaces: true
  });

  const editor = monaco.editor.create(container, {
    model,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: Number(options.fontSize) || 14,
    tabSize: Number(options.tabSize) || 4,
    insertSpaces: true,
    detectIndentation: false,
    wordWrap: options.wordWrap ? 'on' : 'off',
    renderLineHighlight: 'all',
    fixedOverflowWidgets: true,
    scrollBeyondLastLine: false
  });

  monaco.editor.setModelLanguage(model, 'powershell');
  setTheme(theme);

  let applying = false;
  const listeners = new Set();
  const subscription = editor.onDidChangeModelContent(() => {
    if (applying) return;
    const value = editor.getValue();
    listeners.forEach((cb) => {
      try {
        cb(value);
      } catch (error) {
        console.error('Listener error', error);
      }
    });
  });

  function setTheme(nextTheme) {
    if (nextTheme === 'dark') {
      monaco.editor.setTheme('vs-dark');
    } else {
      monaco.editor.setTheme('vs');
    }
  }

  return {
    api: {
      getValue: () => editor.getValue(),
      setValue: (value) => {
        const safe = value ?? '';
        if (editor.getValue() === safe) return;
        applying = true;
        editor.setValue(safe);
        applying = false;
      },
      onChange: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      focus: () => editor.focus(),
      setTheme: setTheme
    },
    dispose: () => {
      subscription.dispose();
      listeners.clear();
      model.dispose();
      editor.dispose();
      container.remove();
    }
  };
}
