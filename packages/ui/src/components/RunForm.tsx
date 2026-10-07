import { canSubmit } from '../run-form'

interface Props {
  versions: string[]
  version: string
  onVersion: (version: string) => void
  services: string[]
  allServices: string[]
  onToggleService: (service: string) => void
  caseCount: number
  onSubmit: () => void
  /** Why the form cannot be submitted right now, if it cannot. */
  busy: boolean
  problem: string | null
}

export function RunForm(props: Props) {
  const nothingChosen = props.services.length === 0
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit(props.services, props.busy)) props.onSubmit()
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
        <legend>Services</legend>
        <div className="chips">
          {props.allServices.map((service) => (
            <label className="chip" key={service}>
              <input
                type="checkbox"
                checked={props.services.includes(service)}
                onChange={() => props.onToggleService(service)}
                disabled={props.busy}
              />
              {service}
            </label>
          ))}
        </div>
        {nothingChosen ? <p className="problem">Choose at least one service.</p> : null}
      </fieldset>

      <button type="submit" className="primary" disabled={!canSubmit(props.services, props.busy)}>
        {props.busy
          ? 'Running…'
          : `Run ${props.caseCount} ${props.caseCount === 1 ? 'case' : 'cases'}`}
      </button>
      {props.problem ? (
        <p role="alert" className="problem">
          {props.problem}
        </p>
      ) : null}
    </form>
  )
}
