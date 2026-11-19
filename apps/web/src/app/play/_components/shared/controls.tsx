'use client'

import { useId, type ReactNode } from 'react'

import { cx } from '@/components/ui/cx'

import type { Choice, StepperSpec } from '../../_lib/settings-options'
import { stepValue } from '../../_lib/settings-options'

/** Settings controls. `readOnly` keeps values legible for non-hosts. */

export interface ChoiceGroupProps<T extends string | number> {
  readonly label: string
  readonly value: T
  readonly choices: readonly Choice<T>[]
  readonly onChange: (value: T) => void
  readonly readOnly?: boolean
  /** Shown under the group, e.g. the selected choice's description. */
  readonly hint?: ReactNode
  readonly className?: string
}

/** A single-select row of chips (radio semantics). */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  choices,
  onChange,
  readOnly = false,
  hint,
  className,
}: ChoiceGroupProps<T>) {
  const labelId = useId()
  const selected = choices.find((choice) => choice.value === value)
  const description = hint ?? selected?.description
  return (
    <div className={cx('grid gap-2', className)}>
      <p id={labelId} className="text-sm font-black">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-readonly={readOnly || undefined}
        className="flex flex-wrap gap-1.5"
      >
        {choices.map((choice) => {
          const checked = choice.value === value
          return (
            <button
              key={String(choice.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={readOnly || undefined}
              onClick={() => {
                if (!readOnly && !checked) onChange(choice.value)
              }}
              className={cx(
                'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35',
                checked
                  ? 'border-[#181713] bg-[#181713] text-white'
                  : 'border-black/15 bg-white text-black/70',
                !readOnly && !checked && 'hover:border-[#181713]',
                readOnly && !checked && 'opacity-55',
                readOnly && 'cursor-default',
              )}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
      {description ? (
        <p className="text-xs leading-5 text-black/55">{description}</p>
      ) : null}
    </div>
  )
}

export interface ToggleProps {
  readonly label: string
  readonly description?: ReactNode
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly readOnly?: boolean
  readonly className?: string
}

/** On/off switch with its label; the whole row is the 44 px target. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
  readOnly = false,
  className,
}: ToggleProps) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={readOnly || undefined}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={() => {
        if (!readOnly) onChange(!checked)
      }}
      className={cx(
        'flex min-h-11 w-full items-center gap-3 rounded-2xl px-1 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35',
        readOnly ? 'cursor-default' : 'hover:bg-black/[0.03]',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-black">
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="mt-0.5 block text-xs leading-5 text-black/55"
          >
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full border-2 border-[#181713] transition-colors',
          checked ? 'bg-[#1f9d72]' : 'bg-[#ded8cc]',
          readOnly && 'opacity-60',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-5 rounded-full border-2 border-[#181713] bg-white transition-[left]',
            checked ? 'left-[calc(100%-1.375rem)]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

export interface StepperProps {
  readonly label: string
  readonly value: number
  readonly spec: StepperSpec
  readonly onChange: (value: number) => void
  readonly format?: (value: number) => string
  readonly readOnly?: boolean
  readonly description?: ReactNode
}

/** − value + for bounded numbers. */
export function Stepper({
  label,
  value,
  spec,
  onChange,
  format = String,
  readOnly = false,
  description,
}: StepperProps) {
  const labelId = useId()
  const step = (direction: -1 | 1) => {
    const next = stepValue(value, spec, direction)
    if (next !== value) onChange(next)
  }
  return (
    <div className="flex min-h-11 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-sm font-black">
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-black/55">
            {description}
          </p>
        ) : null}
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex shrink-0 items-center gap-1"
      >
        {readOnly ? null : (
          <StepButton
            label={`Less ${label.toLowerCase()}`}
            disabled={value <= spec.min}
            onClick={() => step(-1)}
          >
            −
          </StepButton>
        )}
        <output
          aria-live="polite"
          className="min-w-14 text-center font-mono text-base font-black tabular-nums"
        >
          {format(value)}
        </output>
        {readOnly ? null : (
          <StepButton
            label={`More ${label.toLowerCase()}`}
            disabled={value >= spec.max}
            onClick={() => step(1)}
          >
            +
          </StepButton>
        )}
      </div>
    </div>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string
  readonly disabled: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl border-2 border-[#181713] bg-white text-xl font-black shadow-[2px_2px_0_#181713] transition active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-35 disabled:shadow-none"
    >
      {children}
    </button>
  )
}
