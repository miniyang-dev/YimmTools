import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
  type UIEvent,
} from 'react'

/** Must match `.code-area` line-height in app.css: markers and scrolling are positioned by it. */
export const CODE_LINE_PX = 22
/** Above this many lines soft-wrapped numbering stops measuring each line (it would cost too much). */
const MAX_MEASURED_LINES = 3000

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'wrap'> & {
  value: string
  /** 1-based line to mark (e.g. where a parse error is) */
  markLine?: number
  /**
   * Soft-wrap long lines (prose, tokens). Each number then sits next to the first row of its line,
   * which needs every line measured; without wrap, lines never wrap and numbering is pure arithmetic.
   */
  wrap?: boolean
}

/**
 * A textarea with a line-number gutter that follows the textarea's vertical scroll.
 * Without `wrap` the numbers are one text node, so a 100 000-line paste costs the same as a short one.
 */
export const CodeArea = forwardRef<HTMLTextAreaElement, Props>(function CodeArea(
  { value, markLine, wrap = false, onScroll, className, ...rest },
  ref,
) {
  const gutter = useRef<HTMLDivElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const lines = value.split('\n')
  const lineCount = Math.max(1, lines.length)
  const measure = wrap && lineCount <= MAX_MEASURED_LINES
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<number[] | null>(null)

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textarea.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  // the wrap width is the textarea's content width; follow it when the layout or the scrollbar changes
  useLayoutEffect(() => {
    const el = textarea.current
    if (!measure || !el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    if (!measure || !mirror.current) {
      setHeights(null)
      return
    }
    setHeights(Array.from(mirror.current.children, (row) => (row as HTMLElement).offsetHeight))
  }, [measure, value, width])

  const syncScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
    onScroll?.(e)
  }

  const markTop =
    markLine && markLine <= lineCount
      ? heights
        ? heights.slice(0, markLine - 1).reduce((a, b) => a + b, 0)
        : (markLine - 1) * CODE_LINE_PX
      : null

  return (
    <div className={`code-area${wrap ? ' wrap' : ''}`}>
      <div
        className="code-gutter"
        ref={gutter}
        aria-hidden="true"
        // width follows the number of digits (the box is size-contained, so it cannot size itself)
        style={{ width: `calc(${Math.max(2, String(lineCount).length)}ch + 18px)` }}
      >
        {markTop !== null ? (
          <span
            className="code-mark"
            style={{
              top: `calc(var(--code-pad) + ${markTop}px)`,
              height: heights?.[markLine! - 1] ?? CODE_LINE_PX,
            }}
          />
        ) : null}
        {heights ? (
          <div className="code-numbers">
            {heights.map((h, i) => (
              <div key={i} style={{ height: h }}>
                {i + 1}
              </div>
            ))}
          </div>
        ) : (
          <pre className="code-numbers">{Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}</pre>
        )}
      </div>
      <textarea
        {...rest}
        ref={setRefs}
        value={value}
        wrap={wrap ? 'soft' : 'off'}
        spellCheck={false}
        className={className}
        onScroll={syncScroll}
      />
      {measure ? (
        <div className="code-mirror" ref={mirror} aria-hidden="true" style={{ width }}>
          {lines.map((line, i) => (
            <div key={i}>{line || '​'}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
})

/** Put the caret at `offset` (on 1-based `line`) and scroll it into the middle of the box. */
export function focusAt(el: HTMLTextAreaElement, offset: number, line: number): void {
  el.focus()
  el.setSelectionRange(offset, offset)
  el.scrollTop = Math.max(0, (line - 1) * CODE_LINE_PX - el.clientHeight / 2)
}
