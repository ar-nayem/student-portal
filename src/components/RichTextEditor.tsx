'use client'

import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, Heading2, List, Link2, Minus, MousePointerClick, Undo2, Redo2 } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

// Deliberately dependency-free: a WYSIWYG package would have to load from a
// CDN or add weight to the bundle, and this app's users are behind the GFW
// where CDNs are unreliable. document.execCommand is formally deprecated but
// still works in every current browser, and this is an internal admin
// composer rather than a public editor.
export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Only write into the DOM when the incoming value genuinely differs from
  // what's rendered. Assigning innerHTML on every keystroke would reset the
  // caret to the start of the box on each character typed.
  useEffect(() => {
    const el = ref.current
    if (el && value !== el.innerHTML) el.innerHTML = value
  }, [value])

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  // Inserts raw HTML at the caret. Used for anything execCommand can't build
  // — buttons, rules, merge tokens — so they land where the cursor is rather
  // than being appended to the end of the message.
  function insertHtml(html: string) {
    ref.current?.focus()
    document.execCommand('insertHTML', false, html)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  // The merge-token buttons live outside this component (next to the send
  // controls), so they hand the token over by event rather than by prop —
  // that keeps the caret position, which a re-render would lose.
  useEffect(() => {
    function onInsertToken(e: Event) {
      const token = (e as CustomEvent<string>).detail
      if (!token || !ref.current) return
      insertHtml(token)
    }
    document.addEventListener('campaign-insert-token', onInsertToken)
    return () => document.removeEventListener('campaign-insert-token', onInsertToken)
  }, [onChange])

  function addLink() {
    const url = prompt('Link address', 'https://portal.edvuno.top')
    if (!url) return
    exec('createLink', url)
  }

  function addButton() {
    const label = prompt('Button text', 'Sign up free')
    if (!label) return
    const url = prompt('Button link', 'https://portal.edvuno.top/signup')
    if (!url) return
    // Table-wrapped so it survives Outlook, which ignores padding on inline
    // anchors and would otherwise render this as a bare link.
    insertHtml(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;"><tr><td bgcolor="#4f46e5" style="border-radius:10px;"><a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a></td></tr></table><p></p>`
    )
  }

  const tools = [
    { icon: Bold, title: 'Bold', run: () => exec('bold') },
    { icon: Italic, title: 'Italic', run: () => exec('italic') },
    { icon: Underline, title: 'Underline', run: () => exec('underline') },
    { icon: Heading2, title: 'Heading', run: () => exec('formatBlock', '<h2>') },
    { icon: List, title: 'Bullet list', run: () => exec('insertUnorderedList') },
    { icon: Link2, title: 'Insert link', run: addLink },
    { icon: MousePointerClick, title: 'Insert button', run: addButton },
    { icon: Minus, title: 'Divider', run: () => insertHtml('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />') },
    { icon: Undo2, title: 'Undo', run: () => exec('undo') },
    { icon: Redo2, title: 'Redo', run: () => exec('redo') },
  ]

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background focus-within:ring-2 focus-within:ring-indigo-500">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/40">
        {tools.map((tool) => (
          <button
            key={tool.title}
            type="button"
            title={tool.title}
            onMouseDown={(e) => e.preventDefault()} // keep the caret while clicking
            onClick={tool.run}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <tool.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        // Strip formatting from pasted text: pasting from Word or a browser
        // drags in class names and stylesheets that email clients mangle.
        onPaste={(e) => {
          e.preventDefault()
          insertHtml(e.clipboardData.getData('text/plain').replace(/\n/g, '<br>'))
        }}
        className="min-h-[240px] max-h-[420px] overflow-auto px-3.5 py-3 text-sm outline-none
                   [&_h2]:text-lg [&_h2]:font-bold [&_h2]:my-2
                   [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-2
                   [&_a]:text-indigo-600 [&_a]:underline
                   empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      />
    </div>
  )
}
