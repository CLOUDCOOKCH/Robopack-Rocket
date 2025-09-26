const browserAPI = window.browser ?? window.chrome;

const openOptionsButton = document.getElementById('open-options');

openOptionsButton?.addEventListener('click', () => {
  if (browserAPI?.runtime?.openOptionsPage) {
    browserAPI.runtime.openOptionsPage();
  } else if (browserAPI?.tabs?.create) {
    browserAPI.tabs.create({ url: browserAPI.runtime.getURL('options/options.html') });
  }
  window.close();
});
