import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../auth/supabaseClient'

export function useUnmatched() {
  const unmatchedQuery = useQuery({
    queryKey: ['kobo-unmatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kobo_unmatched')
        .select('id, instance_id, field, raw_value, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5, // Fetches data every 5 minutes
  })

  const practitionersQuery = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, ecdc_list(name)')
        .is('deleted_at', null)
        .order('name')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  return {
    unmatched: unmatchedQuery.data ?? [],
    practitioners: practitionersQuery.data ?? [],
    loading: unmatchedQuery.isLoading || practitionersQuery.isLoading,
    error: unmatchedQuery.error || practitionersQuery.error,
    refetch: () => {
      unmatchedQuery.refetch()
      practitionersQuery.refetch()
    }
  }
}