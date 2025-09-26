import { PSADT_SCENARIOS } from '../lib/psadt-scenarios.js';

const FILE_BASE_SUGGESTIONS = [
  '$adtSession.DirFiles',
  '$adtSession.DirSupportFiles'
];

function sortScenarios(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function normaliseText(value) {
  return (value ?? '').toString().toLowerCase();
}

function hasFieldValue(field, value) {
  if (field.type === 'multiselect') {
    return Array.isArray(value) && value.length > 0;
  }
  if (field.type === 'number') {
    return value !== '' && value !== null && value !== undefined && !Number.isNaN(value);
  }
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function attachInputListeners(element, handler) {
  element.addEventListener('input', handler);
  element.addEventListener('change', handler);
}

export function createCommandPanel(hostElement, options = {}) {
  const onInsert = typeof options.onInsert === 'function' ? options.onInsert : () => {};
  const onClose = typeof options.onClose === 'function' ? options.onClose : () => {};
  let theme = options.theme || 'light';

  const scenarios = sortScenarios(PSADT_SCENARIOS);
  const scenarioStates = new Map();
  let filtered = scenarios;
  let activeScenario = null;
  let currentCommand = '';

  hostElement.innerHTML = '';
  hostElement.dataset.theme = theme;

  const panel = document.createElement('div');
  panel.className = 'rpwsh-command-panel';
  hostElement.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'rpwsh-command-header';
  panel.appendChild(header);

  const title = document.createElement('h3');
  title.textContent = 'PSADT Command Builder';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rpwsh-command-close';
  closeBtn.setAttribute('aria-label', 'Close command builder');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => onClose());
  header.appendChild(closeBtn);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'rpwsh-command-search';
  panel.appendChild(searchWrap);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search commands';
  searchInput.setAttribute('aria-label', 'Search PSADT commands');
  searchWrap.appendChild(searchInput);

  const list = document.createElement('div');
  list.className = 'rpwsh-command-list';
  panel.appendChild(list);

  const detail = document.createElement('div');
  detail.className = 'rpwsh-command-detail';
  panel.appendChild(detail);

  const status = document.createElement('div');
  status.className = 'rpwsh-command-status';
  panel.appendChild(status);

  function renderList() {
    list.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'rpwsh-command-empty';
      empty.textContent = 'No commands match your search.';
      list.appendChild(empty);
      return;
    }

    filtered.forEach((scenario) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rpwsh-command-item';
      button.textContent = scenario.name;
      button.dataset.commandId = scenario.id;
      const isActive = activeScenario?.id === scenario.id;
      if (isActive) {
        button.classList.add('rpwsh-command-item--active');
      }
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.addEventListener('click', () => {
        selectScenario(scenario);
      });
      if (scenario.description) {
        button.title = scenario.description;
      }
      list.appendChild(button);
    });
  }

  function renderDetail(scenario) {
    detail.innerHTML = '';
    status.textContent = '';
    currentCommand = '';

    if (!scenario) {
      const placeholder = document.createElement('p');
      placeholder.className = 'rpwsh-command-placeholder';
      placeholder.textContent = 'Pick a command to review fields and generate syntax.';
      detail.appendChild(placeholder);
      return;
    }

    const heading = document.createElement('h4');
    heading.textContent = scenario.name;
    detail.appendChild(heading);

    if (scenario.description) {
      const description = document.createElement('p');
      description.className = 'rpwsh-command-description';
      description.textContent = scenario.description;
      detail.appendChild(description);
    }

    const form = document.createElement('form');
    form.className = 'rpwsh-command-form';
    form.addEventListener('submit', (event) => event.preventDefault());
    detail.appendChild(form);

    const fieldRefs = new Map();
    const stored = scenarioStates.get(scenario.id) || {};

    scenario.fields.forEach((field) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'rpwsh-command-field';

      const label = document.createElement('label');
      label.className = 'rpwsh-command-label';
      label.setAttribute('for', `cmd-${scenario.id}-${field.id}`);
      label.textContent = `${field.label}${field.required ? ' *' : ''}`;
      wrapper.appendChild(label);

      let container = wrapper;
      let baseInput = null;
      if (field.fileBase) {
        const baseRow = document.createElement('div');
        baseRow.className = 'rpwsh-command-base-row';
        const baseLabel = document.createElement('label');
        baseLabel.className = 'rpwsh-command-base-label';
        baseLabel.textContent = 'Base';
        baseRow.appendChild(baseLabel);
        baseInput = document.createElement('input');
        baseInput.type = 'text';
        baseInput.className = 'rpwsh-command-base-input';
        baseInput.id = `cmd-${scenario.id}-${field.id}-base`;
        baseLabel.setAttribute('for', baseInput.id);
        baseInput.value = stored[`${field.id}Base`] || '$adtSession.DirFiles';
        const datalistId = `cmd-base-options-${field.id}`;
        baseInput.setAttribute('list', datalistId);
        let datalist = hostElement.querySelector(`datalist#${datalistId}`);
        if (!datalist) {
          datalist = document.createElement('datalist');
          datalist.id = datalistId;
          FILE_BASE_SUGGESTIONS.forEach((option) => {
            const opt = document.createElement('option');
            opt.value = option;
            datalist.appendChild(opt);
          });
          hostElement.appendChild(datalist);
        }
        baseRow.appendChild(baseInput);
        container = document.createElement('div');
        container.className = 'rpwsh-command-field-body';
        container.appendChild(baseRow);
      }

      let input;
      switch (field.type) {
        case 'textarea':
          input = document.createElement('textarea');
          input.rows = 3;
          break;
        case 'select':
          input = document.createElement('select');
          {
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = '—';
            input.appendChild(empty);
            (field.options || []).forEach((opt) => {
              const option = document.createElement('option');
              option.value = typeof opt === 'object' ? opt.value : opt;
              option.textContent = typeof opt === 'object' ? (opt.label || opt.value) : opt;
              input.appendChild(option);
            });
          }
          break;
        case 'multiselect':
          input = document.createElement('select');
          input.multiple = true;
          input.size = Math.min(8, (field.options || []).length || 4);
          (field.options || []).forEach((opt) => {
            const option = document.createElement('option');
            option.value = typeof opt === 'object' ? opt.value : opt;
            option.textContent = typeof opt === 'object' ? (opt.label || opt.value) : opt;
            input.appendChild(option);
          });
          break;
        case 'number':
          input = document.createElement('input');
          input.type = 'number';
          if (field.min != null) input.min = field.min;
          if (field.max != null) input.max = field.max;
          break;
        default:
          input = document.createElement('input');
          input.type = 'text';
          break;
      }

      input.id = `cmd-${scenario.id}-${field.id}`;
      input.name = field.id;
      if (field.placeholder) {
        input.placeholder = field.placeholder;
      }
      if (field.required) {
        input.required = true;
      }
      if (field.pattern) {
        input.pattern = field.pattern;
        if (field.patternMessage) {
          input.title = field.patternMessage;
        }
      }

      const presetValue = stored[field.id];
      if (presetValue !== undefined) {
        if (field.type === 'multiselect' && Array.isArray(presetValue) && input instanceof HTMLSelectElement) {
          Array.from(input.options).forEach((option) => {
            option.selected = presetValue.includes(option.value);
          });
        } else if (field.type === 'number' && presetValue !== '') {
          input.value = String(presetValue);
        } else if (presetValue != null) {
          input.value = String(presetValue);
        }
      }

      const changeHandler = () => updatePreview(scenario, fieldRefs);
      attachInputListeners(input, changeHandler);
      if (baseInput) {
        attachInputListeners(baseInput, changeHandler);
      }

      if (container !== wrapper) {
        const body = document.createElement('div');
        body.className = 'rpwsh-command-input-body';
        body.appendChild(input);
        container.appendChild(body);
        wrapper.appendChild(container);
      } else {
        wrapper.appendChild(input);
      }

      form.appendChild(wrapper);

      fieldRefs.set(field.id, { input, baseInput, field });
    });

    const previewWrap = document.createElement('div');
    previewWrap.className = 'rpwsh-command-preview-wrap';
    detail.appendChild(previewWrap);

    const previewLabel = document.createElement('div');
    previewLabel.className = 'rpwsh-command-preview-label';
    previewLabel.textContent = 'Generated command';
    previewWrap.appendChild(previewLabel);

    const preview = document.createElement('pre');
    preview.className = 'rpwsh-command-preview';
    previewWrap.appendChild(preview);

    const actions = document.createElement('div');
    actions.className = 'rpwsh-command-actions';
    detail.appendChild(actions);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'rpwsh-command-action';
    copyBtn.textContent = 'Copy';
    copyBtn.disabled = true;
    actions.appendChild(copyBtn);

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'rpwsh-command-action rpwsh-command-action--primary';
    insertBtn.textContent = 'Insert';
    insertBtn.disabled = true;
    actions.appendChild(insertBtn);

    copyBtn.addEventListener('click', async () => {
      if (!currentCommand.trim()) {
        return;
      }
      try {
        await navigator.clipboard.writeText(currentCommand);
        copyBtn.textContent = 'Copied!';
        copyBtn.disabled = true;
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.disabled = !currentCommand.trim();
        }, 1500);
      } catch (error) {
        console.warn('Copy failed', error);
        status.textContent = 'Unable to copy to clipboard in this context.';
      }
    });

    insertBtn.addEventListener('click', () => {
      if (!currentCommand.trim()) {
        return;
      }
      onInsert(currentCommand);
      insertBtn.textContent = 'Inserted!';
      insertBtn.disabled = true;
      setTimeout(() => {
        insertBtn.textContent = 'Insert';
        insertBtn.disabled = !currentCommand.trim();
      }, 1200);
    });

    updatePreview(scenario, fieldRefs, preview, copyBtn, insertBtn);
  }

  function collectValues(scenario, refs) {
    const values = {};
    scenario.fields.forEach((field) => {
      const ref = refs.get(field.id);
      if (!ref) return;
      const el = ref.input;
      let value;
      if (field.type === 'multiselect' && el instanceof HTMLSelectElement) {
        value = Array.from(el.selectedOptions).map((opt) => opt.value);
      } else if (field.type === 'number') {
        value = el.value === '' ? '' : Number(el.value);
      } else {
        value = el.value;
      }
      values[field.id] = value;
      if (field.fileBase) {
        const base = ref.baseInput?.value?.trim();
        values[`${field.id}Base`] = base || '$adtSession.DirFiles';
      }
    });
    return values;
  }

  function updatePreview(scenario, refs, previewEl, copyBtn, insertBtn) {
    if (!scenario || !refs) {
      return;
    }
    const preview = previewEl || detail.querySelector('.rpwsh-command-preview');
    const copy = copyBtn || detail.querySelector('.rpwsh-command-action');
    const insert = insertBtn || detail.querySelector('.rpwsh-command-action--primary');

    const values = collectValues(scenario, refs);
    scenarioStates.set(scenario.id, values);

    const missing = scenario.fields.filter((field) => field.required && !hasFieldValue(field, values[field.id]));
    const invalid = scenario.fields.filter((field) => {
      const ref = refs.get(field.id);
      if (!ref) return false;
      const input = ref.input;
      return typeof input.checkValidity === 'function' && !input.checkValidity();
    });

    if (missing.length) {
      preview.textContent = '';
      currentCommand = '';
      status.textContent = `Missing: ${missing.map((f) => f.label).join(', ')}`;
      if (copy) copy.disabled = true;
      if (insert) insert.disabled = true;
      return;
    }

    if (invalid.length) {
      preview.textContent = '';
      currentCommand = '';
      status.textContent = `Invalid: ${invalid.map((f) => f.label).join(', ')}`;
      if (copy) copy.disabled = true;
      if (insert) insert.disabled = true;
      return;
    }

    try {
      const built = scenario.build(values) || '';
      currentCommand = built;
      preview.textContent = built;
      const usable = built.trim().length > 0;
      status.textContent = usable ? '' : 'Command produced no output. Review field values.';
      if (copy) copy.disabled = !usable;
      if (insert) insert.disabled = !usable;
    } catch (error) {
      console.error('Command build failed', error);
      currentCommand = '';
      preview.textContent = '';
      status.textContent = `Error generating command: ${error.message}`;
      if (copy) copy.disabled = true;
      if (insert) insert.disabled = true;
    }
  }

  function selectScenario(scenario) {
    activeScenario = scenario;
    renderList();
    renderDetail(scenario);
  }

  function applyFilter(query) {
    const term = normaliseText(query);
    if (!term) {
      filtered = scenarios;
    } else {
      filtered = scenarios.filter((scenario) => {
        return normaliseText(scenario.name).includes(term) || normaliseText(scenario.description).includes(term);
      });
    }
    if (activeScenario && !filtered.some((item) => item.id === activeScenario.id)) {
      activeScenario = null;
    }
    renderList();
    renderDetail(activeScenario);
  }

  searchInput.addEventListener('input', () => applyFilter(searchInput.value));

  renderList();
  renderDetail(activeScenario);

  return {
    setTheme(nextTheme) {
      if (!nextTheme) return;
      theme = nextTheme;
      hostElement.dataset.theme = nextTheme;
    },
    focusSearch() {
      searchInput?.focus();
      searchInput?.select?.();
    },
    destroy() {
      scenarioStates.clear();
      hostElement.innerHTML = '';
    }
  };
}
