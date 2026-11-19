const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** True for elements that take typed text (where shortcuts must not fire). */
export function isEditableElement(
  element: Element | EventTarget | null,
): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return !element.disabled
  if (element instanceof HTMLSelectElement) return true
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !NON_TEXT_INPUT_TYPES.has(element.type)
  }
  return false
}

/** True while a modal dialog is open (global shortcuts should pause). */
export function isModalOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}
