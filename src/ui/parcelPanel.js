const PANEL_STATES = new Set(['closed', 'compact', 'expanded']);
const HANDLE_DRAG_THRESHOLD = 28;
const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

function isWithin(target, container) {
  if (!target || !container) return false;
  if (typeof container.contains === 'function') return container.contains(target);
  for (let node = target; node; node = node.parentElement) {
    if (node === container) return true;
  }
  return false;
}

function isInteractiveTarget(target, panel, handleButton) {
  for (let node = target; node && node !== panel; node = node.parentElement) {
    if (node === handleButton) return false;
    if (INTERACTIVE_TAGS.has(node.tagName)
      || node.isContentEditable
      || node.getAttribute?.('role') === 'button') return true;
  }
  return false;
}

function formatAcreage(value, basis) {
  if (value === null || value === undefined) return 'Unavailable';
  const suffix = basis === 'calculated'
    ? ' · calculated'
    : basis === 'assessed'
      ? ' · assessed'
      : '';
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres${suffix}`;
}

export function createParcelPanel({
  elements,
  onClose = () => {},
  onRecordChange = () => {},
}) {
  let state = 'closed';
  let selection = [];
  let selectionIndex = 0;
  let handleDrag = null;
  let suppressHandleClick = false;

  const setConditionalVisibility = (element, hidden) => {
    element.hidden = hidden;
    element.inert = hidden;
  };

  const renderState = () => {
    const closed = state === 'closed';
    const expanded = state === 'expanded';
    elements.panel.dataset.state = state;
    elements.panel.hidden = closed;
    elements.panel.inert = closed;
    elements.panel.setAttribute('aria-hidden', String(closed));
    elements.panel.classList.toggle('is-open', !closed);
    elements.panel.classList.toggle('is-expanded', expanded);
    setConditionalVisibility(elements.expandedContent, !expanded);
    elements.handleButton.setAttribute('aria-expanded', String(expanded));
    elements.handleButton.setAttribute(
      'aria-label',
      expanded ? 'Collapse parcel details' : 'Expand parcel details',
    );
  };

  const setState = (nextState) => {
    if (!PANEL_STATES.has(nextState)) throw new TypeError(`Unknown parcel panel state: ${nextState}`);
    if (nextState !== 'closed' && !selection.length) return;
    state = nextState;
    renderState();
  };

  const renderRecord = () => {
    const parcel = selection[selectionIndex];
    if (!parcel) return;
    const { properties } = parcel;
    const jurisdiction = properties.jurisdiction ?? {};
    const source = properties.source ?? {};
    const places = [
      jurisdiction.municipality,
      jurisdiction.county ? `${jurisdiction.county} County` : null,
      jurisdiction.subdivision,
    ].filter(Boolean);
    const years = [
      source.rollYear ? `Assessment ${source.rollYear}` : null,
      source.spatialYear ? `Geometry ${source.spatialYear}` : null,
    ].filter(Boolean);

    elements.owner.textContent = properties.owner ?? 'Unavailable';
    elements.acreage.textContent = formatAcreage(properties.acreage, properties.acreageBasis);
    elements.parcelId.textContent = properties.displayId ?? properties.parcelId ?? 'Unavailable';
    elements.jurisdiction.textContent = places.join(' · ') || 'Unavailable';
    elements.year.textContent = years.join(' · ') || 'Unavailable';
    elements.source.textContent = source.name ?? 'Unavailable';
    elements.source.href = source.url ?? '#';

    const multiple = selection.length > 1;
    setConditionalVisibility(elements.recordNav, !multiple);
    elements.recordCount.textContent = multiple
      ? `${selectionIndex + 1} of ${selection.length} · Multiple parcel records`
      : '';
    elements.recordPrev.disabled = !multiple || selectionIndex === 0;
    elements.recordNext.disabled = !multiple || selectionIndex === selection.length - 1;
    onRecordChange(parcel);
  };

  const setSelection = (parcels) => {
    selection = [...parcels];
    selectionIndex = 0;
    if (!selection.length) {
      setConditionalVisibility(elements.recordNav, true);
      setState('closed');
      return;
    }
    renderRecord();
    setState('compact');
  };

  elements.closeButton.addEventListener('click', onClose);
  elements.handleButton.addEventListener('click', (event) => {
    if (suppressHandleClick) {
      suppressHandleClick = false;
      event?.preventDefault?.();
      return;
    }
    setState(state === 'expanded' ? 'compact' : 'expanded');
  });
  elements.panel.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || (Number.isFinite(event.button) && event.button !== 0)) return;
    if (isInteractiveTarget(event.target, elements.panel, elements.handleButton)) return;
    if (state === 'expanded' && isWithin(event.target, elements.scrollBody)) return;
    handleDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startedOnHandle: isWithin(event.target, elements.handleButton),
    };
    elements.panel.setPointerCapture?.(event.pointerId);
  });
  elements.panel.addEventListener('pointerup', (event) => {
    if (!handleDrag || event.pointerId !== handleDrag.pointerId) return;
    const deltaY = event.clientY - handleDrag.startY;
    const { startedOnHandle } = handleDrag;
    handleDrag = null;
    if (Math.abs(deltaY) < HANDLE_DRAG_THRESHOLD) return;

    setState(deltaY < 0 ? 'expanded' : 'compact');
    if (startedOnHandle) {
      suppressHandleClick = true;
      globalThis.setTimeout(() => { suppressHandleClick = false; }, 0);
    }
  });
  elements.panel.addEventListener('pointercancel', () => {
    handleDrag = null;
  });
  elements.recordPrev.addEventListener('click', () => {
    if (selectionIndex === 0) return;
    selectionIndex -= 1;
    renderRecord();
  });
  elements.recordNext.addEventListener('click', () => {
    if (selectionIndex >= selection.length - 1) return;
    selectionIndex += 1;
    renderRecord();
  });

  setConditionalVisibility(elements.recordNav, true);
  renderState();

  return {
    collapse: () => setState('compact'),
    expand: () => setState('expanded'),
    getState: () => state,
    setSelection,
  };
}
