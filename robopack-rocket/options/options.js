const browserAPI = window.browser ?? window.chrome;
const SETTINGS_KEY = 'robopackRocketSettings';
const DEFAULT_SETTINGS = {
  selectors: '',
  preferredHighlighter: 'auto',
  fontSize: 14,
  tabSize: 4,
  wordWrap: false,
  theme: 'auto'
};

const form = document.getElementById('options-form');
const selectorsInput = document.getElementById('selectors');
const preferredInput = document.getElementById('preferredHighlighter');
const fontSizeInput = document.getElementById('fontSize');
const tabSizeInput = document.getElementById('tabSize');
const wordWrapInput = document.getElementById('wordWrap');
const themeInput = document.getElementById('theme');
const testButton = document.getElementById('test-selectors');
const testStatus = document.getElementById('test-status');
const resetButton = document.getElementById('reset');

init();

async function init() {
  const stored = await browserAPI.storage.local.get(SETTINGS_KEY);
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored?.[SETTINGS_KEY] ?? {});
  applySettingsToForm(settings);
}

function applySettingsToForm(settings) {
  selectorsInput.value = settings.selectors ?? '';
  preferredInput.value = settings.preferredHighlighter ?? 'auto';
  fontSizeInput.value = settings.fontSize ?? 14;
  tabSizeInput.value = settings.tabSize ?? 4;
  wordWrapInput.checked = Boolean(settings.wordWrap);
  themeInput.value = settings.theme ?? 'auto';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = collectFormValues();
  if (!data) {
    return;
  }
  await browserAPI.storage.local.set({ [SETTINGS_KEY]: data });
  flash('Saved successfully.', 'success');
});

resetButton.addEventListener('click', async () => {
  applySettingsToForm(DEFAULT_SETTINGS);
  await browserAPI.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  flash('Settings reset to defaults.', 'info');
});

testButton.addEventListener('click', async () => {
  const payload = collectFormValues(false);
  if (!payload) {
    return;
  }
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'robopack-rocket-test-selectors',
      settings: payload
    });
    if (response && typeof response.count === 'number') {
      testStatus.textContent = `Matched ${response.count} textarea${response.count === 1 ? '' : 's'} on the current page.`;
    } else {
      testStatus.textContent = 'No response from content script. Ensure a RoboPack tab is open.';
    }
  } catch (error) {
    console.error('Test selector failed', error);
    testStatus.textContent = 'Could not reach the current tab. Is a RoboPack page open?';
  }
});

function collectFormValues(showErrors = true) {
  const selectors = selectorsInput.value.trim();
  const preferredHighlighter = preferredInput.value;
  const fontSize = Number(fontSizeInput.value);
  const tabSize = Number(tabSizeInput.value);
  const wordWrap = wordWrapInput.checked;
  const theme = themeInput.value;

  if (!Number.isFinite(fontSize) || fontSize < 10 || fontSize > 32) {
    if (showErrors) {
      flash('Font size must be between 10 and 32.', 'error');
    }
    return null;
  }

  if (!Number.isFinite(tabSize) || tabSize < 2 || tabSize > 8) {
    if (showErrors) {
      flash('Tab size must be between 2 and 8.', 'error');
    }
    return null;
  }

  return {
    selectors,
    preferredHighlighter,
    fontSize,
    tabSize,
    wordWrap,
    theme
  };
}

function flash(message, variant = 'info') {
  const template = document.getElementById('toast-template');
  const el = template.content.firstElementChild.cloneNode(true);
  el.textContent = message;
  el.dataset.variant = variant;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.add('show');
  });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2400);
}
