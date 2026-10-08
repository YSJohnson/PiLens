import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]
const COMPONENTS: Components = {
  table: ({ node, children, ...props }) => {
    const head = node?.children.find((child) => child.type === 'element' && child.tagName === 'thead')
    const row = head?.type === 'element' ? head.children.find((child) => child.type === 'element' && child.tagName === 'tr') : undefined
    const columns = row?.type === 'element' ? row.children.filter((child) => child.type === 'element').length : 1
    return (
      <div className="markdown-table-scroll" role="region" aria-label="表格（可横向滚动）" tabIndex={0}>
        <table {...props} style={{ minWidth: `${columns * 8}rem` }}>{children}</table>
      </div>
    )
  },
}

interface MarkdownContentProps {
  content: string
}

export default memo(function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>{content}</ReactMarkdown>
    </div>
  )
})
