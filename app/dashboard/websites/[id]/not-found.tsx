import Link from 'next/link'
import { Globe2 } from 'lucide-react'
import Container from '@/components/ui/container'
import EmptyState from '@/components/ui/empty-state'
import { buttonStyles } from '@/components/ui/button'

/**
 * Rendered whenever notFound() is called anywhere under this website's
 * routes (Overview, Integrations, Activity) — including a website that
 * doesn't exist and one that belongs to a different account. The wording is
 * deliberately identical for both cases, matching the ownership-check
 * convention already used throughout the product: never confirm or deny
 * that a specific resource exists for someone else's account.
 */
export default function WebsiteNotFound() {
  return (
    <Container size="md" className="py-10">
      <EmptyState
        icon={Globe2}
        title="Website not found"
        description="The website may have been removed or isn't available to this account."
        action={
          <Link href="/dashboard" className={buttonStyles({ variant: 'primary' })}>
            Back to Dashboard
          </Link>
        }
      />
    </Container>
  )
}
