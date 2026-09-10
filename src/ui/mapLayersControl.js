export const PROPERTY_LINES_STORAGE_KEY = 'huntnav.propertyLines.enabled';
export const PROPERTY_LINES_HINT = 'Tap a parcel for property details';

export function readPropertyLinesEnabled(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(PROPERTY_LINES_STORAGE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
  return true;
}

function persistPropertyLinesEnabled(storage, enabled) {
  try {
    storage?.setItem(PROPERTY_LINES_STORAGE_KEY, String(enabled));
  } catch {
    // The control remains usable for the current session if persistence fails.
  }
}

export function createMapLayersControl({
  elements,
  storage = globalThis.localStorage,
  initialPropertyLinesEnabled = readPropertyLinesEnabled(storage),
  onPropertyLinesChange = () => {},
  onHint = () => {},
}) {
  let propertyLinesEnabled = Boolean(initialPropertyLinesEnabled);
  let open = false;

  const renderOpenState = () => {
    elements.panel.hidden = !open;
    elements.panel.inert = !open;
    elements.menuButton.setAttribute('aria-expanded', String(open));
  };

  const renderPropertyLinesState = () => {
    elements.propertyToggle.setAttribute('aria-pressed', String(propertyLinesEnabled));
    if (propertyLinesEnabled) {
      elements.propertyStatus.textContent = 'Preparing parcel source…';
      elements.propertyToggle.dataset.state = 'loading';
    } else {
      elements.propertyStatus.textContent = 'Property lines off';
      elements.propertyToggle.dataset.state = 'off';
    }
  };

  const setOpen = (nextOpen) => {
    open = Boolean(nextOpen);
    renderOpenState();
  };

  const setPropertyLinesEnabled = (enabled, { persist = true, notify = true } = {}) => {
    const previous = propertyLinesEnabled;
    propertyLinesEnabled = Boolean(enabled);
    renderPropertyLinesState();
    if (persist) persistPropertyLinesEnabled(storage, propertyLinesEnabled);
    if (!notify || previous === propertyLinesEnabled) return;
    onPropertyLinesChange(propertyLinesEnabled, { previous });
    if (!previous && propertyLinesEnabled) onHint(PROPERTY_LINES_HINT);
  };

  elements.menuButton.addEventListener('click', () => setOpen(!open));
  elements.closeButton.addEventListener('click', () => setOpen(false));
  elements.propertyToggle.addEventListener('click', () => {
    setPropertyLinesEnabled(!propertyLinesEnabled);
  });

  renderOpenState();
  renderPropertyLinesState();

  return {
    isPropertyLinesEnabled: () => propertyLinesEnabled,
    setOpen,
    setPropertyLinesEnabled,
    setStatus({ state, message }) {
      elements.propertyStatus.textContent = message;
      elements.propertyToggle.dataset.state = state;
    },
  };
}
