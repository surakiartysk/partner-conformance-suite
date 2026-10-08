import type { CaseInfo, CaseResult } from '../api'
import { splitSteps, whatDidNotMatch } from '../result-model'
import { Status } from './Status'
import { StepView } from './StepView'

interface Props {
  info: CaseInfo | undefined
  caseId: string
  lane: string
  result: CaseResult | undefined
}

/** One case: what it is about, what did not match, then its steps in the order they ran. */
export function CaseDetail({ info, caseId, lane, result }: Props) {
  const laneName = lane === 'read' ? 'Read-only' : `Member ${lane}`
  if (!result) {
    return (
      <article className="card" aria-labelledby="case">
        <div className="mono note">
          {caseId} · {laneName}
        </div>
        <h2 id="case">{info?.name ?? caseId}</h2>
        <p className="note">This case has not run.</p>
      </article>
    )
  }
  const { setup, judged } = splitSteps(result)
  const problems = whatDidNotMatch(result)
  return (
    <article className="card" aria-labelledby="case">
      <div className="mono note">
        {caseId} · {laneName}
      </div>
      <h2 id="case">{info?.name ?? caseId}</h2>
      {info?.description ? <p className="note">{info.description}</p> : null}

      {result.status === 'passed' ? (
        <div className="callout ok" role="note">
          <p>
            <Status status="passed" /> <b>Everything this case checks matched.</b> Fields in an
            answer that the case does not name are not checked.
          </p>
        </div>
      ) : (
        <div className="callout bad" role="note">
          <p>
            <b>What didn&apos;t match</b>
          </p>
          {problems.length > 0 ? (
            <ul>
              {problems.map((sentence, i) => (
                <li key={i}>{sentence}</li>
              ))}
            </ul>
          ) : (
            <p>The case ended as {result.status}, and nothing more is recorded.</p>
          )}
        </div>
      )}

      {setup.length > 0 ? (
        <details className="setup">
          <summary>
            Setup · {setup.length} {setup.length === 1 ? 'step' : 'steps'}, only checked that the
            partner answers
          </summary>
          {setup.map((step, i) => (
            <StepView step={step} key={i} />
          ))}
        </details>
      ) : null}
      {judged.map((step, i) => (
        <StepView step={step} key={i} />
      ))}
    </article>
  )
}
