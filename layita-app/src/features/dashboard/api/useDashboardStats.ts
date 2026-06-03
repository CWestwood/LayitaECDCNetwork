import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface DashboardStats {
  totalPractitioners: number;
  totalEcdcs: number;
  visitsThisYear: {
    total: number;
    byType: Record<string, number>;
    didNotHappen: number;
    mappingVisits: number;
  };
  recentVisits: Array<{
    id: string;
    date: string;
    outreach_type: string;
    practitioner: { 
      name: string;
      ecdc: { name: string } | null;
    } | null;
  }>;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1).toISOString();

      const [
        practitionersRes,
        ecdcsRes,
        visitsYearRes,
        recentVisitsRes
      ] = await Promise.all([
        supabase
          .from('practitioners')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null),
          
        supabase
          .from('ecdc_list')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null),

        supabase
          .from('outreach_visits')
          .select('outreach_type, outreach_happened')
          .is('deleted_at', null)
          .gte('date', startOfYear),

        supabase
          .from('outreach_visits')
          .select(`
            id, 
            date, 
            outreach_type, 
            practitioner:practitioners(name, ecdc:ecdc_id(name))
          `)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .limit(5)
      ]);

      if (practitionersRes.error) throw practitionersRes.error;
      if (ecdcsRes.error) throw ecdcsRes.error;
      if (visitsYearRes.error) throw visitsYearRes.error;
      if (recentVisitsRes.error) throw recentVisitsRes.error;

      const visits = visitsYearRes.data || [];
      const byType: Record<string, number> = {};
      let didNotHappen = 0;
      let mappingVisits = 0;

      visits.forEach(v => {
        const type = v.outreach_type || 'Unknown';
        byType[type] = (byType[type] || 0) + 1;

        if (v.outreach_happened !== 'Yes') {
          didNotHappen++;
        }
        
        if (type.toLowerCase().includes('map')) {
          mappingVisits++;
        }
      });

      // If 'map' isn't explicitly the type, fallback to checking ecdcs created this year
      if (mappingVisits === 0) {
        const ecdcsYearRes = await supabase
          .from('ecdc_list')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .gte('created_at', startOfYear);
        
        mappingVisits = ecdcsYearRes.count || 0;
      }

      return {
        totalPractitioners: practitionersRes.count || 0,
        totalEcdcs: ecdcsRes.count || 0,
        visitsThisYear: {
          total: visits.length,
          byType,
          didNotHappen,
          mappingVisits
        },
        recentVisits: (recentVisitsRes.data as any) || []
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
