import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, ArrowRight, Sparkles, Clock, Target, Search, Code, Video, MessageSquare, SearchX } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { apiGet } from '@/lib/api';

export interface Company {
  id: string;
  name: string;
  slug: string;
  passThresholdPct: number;
  technicalDurationMin: number;
  personalDurationMin: number;
  hrDurationMin: number;
}

interface CompanySelectProps {
  onCompanySelected: (company: Company) => void;
  onBack: () => void;
}

const PHASES = [
  { key: 'technicalDurationMin', label: 'Technical', icon: Code },
  { key: 'personalDurationMin', label: 'Interview', icon: Video },
  { key: 'hrDurationMin', label: 'HR', icon: MessageSquare },
] as const;

/** Lists active companies; picking one moves on to choosing which exam type to take. */
const CompanySelect = ({ onCompanySelected, onBack }: CompanySelectProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet<{ companies: Company[] }>('/api/companies')
      .then(({ companies }) => setCompanies(companies))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load companies.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) => company.name.toLowerCase().includes(term));
  }, [companies, search]);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header - matches the main site header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/brain-logo.png" alt="Recruitix Brain Logo" className="w-10 h-10 object-contain" />
            <div>
              <span className="text-xl font-bold text-black dark:text-white">Recruitix</span>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">AI-Powered</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto px-6 py-16 max-w-5xl">
        {/* Header Section */}
        <div className="text-center mb-10 space-y-4">
          <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Assessment Portal
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-black dark:text-white tracking-tight">
            Choose Your Exam
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Select a company to begin your tailored assessment. Each exam is specifically designed to evaluate your readiness for that organization.
          </p>
        </div>

        {!loading && companies.length > 0 && (
          <div className="relative max-w-md mx-auto mb-12">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 focus:border-gray-300 dark:focus:border-gray-700 transition-all"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-8 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-800 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">Loading available companies...</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <SearchX className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium">No companies match "{search}"</p>
            <Button variant="ghost" onClick={() => setSearch('')} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
              Clear search
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {filteredCompanies.map((company) => (
              <Card
                key={company.id}
                className="group h-full border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden flex flex-col"
              >
                <CardHeader className="p-6 md:p-8 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Building2 className="w-7 h-7 text-white dark:text-black" />
                    </div>
                    <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">
                      <Target className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                      {company.passThresholdPct}% Pass
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-bold text-black dark:text-white mb-2">{company.name}</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {company.technicalDurationMin + company.personalDurationMin + company.hrDurationMin} min total duration
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-6 md:p-8 pt-0 mt-auto space-y-5">
                  {/* Per-phase breakdown */}
                  <div className="grid grid-cols-3 gap-2">
                    {PHASES.map(({ key, label, icon: PhaseIcon }) => (
                      <div
                        key={key}
                        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                      >
                        <PhaseIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-xs font-semibold text-black dark:text-white">{company[key]}m</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => onCompanySelected(company)}
                    className="w-full h-12 text-md font-semibold bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 rounded-xl transition-all duration-300"
                  >
                    Begin Assessment
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <Button
            onClick={onBack}
            variant="ghost"
            className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl px-8 h-12 transition-colors"
          >
            ← Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompanySelect;
