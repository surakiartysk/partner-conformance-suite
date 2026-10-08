import { useState } from 'react'
import { canSubmit, groupState, toggleOpen, type Group } from '../run-form'

interface Props {
  versions: string[]
  version: string
  onVersion: (version: string) => void
  groups: Group[]
  /** Ids of the cases chosen. */
  selected: string[]
  onToggleCase: (id: string) => void
  onToggleGroup: (service: string, on: boolean) => void
  onAll: () => void
  onNone: () => void
  onSubmit: () => void
  /** Why the form cannot be submitted right now, if it cannot. */
  busy: boolean
  problem: string | null
  /** Whether the groups start open. They start folded: twenty cases are a long form. */
  defaultOpen?: boolean
}

export function RunForm(props: Props) {
  const chosen = props.selected.length
  const total = props.groups.reduce((n, g) => n + g.cases.length, 0)
  // Folding only hides what is chosen; it never changes it, so it stays with the form.
  const [open, setOpen] = useState<string[]>(() =>
    props.defaultOpen ? props.groups.map((g) => g.service) : [],
  )
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit(chosen, props.busy)) props.onSubmit()
      }}
    >
      <fieldset>
        <legend>Partner version</legend>
        <p className="note">
          The partner is the service the suite tests: a points API that earns, redeems and reverses
          points. A version is a copy of it. <span className="mono">correct</span> follows the spec;
          every other one is wrong in one way, and the result says how.
        </p>
        {props.versions.map((name) => (
          <label className="opt" key={name}>
            <input
              type="radio"
              name="version"
              value={name}
              checked={props.version === name}
              onChange={() => props.onVersion(name)}
              disabled={props.busy}
            />
            <span>
              <span className="mono">{name}</span>
              {name === 'correct' ? (
                <small>Implements the spec. Everything should pass.</small>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Cases</legend>
        <div className="pick-tools">
          <button type="button" onClick={props.onAll} disabled={props.busy || chosen === total}>
            All
          </button>
          <button type="button" onClick={props.onNone} disabled={props.busy || chosen === 0}>
            None
          </button>
          <span className="mono note">
            {chosen} of {total} chosen
          </span>
        </div>
        {props.groups.map((group) => {
          const ids = group.cases.map((c) => c.id)
          const state = groupState(props.selected, ids)
          const isOpen = open.includes(group.service)
          return (
            <fieldset className="pick-group" key={group.service}>
              <div className="group-row">
                <label className="opt group-head">
                  <GroupBox
                    state={state}
                    disabled={props.busy}
                    onChange={() => props.onToggleGroup(group.service, state !== 'all')}
                  />
                  <span>
                    <span className="mono">{group.service}</span>
                    <small>
                      {ids.filter((id) => props.selected.includes(id)).length} of {ids.length}
                    </small>
                  </span>
                </label>
                <button
                  type="button"
                  className="fold"
                  aria-expanded={isOpen}
                  aria-controls={`cases-${group.service}`}
                  aria-label={`${isOpen ? 'Hide' : 'Show'} the ${group.service} cases`}
                  onClick={() => setOpen(toggleOpen(open, group.service))}
                >
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </button>
              </div>
              {isOpen ? (
                <div id={`cases-${group.service}`}>
                  {group.cases.map((c) => (
                    <label className="opt pick-case" key={c.id}>
                      <input
                        type="checkbox"
                        checked={props.selected.includes(c.id)}
                        onChange={() => props.onToggleCase(c.id)}
                        disabled={props.busy}
                      />
                      <span>
                        {c.name}
                        <small className="mono">{c.id}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>
          )
        })}
        {chosen === 0 ? <p className="problem">Choose at least one case.</p> : null}
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={!canSubmit(chosen, props.busy)}>
          {props.busy ? 'Running…' : `Run ${chosen} ${chosen === 1 ? 'case' : 'cases'}`}
        </button>
        {props.problem ? (
          <p role="alert" className="problem">
            {props.problem}
          </p>
        ) : null}
      </div>
    </form>
  )
}

/** A checkbox for a group: checked for all, dashed for some. `indeterminate` is a property, not an attribute. */
function GroupBox({
  state,
  disabled,
  onChange,
}: {
  state: 'all' | 'some' | 'none'
  disabled: boolean
  onChange: () => void
}) {
  return (
    <input
      type="checkbox"
      checked={state === 'all'}
      ref={(box) => {
        if (box) box.indeterminate = state === 'some'
      }}
      onChange={onChange}
      disabled={disabled}
      aria-checked={state === 'some' ? 'mixed' : state === 'all'}
    />
  )
}
