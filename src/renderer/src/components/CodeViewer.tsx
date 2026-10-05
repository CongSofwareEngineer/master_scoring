// Code editor read-only (CodeMirror 6): syntax highlight, số dòng, code folding, tìm kiếm (Ctrl+F),
// tô dòng có issue, vùng nghi do AI viết, nhảy tới dòng.
import { useEffect, useRef } from 'react'
import { defaultKeymap } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, StreamLanguage, syntaxHighlighting, indentOnInput } from '@codemirror/language'
import { kotlin } from '@codemirror/legacy-modes/mode/clike'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export interface LineMark {
  line: number
  kind: 'error' | 'warning' | 'info' | 'match' | 'evidence' | 'ai'
}

function languageFor(path: string): Extension {
  const p = path.toLowerCase()
  if (p.endsWith('.java')) return java()
  if (p.endsWith('.kt') || p.endsWith('.kts') || p.endsWith('.gradle')) return StreamLanguage.define(kotlin)
  if (/\.(c|h|cpp|cc|cxx|hpp|hh)$/.test(p)) return cpp()
  if (/\.(tsx)$/.test(p)) return javascript({ jsx: true, typescript: true })
  if (/\.(ts|mts|cts)$/.test(p)) return javascript({ typescript: true })
  if (/\.(jsx)$/.test(p)) return javascript({ jsx: true })
  if (/\.(js|mjs|cjs)$/.test(p)) return javascript()
  if (/\.(css|scss)$/.test(p)) return css()
  if (/\.json$/.test(p)) return json()
  if (/\.(xml|html|svg)$/.test(p)) return xml()
  return []
}

const theme = EditorView.theme(
  {
    '&': { backgroundColor: '#0B0F14', color: '#E2E8F0', fontSize: '13px', height: '100%' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace", lineHeight: '1.55' },
    '.cm-content': { caretColor: '#6366F1', padding: '6px 0' },
    '.cm-gutters': { backgroundColor: '#0B0F14', color: '#475569', border: 'none', borderRight: '1px solid #1C2430' },
    '.cm-activeLineGutter': { backgroundColor: '#111827', color: '#94A3B8' },
    '.cm-activeLine': { backgroundColor: 'rgba(28,36,48,0.55)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(99,102,241,0.35) !important' },
    '.cm-foldPlaceholder': { backgroundColor: '#1C2430', border: '1px solid #273244', color: '#94A3B8' },
    '.cm-panels': { backgroundColor: '#111827', color: '#F8FAFC', borderBottom: '1px solid #273244' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'inherit' },
    '.cm-textfield': { backgroundColor: '#1C2430', border: '1px solid #273244', borderRadius: '4px', color: '#F8FAFC' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: '#1C2430', border: '1px solid #273244', borderRadius: '4px', color: '#F8FAFC' },
    '.cm-searchMatch': { backgroundColor: 'rgba(245,158,11,0.25)', outline: '1px solid rgba(245,158,11,0.5)' },
    '.cm-searchMatch-selected': { backgroundColor: 'rgba(99,102,241,0.45)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(148,163,184,0.15)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(99,102,241,0.25)', outline: 'none' },
    '.cm-foldGutter span': { color: '#475569' }
  },
  { dark: true }
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: '#C084FC' },
  { tag: [t.typeName, t.className, t.namespace], color: '#67E8F9' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#93C5FD' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#86EFAC' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#FDBA74' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#64748B', fontStyle: 'italic' },
  { tag: [t.tagName], color: '#F472B6' },
  { tag: [t.attributeName], color: '#FCD34D' },
  { tag: [t.propertyName], color: '#BAE6FD' },
  { tag: [t.definition(t.variableName)], color: '#E2E8F0' },
  { tag: [t.meta, t.processingInstruction], color: '#A5B4FC' },
  { tag: [t.operator, t.punctuation], color: '#94A3B8' },
  { tag: t.invalid, color: '#EF4444' }
])

const setMarks = StateEffect.define<LineMark[]>()
const flashLine = StateEffect.define<number>()

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        const b = new RangeSetBuilder<Decoration>()
        const byLine = new Map<number, LineMark['kind']>()
        const prio = { error: 5, warning: 4, match: 3, info: 2, evidence: 1, ai: 0 }
        for (const m of e.value) {
          const prev = byLine.get(m.line)
          if (!prev || prio[m.kind] > prio[prev]) byLine.set(m.line, m.kind)
        }
        for (const line of [...byLine.keys()].sort((a, b2) => a - b2)) {
          if (line < 1 || line > tr.state.doc.lines) continue
          const pos = tr.state.doc.line(line).from
          b.add(pos, pos, Decoration.line({ class: 'hl-' + byLine.get(line) }))
        }
        value = b.finish()
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f)
})

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashLine)) {
        if (e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none
        const pos = tr.state.doc.line(e.value).from
        value = Decoration.set([Decoration.line({ class: 'hl-jump' }).range(pos)])
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f)
})

export function CodeViewer(props: {
  path: string
  content: string
  marks?: LineMark[]
  jump?: { line: number; nonce: number } | null
  onReady?: (view: EditorView) => void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: props.content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
        EditorState.readOnly.of(true),
        EditorState.tabSize.of(4),
        languageFor(props.path),
        syntaxHighlighting(highlight),
        theme,
        marksField,
        flashField
      ]
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    props.onReady?.(v)
    return () => {
      v.destroy()
      view.current = null
    }
    // Tạo lại editor khi đổi file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, props.content])

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of(props.marks ?? []) })
  }, [props.marks, props.path, props.content])

  useEffect(() => {
    const v = view.current
    if (!v || !props.jump) return
    const line = Math.max(1, Math.min(props.jump.line, v.state.doc.lines))
    const pos = v.state.doc.line(line).from
    v.dispatch({
      selection: { anchor: pos },
      effects: [EditorView.scrollIntoView(pos, { y: 'center' }), flashLine.of(line)]
    })
  }, [props.jump, props.path, props.content])

  return <div className="code-host" ref={host} />
}

export function openSearch(view: EditorView | null): void {
  if (!view) return
  view.focus()
  openSearchPanel(view)
}
