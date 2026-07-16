import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ArrowRight, Sparkles, Clock, Target } from 'lucide-react';
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

/** Lists active companies; picking one moves on to choosing which exam type to take. */
const CompanySelect = ({ onCompanySelected, onBack }: CompanySelectProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ companies: Company[] }>('/api/companies')
      .then(({ companies }) => setCompanies(companies))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load companies.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden flex items-center justify-center p-4 sm:p-8">
      {/* Background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-5xl relative z-10 py-12">
        
        {/* Header Section */}
        <div className="text-center mb-16 space-y-4">
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
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-8">
            {companies.map((company, idx) => {
              const totalDuration = company.technicalDurationMin + company.personalDurationMin + company.hrDurationMin;
              
              return (
                <div 
                  key={company.id} 
                  className="group relative"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  {/* Hover gradient border effect */}
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm" />
                  
                  <Card className="relative h-full bg-slate-900/80 backdrop-blur-xl border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 flex flex-col">
                    <CardHeader className="p-6 md:p-8 pb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-blue-500/20">
                          <Building2 className="w-7 h-7 text-blue-400" />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                           <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                             <Target className="w-3 h-3 mr-1 text-emerald-400" />
                             {company.passThresholdPct}% Pass
                           </span>
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-bold text-white mb-2">{company.name}</CardTitle>
                      <CardDescription className="text-slate-400 flex items-center gap-4">
                         <span className="flex items-center">
                           <Clock className="w-4 h-4 mr-1.5 text-slate-500" />
                           {totalDuration} min total duration
                         </span>
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="p-6 md:p-8 pt-0 mt-auto">
                      <Button
                        onClick={() => onCompanySelected(company)}
                        className="w-full h-12 text-md font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] rounded-xl mt-4"
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
