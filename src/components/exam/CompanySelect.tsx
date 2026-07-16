import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ArrowRight, Sparkles, Clock, Target, Search, Code, Video, MessageSquare, SearchX } from 'lucide-react';
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

/** Cycled per card so companies read as visually distinct, not identical blue tiles. */
const ACCENTS = [
  { border: 'from-blue-500 to-indigo-500', iconBg: 'from-blue-500/20 to-indigo-500/20', iconBorder: 'border-blue-500/20', text: 'text-blue-400', shadow: 'hover:shadow-blue-500/10' },
  { border: 'from-violet-500 to-fuchsia-500', iconBg: 'from-violet-500/20 to-fuchsia-500/20', iconBorder: 'border-violet-500/20', text: 'text-violet-400', shadow: 'hover:shadow-violet-500/10' },
  { border: 'from-emerald-500 to-teal-500', iconBg: 'from-emerald-500/20 to-teal-500/20', iconBorder: 'border-emerald-500/20', text: 'text-emerald-400', shadow: 'hover:shadow-emerald-500/10' },
  { border: 'from-amber-500 to-orange-500', iconBg: 'from-amber-500/20 to-orange-500/20', iconBorder: 'border-amber-500/20', text: 'text-amber-400', shadow: 'hover:shadow-amber-500/10' },
  { border: 'from-rose-500 to-pink-500', iconBg: 'from-rose-500/20 to-pink-500/20', iconBorder: 'border-rose-500/20', text: 'text-rose-400', shadow: 'hover:shadow-rose-500/10' },
  { border: 'from-cyan-500 to-sky-500', iconBg: 'from-cyan-500/20 to-sky-500/20', iconBorder: 'border-cyan-500/20', text: 'text-cyan-400', shadow: 'hover:shadow-cyan-500/10' },
];

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
    <div className="min-h-screen bg-[#030712] relative overflow-hidden flex items-center justify-center p-4 sm:p-8">
      {/* Background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-5xl relative z-10 py-12">

        {/* Header Section */}
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center justify-center p-2 mb-4 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Sparkles className="w-5 h-5 mr-2" />
            <span className="text-sm font-medium tracking-wider uppercase">Assessment Portal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight">
            Choose Your Exam
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Select a company to begin your tailored assessment. Each exam is specifically designed to evaluate your readiness for that organization.
          </p>
        </div>

        {!loading && companies.length > 0 && (
          <div className="relative max-w-md mx-auto mb-12">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-slate-900/80 border border-slate-800 text-white placeholder-slate-500 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-8 text-center backdrop-blur-sm">
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-400 font-medium animate-pulse">Loading available companies...</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
              <SearchX className="w-7 h-7 text-slate-500" />
            </div>
            <p className="text-slate-300 font-medium">No companies match "{search}"</p>
            <Button variant="ghost" onClick={() => setSearch('')} className="text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl">
              Clear search
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-8">
            {filteredCompanies.map((company, idx) => {
              const accent = ACCENTS[idx % ACCENTS.length];

              return (
                <div
                  key={company.id}
                  className="group relative animate-fade-in-up"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {/* Hover gradient border effect */}
                  <div className={`absolute -inset-0.5 bg-gradient-to-r ${accent.border} rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm`} />

                  <Card className={`relative h-full bg-slate-900/80 backdrop-blur-xl border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl ${accent.shadow} flex flex-col`}>
                    <CardHeader className="p-6 md:p-8 pb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${accent.iconBg} flex items-center justify-center border ${accent.iconBorder}`}>
                          <Building2 className={`w-7 h-7 ${accent.text}`} />
                        </div>
                        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          <Target className="w-3 h-3 mr-1 text-emerald-400" />
                          {company.passThresholdPct}% Pass
                        </span>
                      </div>
                      <CardTitle className="text-2xl font-bold text-white mb-2">{company.name}</CardTitle>
                      <CardDescription className="text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-slate-500" />
                        {company.technicalDurationMin + company.personalDurationMin + company.hrDurationMin} min total duration
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-6 md:p-8 pt-0 mt-auto space-y-5">
                      {/* Per-phase breakdown */}
                      <div className="grid grid-cols-3 gap-2">
                        {PHASES.map(({ key, label, icon: PhaseIcon }) => (
                          <div
                            key={key}
                            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50"
                          >
                            <PhaseIcon className={`w-4 h-4 ${accent.text}`} />
                            <span className="text-xs font-semibold text-slate-200">{company[key]}m</span>
                            <span className="text-[10px] text-slate-500">{label}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => onCompanySelected(company)}
                        className="w-full h-12 text-md font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] rounded-xl"
                      >
                        Begin Assessment
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <Button
            onClick={onBack}
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl px-8 h-12 transition-colors"
          >
            ← Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompanySelect;
