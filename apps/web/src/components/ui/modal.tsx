'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

import { cx } from './cx'

export interface ModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly description?: ReactNode
  readonly children?: ReactNode
  /** Action row (buttons). */
  readonly footer?: ReactNode
  readonly className?: string
}

/**
 * Accessible dialog on the native `<dialog>` element: focus moves inside and
 * is trapped, Escape and the backdrop close it, and focus returns to the
 * opener afterwards.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cx(
        'm-auto w-[min(100%-2rem,28rem)] rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-0 text-[#181713] shadow-[8px_8px_0_#181713] backdrop:bg-[#181713]/45',
        className,
      )}
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <h2 id={titleId} className="text-2xl font-black tracking-[-0.03em]">
            {title}
          </h2>
          {description ? (
            <div
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-black/65"
            >
              {description}
            </div>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? (
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}
