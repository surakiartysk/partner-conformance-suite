import { useState, type ReactNode } from 'react'
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
  busy: boolean
  /** Why the form cannot be submitted right now, if it cannot. */
  problem: string | null
  /** What takes the place of the cases once a run has begun. */
  aside?: ReactNode
  /** Whether the groups start open. They start folded: twenty cases are a long form. */
  defaultOpen?: boolean
}

const PLANTED = 'Planted bugs, one in each; the result says which'

export function RunForm(props: Props) {
  const chosen = props.selected.length
  const total = props.groups.reduce((n, g) => n + g.cases.length, 0)
  // Folding only hides what is chosen; it never changes it, so it stays with the form.
  const [open, setOpen] = useState<string[]>(() =>
    props.defaultOpen ? props.groups.map((g) => g.service) : [],
  )
  const others = props.versions.filter((name) => name !== 'correct')
  const radio = (name: string) => (
    <input
      type="radio"
      name="version"
      value={name}
      checked={props.version === name}
      onChange={() => props.onVersion(name)}
      disabled={props.busy}
    />
  )
  return (
    <form
      className="run-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit(chosen, props.busy)) props.onSubmit()
      }}
    >
      <div className="grid">
        <div className="card" role="radiogroup" aria-labelledby="version-title">
          <div className="card-head">
            <h2 id="version-title">Partner version</h2>
            <span className="demo-chip">Demo</span>
          </div>
          <p className="note">
            A sample points API built into this site, not your system.{' '}
            <span className="mono">correct</span> follows the spec; each other version has one bug
            planted in it, to show what the cases catch.
          </p>
          {props.versions.includes('correct') ? (
            <label className="vopt vcorrect">
              {radio('correct')}
              <span>
                <span className="mono">correct</span>
                <small>Follows the spec. Everything should pass.</small>
              </span>
            </label>
          ) : null}
          <p className="note vlabel">{PLANTED}</p>
          <div className="vgrid">
            {others.map((name) => (
              <label className="vopt" key={name}>
                {radio(name)}
                <span className="mono">{name}</span>
              </label>
            ))}
          </div>
        </div>

        {props.aside ?? (
          <div className="card" role="group" aria-labelledby="cases-title">
            <div className="cases-head">
              <h2 id="cases-title">Cases</h2>
              <div className="pick-tools">
                <button
                  type="button"
                  onClick={props.onAll}
                  disabled={props.busy || chosen === total}
                >
                  All
                </button>
                <button type="button" onClick={props.onNone} disabled={props.busy || chosen === 0}>
                  None
                </button>
                <span className="mono note">
                  {chosen} of {total} chosen
                </span>
              </div>
            </div>
            {props.groups.map((group) => {
              const ids = group.cases.map((c) => c.id)
              const state = groupState(props.selected, ids)
              const isOpen = open.includes(group.service)
              return (
                <div className="pick-group" key={group.service}>
                  <div className="group-row">
                    <label className="gname">
                      <GroupBox
                        state={state}
                        disabled={props.busy}
                        onChange={() => props.onToggleGroup(group.service, state !== 'all')}
                      />
                      <span className="gtext">
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
                    <div className="pick-list" id={`cases-${group.service}`}>
                      {group.cases.map((c) => (
                        <label className="crow" key={c.id} title={c.id}>
                          <input
                            type="checkbox"
                            checked={props.selected.includes(c.id)}
                            onChange={() => props.onToggleCase(c.id)}
                            disabled={props.busy}
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {chosen === 0 ? <p className="problem">Choose at least one case.</p> : null}
          </div>
        )}
      </div>

      <div className="run-bar">
        <p className="run-summary">
          <span className="long">
            Will run {chosen} {chosen === 1 ? 'case' : 'cases'} against{' '}
          </span>
          <span className="mono">{props.version}</span>
        </p>
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
