import type { JsonLine } from '../result-model'

/**
 * JSON laid out a line at a time. The lines that disagreed are marked, a
 * matcher is shown as its description and not as data, and every character is
 * text: what a partner answered is never put into the page as markup.
 */
export function JsonBlock({ lines }: { lines: JsonLine[] }) {
  return (
    <pre className="json">
      {lines.map((l, i) => (
        <span className={l.marked ? 'ln bad' : 'ln'} key={i}>
          {l.head}
          {l.matcher ? <span className="matcher">{l.value}</span> : l.value}
          {l.tail}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
