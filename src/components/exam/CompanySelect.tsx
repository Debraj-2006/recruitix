import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Choose Your Exam</h1>
        <p className="text-slate-400 mb-8">Pick the company exam you want to attempt.</p>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3 mb-6">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading companies...</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {companies.map((company) => (
              <Card key={company.id} className="bg-slate-900 border-slate-700 hover:border-blue-500 transition-colors">
                <CardHeader className="flex flex-row items-center gap-3">
                  <Building2 className="w-8 h-8 text-blue-400" />
                  <div>
                    <CardTitle className="text-white">{company.name}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {company.technicalDurationMin + company.personalDurationMin + company.hrDurationMin} min · pass at {company.passThresholdPct}%
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => onCompanySelected(company)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Choose Exam
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button onClick={onBack} variant="outline" className="mt-8 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800">
          Back
        </Button>
      </div>
    </div>
  );
};

export default CompanySelect;
