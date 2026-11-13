import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PdfList } from '../data/pdf-vocabulary'
import { EmptyState } from './ui'

export function PdfPracticeLink({ list }: { list?: PdfList }) {
  return <Link className="text-button" to={list ? `/pdf-vocabulary?list=${list.number}` : '/pdf-vocabulary'}>
    <ArrowLeft size={17} />{list ? `回到 PDF List ${list.number}` : '回到 PDF 單字'}
  </Link>
}

export function MissingPdfList() {
  return <EmptyState title="這組 PDF 單字無法練習" description="請回到 PDF 單字區，選擇有詞條的 List。" action={<PdfPracticeLink />} />
}
