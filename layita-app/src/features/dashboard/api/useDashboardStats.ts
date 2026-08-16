import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../auth/supabaseClient';

export interface DashboardStats {
  totalPractitioners: number;
  totalEcdcs: number;
  selectedYear: number;
  visitsForYear: {
    total: number;
    byType: Record<string, number>;
    didNotHappen: number;
    mappingVisits: number;
    byStaff: Record<string, { total: number; byType: Record<string, number> }>;
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

export function useDashboardStats(year = new Date().getFullYear()) {
  return useQuery({
    queryKey: ['dashboard_stats', year],
    queryFn: async (): Promise<DashboardStats> => {
      const startOfYear = `${year}-01-01`;
      const startOfNextYear = `${year + 1}-01-01`;

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
          .select('outreach_type, outreach_happened, data_capturer:layita_staff(name)')
          .is('deleted_at', null)
          .gte('date', startOfYear)
          .lt('date', startOfNextYear),

        supabase
          .from('outreach_visits')
          .select(`
            id, 
            date, 
            outreach_type, 
            practitioner:practitioners!outreach_visits_practitioner_id_fkey(name, ecdc:ecdc_id(name))
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
      const byStaff: Record<string, { total: number; byType: Record<string, number> }> = {};
      let didNotHappen = 0;
      let mappingVisits = 0;

      visits.forEach(v => {
        const type = v.outreach_type || 'Unknown';
        const staffName = v.data_capturer?.name || 'Unknown Staff';
        byType[type] = (byType[type] || 0) + 1;

        if (!byStaff[staffName]) {
          byStaff[staffName] = { total: 0, byType: {} };
        }
        byStaff[staffName].total += 1;
        byStaff[staffName].byType[type] = (byStaff[staffName].byType[type] || 0) + 1;

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
          .gte('created_at', startOfYear)
          .lt('created_at', startOfNextYear);
        
        mappingVisits = ecdcsYearRes.count || 0;
      }

      return {
        totalPractitioners: practitionersRes.count || 0,
        totalEcdcs: ecdcsRes.count || 0,
        selectedYear: year,
        visitsForYear: {
          total: visits.length,
          byType,
          didNotHappen,
          mappingVisits,
          byStaff
        },
        recentVisits: (recentVisitsRes.data ?? []).flatMap((visit) => {
          if (!visit.date || !visit.outreach_type) return [];
          return [{
            ...visit,
            date: visit.date,
            outreach_type: visit.outreach_type,
            practitioner: visit.practitioner
              ? {
                  name: visit.practitioner.name ?? 'Unnamed practitioner',
                  ecdc: visit.practitioner.ecdc?.name
                    ? { name: visit.practitioner.ecdc.name }
                    : null,
                }
              : null,
          }];
        })
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
