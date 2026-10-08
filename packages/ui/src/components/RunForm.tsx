import { canSubmit, groupState, type Group } from '../run-form'

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
}

export function RunForm(props: Props) {
  const chosen = props.selected.length
  const total = props.groups.reduce((n, g) => n + g.cases.length, 0)
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
        <p className="note">
          Every version but <span className="mono">correct</span> is wrong in one way. The result
          says how.
        </p>
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
          return (
            <fieldset className="pick-group" key={group.service}>
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
