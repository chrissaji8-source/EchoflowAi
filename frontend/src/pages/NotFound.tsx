import { ArrowUpRight } from 'lucide-react'
import { PageHero } from '../components/bits'
import { TLink } from '../components/Nav'

export default function NotFound() {
  return (
    <PageHero
      reel="Error"
      name="No signal"
      num="404"
      title={
        <>
          That page <em>isn’t on the line.</em>
        </>
      }
      lead="The address may be mistyped, or the page may have moved. Nothing is wrong, and nothing needs your attention."
      actions={
        <TLink to="/" className="btn btn--solid">
          Back to the start <ArrowUpRight size={17} aria-hidden="true" />
        </TLink>
      }
    />
  )
}
