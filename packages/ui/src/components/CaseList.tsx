import type { CaseInfo } from '../api'
import type { Group } from '../result-model'
import { Status } from './Status'

interface Props {
  groups: Group[]
  cases: Map<string, CaseInfo>
  selected: string | undefined
  /** The address of a case's page, so a link opens in a new tab as well as in place. */
  hrefFor: (caseId: string) => string
  onSelect: (caseId: string) => void
}

export function CaseList({ groups, cases, selected, hrefFor, onSelect }: Props) {
  return (
    <nav className="card list" aria-label="Cases">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="grp">{group.title}</div>
          {group.items.map((item) => (
            <a
              key={item.caseId}
              className="it"
              href={hrefFor(item.caseId)}
              aria-current={item.caseId === selected ? 'true' : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                event.preventDefault()
                onSelect(item.caseId)
              }}
            >
              <span className="nm">
                {cases.get(item.caseId)?.name ?? item.caseId}
                <small className="mono">{item.caseId}</small>
              </span>
              <Status status={item.status} />
            </a>
          ))}
        </div>
      ))}
    </nav>
  )
}
