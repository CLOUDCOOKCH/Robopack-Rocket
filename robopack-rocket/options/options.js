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
const ROBO_PACK_URLS = ['https://robopack.com/*', 'https://*.robopack.com/*'];

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

  testStatus.textContent = 'Looking for an open RoboPack tab...';

  try {
    const tabs = await queryRoboPackTabs();
    if (!tabs.length) {
      testStatus.textContent = 'No RoboPack tab detected. Open one and try again.';
      return;
    }

    const targetTab = tabs.find((tab) => tab.active && tab.id != null) ?? tabs.find((tab) => tab.id != null);
    if (!targetTab?.id) {
      testStatus.textContent = 'Found a RoboPack tab but could not contact it. Try reloading the page.';
      return;
    }

    const response = await sendMessageToTab(targetTab.id, {
      type: 'robopack-rocket-test-selectors',
      settings: payload
    });

    if (response && typeof response.count === 'number') {
      const label = targetTab.title ? `“${targetTab.title.trim()}”` : 'the RoboPack tab';
      testStatus.textContent = `Matched ${response.count} textarea${response.count === 1 ? '' : 's'} on ${label}.`;
    } else {
      testStatus.textContent = 'The RoboPack tab did not respond. Reload it and try again.';
    }
  } catch (error) {
    console.error('Test selector failed', error);
    const message = error?.message?.includes('Receiving end does not exist')
      ? 'The RoboPack tab is not ready yet. Reload it and try again.'
      : 'Could not reach a RoboPack tab. Ensure one is open and try again.';
    testStatus.textContent = message;
  }
});

function queryRoboPackTabs() {
  if (!browserAPI.tabs?.query) {
    return Promise.resolve([]);
  }

  const queryInfo = { url: ROBO_PACK_URLS };

  if (browserAPI.tabs.query.length > 1) {
    return new Promise((resolve, reject) => {
      browserAPI.tabs.query(queryInfo, (tabs) => {
        const lastError = browserAPI.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(tabs ?? []);
      });
    });
  }

  return browserAPI.tabs.query(queryInfo).catch((error) => {
    console.error('Failed to query RoboPack tabs', error);
    throw error;
  });
}

async function sendMessageToTab(tabId, message, { retry = true } = {}) {
  if (!browserAPI.tabs?.sendMessage) {
    return browserAPI.runtime.sendMessage(message);
  }

  try {
    if (browserAPI.tabs.sendMessage.length > 2) {
      return await new Promise((resolve, reject) => {
        browserAPI.tabs.sendMessage(tabId, message, (response) => {
          const lastError = browserAPI.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve(response);
        });
      });
    }

    return await browserAPI.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (retry && isMissingReceiverError(error)) {
      const injected = await injectContentScript(tabId);
      if (injected) {
        return sendMessageToTab(tabId, message, { retry: false });
      }
    }
    throw error;
  }
}

function isMissingReceiverError(error) {
  return error?.message?.includes('Could not establish connection')
    || error?.message?.includes('Receiving end does not exist');
}

async function injectContentScript(tabId) {
  try {
    if (browserAPI.scripting?.executeScript) {
      await browserAPI.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/content.js']
      });
      return true;
    }

    if (browserAPI.tabs?.executeScript) {
      await new Promise((resolve, reject) => {
        browserAPI.tabs.executeScript(tabId, { file: 'content/content.js', allFrames: true }, () => {
          const lastError = browserAPI.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve();
        });
      });
      return true;
    }
  } catch (error) {
    console.warn('Failed to inject RoboPack Rocket content script', error);
  }

  return false;
}

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
