/* global document, Element, HTMLButtonElement, HTMLInputElement, SubmitEvent */
// Plugin pages run in an iframe sandboxed with allow-scripts only. Chromium
// (WebView2 on Windows, Linux builds) checks the missing allow-forms flag before
// it fires `submit`, so a submit button or Enter in a field never reaches the
// page's @submit handler; WebKit fires the event first. Pages never navigate on
// submit, so both engines get the same behaviour: the native submission is
// cancelled and a cancelable `submit` event is dispatched to the form instead.

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);

function submitTo(form, submitter, event) {
  event.preventDefault();
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }));
}

// Element Plus overlays (drawers, dialogs) stop click propagation, so a document
// listener in the bubble phase never sees their buttons. The capture listener
// below only finds the control and then listens on the control itself, which
// runs after the component's own handlers and still sees their preventDefault.
function afterTarget(element, type, event, handle) {
  const listener = e => {
    element.removeEventListener(type, listener);
    if (e === event && !e.defaultPrevented) handle(e);
  };
  element.addEventListener(type, listener);
}

function onClick(event) {
  if (event.button !== 0) return;
  const button = event.target instanceof Element ? event.target.closest('button, input[type="submit"]') : null;
  if (!button || button.disabled || button.type !== 'submit' || !button.form) return;
  afterTarget(button, 'click', event, e => submitTo(button.form, button, e));
}

// Implicit submission: Enter in a single-line field. Handlers that consume
// Enter themselves (select filters, autocompletes) cancel the key first.
function onKeydown(event) {
  if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || !TEXT_INPUTS.has(field.type) || !field.form || field.readOnly || field.disabled) return;
  afterTarget(field, 'keydown', event, e => {
    const elements = [...field.form.elements];
    const submitter = elements.find(el => (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) && el.type === 'submit') ?? null;
    if (submitter?.disabled) { e.preventDefault(); return; }
    // Like the browser: without a submit button only a lone text field submits.
    if (!submitter && elements.filter(el => el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type)).length > 1) return;
    submitTo(field.form, submitter, e);
  });
}

let installed = false;
export function installSandboxForms(doc = document) {
  if (installed) return;
  installed = true;
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeydown, true);
}
