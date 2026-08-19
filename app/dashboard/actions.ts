'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function logout() {
  const supabase = await createClient()

  await supabase.auth.signOut()

  redirect('/login')
}

export type AddWebsiteState = { error?: string } | null

export async function addWebsite(
  _prevState: AddWebsiteState,
  formData: FormData
): Promise<AddWebsiteState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be logged in to add a website.' }
  }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const rawUrl = (formData.get('url') as string | null)?.trim() ?? ''

  if (!name) {
    return { error: 'Website name is required.' }
  }

  if (!rawUrl) {
    return { error: 'Website URL is required.' }
  }

  let normalizedUrl: string
  try {
    const parsed = new URL(rawUrl)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Website URL must start with http:// or https://.' }
    }

    normalizedUrl = parsed.toString()
  } catch {
    return { error: 'Enter a valid URL, e.g. https://example.com.' }
  }

  const { error } = await supabase.from('websites').insert({
    user_id: user.id,
    name,
    url: normalizedUrl,
  })

  if (error) {
    return { error: 'Could not save the website. Please try again.' }
  }

  revalidatePath('/dashboard')
  return {}
}