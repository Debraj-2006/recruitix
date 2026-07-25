
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { RecruiterStatsPin } from '@/components/ui/recruiter-stats-pin';
import { ArrowLeft, Users, Settings, BarChart3, Eye, CheckCircle, Clock, AlertTriangle, TrendingUp, UserCheck, Activity, Loader, ShieldAlert } from 'lucide-react';
import { useRealtimeUsers, useActiveUserCount, useExamViolations } from '@/hooks/useRealtimeUsers';

interface RecruiterPortalProps {
  onBack: () => void;
}

const RecruiterPortal = ({ onBack }: RecruiterPortalProps) => {
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const { users: activeUsers, loading: usersLoading } = useRealtimeUsers('candidate');
  const { count: totalActiveUsers } = useActiveUserCount();
  const { violations } = useExamViolations();

  // Mock data for assessment scores
  const candidates = [
    {
      id: 1,
      name: 'Debangshu Chatterjee',
      round1: { score: 85, status: 'completed', time: '45 mins' },
      round2: { score: 78, status: 'completed', time: '40 mins' },
      round3: { score: 92, status: 'completed', time: '28 mins' },
      overall: 85,
      appliedFor: 'Software Engineer'
    },
    {
      id: 2,
      name: 'Debojyoti De Majumder',
      round1: { score: 92, status: 'completed', time: '52 mins' },
      round2: { score: 88, status: 'in-progress', time: '20 mins' },
      round3: { score: null, status: 'pending', time: null },
      overall: 90,
      appliedFor: 'Full Stack Developer'
    },
    {
      id: 3,
      name: 'Sylvia Barick',
      round1: { score: 76, status: 'completed', time: '38 mins' },
      round2: { score: null, status: 'pending', time: null },
      round3: { score: null, status: 'pending', time: null },
      overall: 76,
      appliedFor: 'Frontend Developer'
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'in-progress':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black border-b border-gray-700 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={onBack} className="flex items-center space-x-2 text-white hover:text-gray-300">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Button>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="flex items-center space-x-2 bg-gray-800 text-white border-gray-700">
                <Activity className="w-3 h-3" />
                <span>Recruiter Dashboard</span>
              </Badge>
              <div className="text-right text-sm text-gray-300">
                <p className="flex items-center space-x-1">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>Active Users: {totalActiveUsers}</span>
                </p>
                <p>Live Candidates: {activeUsers.length}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Recruiter Dashboard</h1>
            <p className="text-gray-400">Monitor candidate assessments and manage interview settings</p>
          </div>

          <Tabs defaultValue="live-monitoring" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="live-monitoring" className="flex items-center space-x-2">
                <Eye className="w-4 h-4" />
                <span>Live Monitoring</span>
              </TabsTrigger>
              <TabsTrigger value="candidates" className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Candidates</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </TabsTrigger>
            </TabsList>

            {/* Live Monitoring Tab */}
            <TabsContent value="live-monitoring" className="space-y-6">
              <Card className="bg-gray-900 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-white">
                    <Activity className="w-5 h-5 text-green-500" />
                    <span>Real-Time User Monitoring</span>
                  </CardTitle>
                  <CardDescription className="text-gray-400">Track all currently active users on the platform</CardDescription>
                </CardHeader>
                <CardContent>
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                      <span className="text-white font-medium">Loading active users...</span>
                    </div>
                  ) : activeUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400 font-medium">No active users currently on the platform</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <Card className="bg-blue-600 border-0">
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-4xl font-bold text-white">{activeUsers.length}</div>
                              <p className="text-sm text-blue-200 mt-2 font-medium">Active Candidates</p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-green-600 border-0">
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-4xl font-bold text-white">{totalActiveUsers}</div>
                              <p className="text-sm text-green-200 mt-2 font-medium">Total Active Users</p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-purple-600 border-0">
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-white">{new Date().toLocaleTimeString()}</div>
                              <p className="text-sm text-purple-200 mt-2 font-medium">Current Time</p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="overflow-x-auto bg-gray-900 rounded-lg border border-gray-700">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-gray-700 bg-gray-800">
                              <th className="text-left py-3 px-4 font-bold text-white">User</th>
                              <th className="text-left py-3 px-4 font-bold text-white">Email</th>
                              <th className="text-left py-3 px-4 font-bold text-white">Status</th>
                              <th className="text-left py-3 px-4 font-bold text-white">Login Time</th>
                              <th className="text-left py-3 px-4 font-bold text-white">Last Activity</th>
                              <th className="text-left py-3 px-4 font-bold text-white">Current Page</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeUsers.map((user) => (
                              <tr key={user.uid} className="border-b border-gray-700 hover:bg-gray-800 transition-colors">
                                <td className="py-4 px-4">
                                  <div className="font-semibold text-white">{user.displayName || 'Unknown'}</div>
                                </td>
                                <td className="py-4 px-4">
                                  <code className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-300 font-mono">{user.email}</code>
                                </td>
                                <td className="py-4 px-4">
                                  <Badge className="bg-green-600 text-white border-0">
                                    <span className="inline-block w-2 h-2 bg-white rounded-full mr-2"></span>
                                    {user.status}
                                  </Badge>
                                </td>
                                <td className="py-4 px-4 text-gray-300 font-medium">{user.timeSinceLogin}</td>
                                <td className="py-4 px-4 text-gray-300 font-medium">{user.timeSinceActivity}</td>
                                <td className="py-4 px-4 text-gray-300 font-medium">{user.currentPage || 'Dashboard'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {violations.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" />
                            Recent Live Violations
                          </h3>
                          <div className="space-y-3">
                            {violations.slice(0, 5).map(violation => (
                              <div key={violation.id} className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex items-start gap-4">
                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <div className="flex items-center gap-3 mb-1">
                                    <span className="font-semibold text-red-400">{violation.type}</span>
                                    <span className="text-xs text-red-400/70">
                                      {violation.timestamp ? new Date(violation.timestamp.toMillis()).toLocaleTimeString() : 'Just now'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-red-300">{violation.message}</p>
                                  <p className="text-xs text-red-400/50 mt-1">Candidate ID: {violation.userId} | Session: {violation.sessionId}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Candidates Tab */}
            <TabsContent value="candidates" className="space-y-6">
              <div className="grid gap-6">
                {candidates.map((candidate) => (
                  <Card key={candidate.id} className="bg-gray-900 border-gray-700 hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl text-white">{candidate.name}</CardTitle>
                          <CardDescription className="text-gray-400">{candidate.appliedFor}</CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-white">
                            {candidate.overall}%
                          </div>
                          <p className="text-sm text-gray-400">Overall Score</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        {/* Round 1 */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white">Technical Round</h4>
                            {getStatusBadge(candidate.round1.status)}
                          </div>
                          {candidate.round1.score && (
                            <div>
                              <div className="text-xl font-bold text-white">{candidate.round1.score}%</div>
                              <p className="text-sm text-gray-400">Time: {candidate.round1.time}</p>
                            </div>
                          )}
                        </div>

                        {/* Round 2 */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white">Live Interview</h4>
                            {getStatusBadge(candidate.round2.status)}
                          </div>
                          {candidate.round2.score && (
                            <div>
                              <div className="text-xl font-bold text-white">{candidate.round2.score}%</div>
                              <p className="text-sm text-gray-400">Time: {candidate.round2.time}</p>
                            </div>
                          )}
                          {candidate.round2.status === 'in-progress' && (
                            <div>
                              <Progress value={45} className="mt-2" />
                              <p className="text-sm text-gray-400 mt-1">Elapsed: {candidate.round2.time}</p>
                            </div>
                          )}
                        </div>

                        {/* Round 3 */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white">HR Simulation</h4>
                            {getStatusBadge(candidate.round3.status)}
                          </div>
                          {candidate.round3.score && (
                            <div>
                              <div className="text-xl font-bold text-white">{candidate.round3.score}%</div>
                              <p className="text-sm text-gray-400">Time: {candidate.round3.time}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span>2 integrity flags</span>
                        </div>
                        <Button variant="outline" size="sm" className="flex items-center space-x-2">
                          <Eye className="w-4 h-4" />
                          <span>View Details</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Analytics Tab - 3D Pin Stats */}
            <TabsContent value="analytics" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <RecruiterStatsPin
                  title="Total Candidates"
                  value={147}
                  description="All registered candidates"
                  icon={Users}
                  color="bg-gray-600"
                  trend={{ value: 12, isPositive: true }}
                />
                
                <RecruiterStatsPin
                  title="Completed"
                  value={89}
                  description="Finished all rounds"
                  icon={CheckCircle}
                  color="bg-green-600"
                  trend={{ value: 8, isPositive: true }}
                />
                
                <RecruiterStatsPin
                  title="In Progress"
                  value={23}
                  description="Currently taking tests"
                  icon={Clock}
                  color="bg-yellow-600"
                  trend={{ value: 3, isPositive: false }}
                />
                
                <RecruiterStatsPin
                  title="Pass Rate"
                  value="76%"
                  description="Overall success rate"
                  icon={TrendingUp}
                  color="bg-gray-700"
                  trend={{ value: 5, isPositive: true }}
                />
              </div>

              <Card className="bg-gray-900 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Performance Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1 text-gray-300">
                        <span>Excellent (90-100%)</span>
                        <span>23 candidates</span>
                      </div>
                      <Progress value={23} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1 text-gray-300">
                        <span>Good (80-89%)</span>
                        <span>31 candidates</span>
                      </div>
                      <Progress value={31} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1 text-gray-300">
                        <span>Average (70-79%)</span>
                        <span>28 candidates</span>
                      </div>
                      <Progress value={28} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1 text-gray-300">
                        <span>Below Average (&lt;70%)</span>
                        <span>7 candidates</span>
                      </div>
                      <Progress value={7} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              <div className="grid gap-6">
                <Card className="bg-gray-900 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Assessment Configuration</CardTitle>
                    <CardDescription className="text-gray-400">Customize the interview rounds and difficulty levels</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Technical Round Duration</label>
                        <select className="w-full p-2 border border-gray-700 rounded-md bg-gray-800 text-white">
                          <option>60 minutes</option>
                          <option>45 minutes</option>
                          <option>90 minutes</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Difficulty Level</label>
                        <select className="w-full p-2 border border-gray-700 rounded-md bg-gray-800 text-white">
                          <option>Medium</option>
                          <option>Easy</option>
                          <option>Hard</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Focus Areas</label>
                        <select className="w-full p-2 border border-gray-700 rounded-md bg-gray-800 text-white">
                          <option>DSA + Aptitude</option>
                          <option>DSA Only</option>
                          <option>Full Stack</option>
                        </select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Proctoring Settings</CardTitle>
                    <CardDescription className="text-gray-400">Configure monitoring and security options</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                      <div>
                        <h4 className="font-medium text-white">Eye Tracking</h4>
                        <p className="text-sm text-gray-400">Monitor candidate attention during assessment</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-gray-600 text-white hover:bg-gray-800">Enabled</Button>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                      <div>
                        <h4 className="font-medium text-white">Screen Recording</h4>
                        <p className="text-sm text-gray-400">Record candidate screen activity</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-gray-600 text-white hover:bg-gray-800">Optional</Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-white">Browser Lock</h4>
                        <p className="text-sm text-gray-400">Prevent tab switching during test</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-gray-600 text-white hover:bg-gray-800">Enabled</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};


export default RecruiterPortal;
