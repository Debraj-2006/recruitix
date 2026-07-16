import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackgroundGradient } from '@/components/ui/background-gradient';
import { Users, Shield, CheckCircle, ArrowRight, Code, Video, MessageSquare, Star, Quote, Sparkles, Zap, Globe, Lock } from 'lucide-react';
import { FeatureDotCard } from '@/components/ui/feature-dot-card';
import { ThemeToggle } from '@/components/ThemeToggle';
import RecruiterPortal from '@/components/RecruiterPortal';
import AuthGate from '@/components/auth/AuthGate';
import EnrollFace from '@/components/auth/EnrollFace';
import CandidateFlow from '@/components/exam/CandidateFlow';
import { HeroScrollDemo } from '@/components/HeroScrollDemo';
import { TimelineDemo } from '@/components/TimelineDemo';
import { TestimonialsSection } from '@/components/TestimonialsSection';
import { Footer } from '@/components/ui/modem-animated-footer';
import { Twitter, Linkedin, Github, Mail, Brain } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { trackUserLogin } from '@/utils/userActivityTracker';
import { useAuthProfile } from '@/hooks/useAuthProfile';
import { clearToken, getToken } from '@/lib/api';

const Index = () => {
  // Recruiter/admin login is still Firebase-backed pending a later migration phase.
  const [userType, setUserType] = useState<'recruiter' | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState({ id: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Only true once the candidate has explicitly clicked "Start Assessment" (or just
  // signed in) — keeps a stale token in localStorage from skipping the landing page.
  const [candidateSessionActive, setCandidateSessionActive] = useState(false);

  // Candidate identity/session lives in a JWT (localStorage) + the Express API's /auth/me.
  const { profile: candidateProfile, loading: authLoading, refreshProfile } = useAuthProfile();

  const handleStartAssessment = () => {
    if (getToken()) {
      setCandidateSessionActive(true);
    } else {
      setShowAuth(true);
    }
  };

  const handleCandidateAuthenticated = async () => {
    await refreshProfile();
    setCandidateSessionActive(true);
  };

  const handleCandidateLogout = () => {
    clearToken();
    setShowAuth(false);
    setCandidateSessionActive(false);
    refreshProfile();
  };

  const handleAdminLogin = async () => {
    setIsLoading(true);
    setLoginError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, adminCredentials.id, adminCredentials.password);
      const user = userCredential.user;
      setUserType('recruiter');
      setShowAdminLogin(false);
      setAdminCredentials({ id: '', password: '' });
      
      // Track admin login
      trackUserLogin(user.uid, user.email || '', user.displayName || 'Admin', 'recruiter');
    } catch (error: any) {
      const errorMessage = error.code === 'auth/invalid-email' 
        ? 'Invalid email format'
        : error.code === 'auth/user-not-found'
        ? 'User not found'
        : error.code === 'auth/wrong-password'
        ? 'Incorrect password'
        : 'Invalid credentials. Please try again.';
      setLoginError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecruiterAccess = () => {
    setShowAdminLogin(true);
  };

  const handleAdminLogout = () => {
    setUserType(null);
  };

  // Mandatory face-enrollment gate: a signed-in candidate cannot reach any other screen
  // until faceEnrolled is true — no skip path. getToken() (synchronous) gates on whether a
  // JWT exists at all; authLoading covers the async /auth/me round-trip that resolves it.
  if (candidateSessionActive && getToken()) {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center">
          <p className="text-white">Loading your profile...</p>
        </div>
      );
    }
    if (candidateProfile && !candidateProfile.faceEnrolled) {
      return <EnrollFace onEnrolled={refreshProfile} />;
    }
    if (candidateProfile) {
      return <CandidateFlow onBack={handleCandidateLogout} />;
    }
    // Token existed but /auth/me rejected it (expired/invalid) — useAuthProfile already
    // cleared it, so fall through to the marketing/auth screens below.
  }

  if (showAuth) {
    return <AuthGate onBack={() => setShowAuth(false)} onAuthenticated={handleCandidateAuthenticated} />;
  }

  if (userType === 'recruiter') {
    return <RecruiterPortal onBack={handleAdminLogout} />;
  }

  if (showAdminLogin) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gray-400/20 via-transparent to-transparent"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-gray-500/20 via-transparent to-transparent"></div>
        </div>
        
        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-gradient-to-r from-gray-400/20 to-gray-500/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-32 right-16 w-32 h-32 bg-gradient-to-r from-gray-600/20 to-gray-400/20 rounded-full blur-xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-gradient-to-r from-gray-500/20 to-gray-600/20 rounded-full blur-xl animate-pulse delay-500"></div>
        
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            {/* Glassmorphism Card */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-gray-600 to-black rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <Card className="relative backdrop-blur-xl bg-white/10 dark:bg-black/20 border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl">
                <CardHeader className="text-center pb-6">
                  <div className="relative mx-auto mb-6">
                    <div className="w-20 h-20 bg-gradient-to-r from-gray-700 to-black rounded-2xl flex items-center justify-center shadow-2xl shadow-gray-500/25">
                      <Shield className="w-10 h-10 text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-full flex items-center justify-center">
                      <Lock className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    Admin Portal
                  </CardTitle>
                  <CardDescription className="text-gray-300/80 text-lg">
                    Secure access to recruiter dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-8 pb-8">
                  <div className="space-y-4">
                    <div className="relative">
                      <label htmlFor="admin-id" className="block text-sm font-medium text-gray-300 mb-2">
                        Admin ID
                      </label>
                      <input
                        id="admin-id"
                        type="text"
                        value={adminCredentials.id}
                        onChange={(e) => setAdminCredentials(prev => ({ ...prev, id: e.target.value }))}
                        placeholder="Enter admin ID"
                        className="w-full p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all duration-300"
                      />
                    </div>
                    <div className="relative">
                      <label htmlFor="admin-password" className="block text-sm font-medium text-gray-300 mb-2">
                        Password
                      </label>
                      <input
                        id="admin-password"
                        type="password"
                        value={adminCredentials.password}
                        onChange={(e) => setAdminCredentials(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password"
                        className="w-full p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all duration-300"
                      />
                    </div>
                  </div>
                  
                  {loginError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 backdrop-blur-sm">
                      <span className="text-red-300 text-sm">{loginError}</span>
                    </div>
                  )}
                  
                  <div className="flex space-x-3 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowAdminLogin(false)}
                      disabled={isLoading}
                      className="flex-1 bg-white/5 border-white/20 text-white hover:bg-white/10 backdrop-blur-sm rounded-xl h-12"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAdminLogin}
                      disabled={isLoading}
                      className="flex-1 bg-gradient-to-r from-gray-700 to-black hover:from-gray-800 hover:to-gray-900 text-white border-0 rounded-xl h-12 shadow-xl shadow-gray-500/25"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      {isLoading ? 'Authenticating...' : 'Access'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <img 
                  src="/brain-logo.png" 
                  alt="Recruitix Brain Logo" 
                  className="w-10 h-10 object-contain"
                />
              </div>
              <div>
                <span className="text-xl font-bold text-black dark:text-white">
                  Recruitix
                </span>
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">AI-Powered</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">
                <Zap className="w-3 h-3 mr-1" />
                v2.0
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Scroll Animation */}
      <HeroScrollDemo />

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-5xl md:text-7xl font-bold text-black dark:text-white mb-6 leading-tight tracking-tight">
              Smart Hiring with
              <br />
              <span className="bg-gradient-to-r from-gray-800 to-black dark:from-gray-200 dark:to-white bg-clip-text text-transparent font-serif italic">
                AI Intelligence
              </span>
            </h1>
          </div>
          
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-6 font-medium">
            Transform recruitment with intelligent assessments and real-time insights
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-16 max-w-3xl mx-auto leading-relaxed">
            Streamline your hiring process with AI-powered evaluations, live proctoring, 
            and comprehensive candidate analysis designed for modern recruitment needs.
          </p>

          {/* Login Options */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-20">
            {/* Candidate Portal Card */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:-translate-y-1">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-black dark:bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-8 h-8 text-white dark:text-black" />
                </div>
                <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Candidate Portal</h3>
                <p className="text-gray-600 dark:text-gray-400 text-base mb-6">
                  Take your assessment and showcase your skills
                </p>
                
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Assessment Duration</span>
                    <span className="text-black dark:text-white font-semibold">90 minutes</span>
                  </div>
                </div>
                
                <Button 
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 font-semibold py-3 rounded-xl transition-all duration-300"
                  onClick={handleStartAssessment}
                >
                  Start Assessment
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Recruiter Portal Card */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:-translate-y-1">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-black dark:bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Shield className="w-8 h-8 text-white dark:text-black" />
                </div>
                <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Recruiter Dashboard</h3>
                <p className="text-gray-600 dark:text-gray-400 text-base mb-6">
                  Manage assessments and evaluate candidates
                </p>
                
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Security Level</span>
                    <span className="text-black dark:text-white font-semibold">Enterprise</span>
                  </div>
                </div>
                
                <Button 
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 font-semibold py-3 rounded-xl transition-all duration-300"
                  onClick={handleRecruiterAccess}
                >
                  Access Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center bg-gray-50 dark:bg-gray-800 rounded-lg py-2 px-3 mt-4">
                  Admin credentials: admin / admin@1234
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Features Preview - Interactive Dot Cards */}
          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto mb-20">
            <FeatureDotCard
              title="Technical Assessment"
              description="25 questions with role-specific customization and real-time code execution"
              icon={Code}
              target={25}
              label="Questions"
            />
            
            <FeatureDotCard
              title="Live Interview"
              description="10 coding problems with AI-powered monitoring and behavior analysis"
              icon={Video}
              target={90}
              label="Minutes"
            />
            
            <FeatureDotCard
              title="HR Simulation"
              description="10 behavioral questions with advanced AI sentiment and personality analysis"
              icon={MessageSquare}
              target={10}
              label="Scenarios"
            />
          </div>

          {/* Timeline Section */}
          <TimelineDemo />

          {/* Testimonials Section */}
          <TestimonialsSection />

          {/* Call to Action */}
          <div className="text-center py-16">
            <h3 className="text-3xl font-bold text-black dark:text-white mb-4">Ready to Transform Your Hiring?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg max-w-2xl mx-auto">Join thousands of companies using AI-powered recruitment to find the best talent faster and more efficiently.</p>
            <div className="flex items-center justify-center space-x-2 text-gray-500 dark:text-gray-400">
              <Globe className="w-5 h-5" />
              <span className="font-medium">Trusted by 500+ companies worldwide</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer
        brandName="Recruitix"
        brandDescription="AI-powered recruitment platform with advanced proctoring, semantic analysis, and real-time monitoring capabilities for modern hiring needs."
        socialLinks={[
          {
            icon: <Twitter className="w-6 h-6" />,
            href: "https://twitter.com",
            label: "Twitter",
          },
          {
            icon: <Linkedin className="w-6 h-6" />,
            href: "https://linkedin.com",
            label: "LinkedIn",
          },
          {
            icon: <Github className="w-6 h-6" />,
            href: "https://github.com",
            label: "GitHub",
          },
          {
            icon: <Mail className="w-6 h-6" />,
            href: "mailto:contact@recruitix.com",
            label: "Email",
          },
        ]}
        navLinks={[
          { label: "Features", href: "#features" },
          { label: "Pricing", href: "#pricing" },
          { label: "About", href: "#about" },
          { label: "Contact", href: "#contact" },
          { label: "Privacy", href: "#privacy" },
          { label: "Terms", href: "#terms" },
        ]}
        creatorName="AI Recruitment Team"
        creatorUrl="https://recruitix.com"
        brandIcon={<img src="/brain-logo.png" alt="Recruitix Brain Logo" className="w-8 sm:w-10 md:w-14 h-8 sm:h-10 md:h-14 object-contain drop-shadow-lg" />}
      />
    </div>
  );
};

export default Index;