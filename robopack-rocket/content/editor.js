const browserAPI = window.browser ?? window.chrome;
const DEFAULT_OPTIONS = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: false
};

export async function initEditor(textarea, options = {}) {
  const hostElement = options.hostElement;
  if (!hostElement) {
    throw new Error('hostElement is required to initialise the editor');
  }
  const settings = Object.assign({}, DEFAULT_OPTIONS, options.settings ?? {});
  const theme = options.theme ?? 'light';
  const preferred = (settings.preferredHighlighter || options.preferredHighlighter || 'auto').toLowerCase();

  let lastError = null;
  if (preferred !== 'prism') {
    try {
      const monacoModule = await import(browserAPI.runtime.getURL('content/monaco-loader.js'));
      const adapter = await monacoModule.createMonacoAdapter(textarea, {
        hostElement,
        options: settings,
        theme
      });
      return Object.assign(adapter, { mode: 'monaco', fallbackReason: null });
    } catch (error) {
      console.warn('[Robopack Rocket] Monaco unavailable, falling back to Prism', error);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const prismModule = await import(browserAPI.runtime.getURL('content/prism-loader.js'));
  const adapter = await prismModule.createPrismAdapter(textarea, {
    hostElement,
    options: settings,
    theme,
    fallbackReason: lastError || (preferred === 'prism' ? null : 'Monaco disabled')
  });
  return Object.assign(adapter, { mode: 'prism', fallbackReason: lastError });
}
