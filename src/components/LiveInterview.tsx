import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Video, Eye, AlertCircle, Clock, Mic, MicOff, ChevronLeft, ChevronRight, Shield, Zap, Brain, Code2, AlertTriangle } from 'lucide-react';
import { MonitoringData, MonitoringProfile, monitoringProfiles, createParameterizedMonitoringTest, getMonitoringProfile } from '@/utils/monitoringProfiles';
import { createStrikeTracker, createViolationPolicy, type ConfirmedViolation } from '@/utils/proctorEngine';

interface LiveInterviewProps {
  onComplete: (score: number) => void;
  onBack: () => void;
}



const LiveInterview = ({ onComplete, onBack }: LiveInterviewProps) => {
  const [isStarted, setIsStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(2700); // 45 minutes
  const [screenRecording, setScreenRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showViolationsPanel, setShowViolationsPanel] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simplified monitoring states
  const [monitoringData, setMonitoringData] = useState<MonitoringData>({
    eyeTracking: 'good',
    faceVisibility: 'complete',
    faceCount: 1
  });

  const [lastMonitoringUpdate, setLastMonitoringUpdate] = useState<string>('');
  const [isPageVisible, setIsPageVisible] = useState<boolean>(!document.hidden);
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(document.hasFocus());

  // Real-time monitoring states
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [lastTypingTime, setLastTypingTime] = useState<number>(0);
  const [suspiciousActivity, setSuspiciousActivity] = useState<number>(0);
  const [focusLossCount, setFocusLossCount] = useState<number>(0);

  const [faceNotCompleteTimer, setFaceNotCompleteTimer] = useState(0);
  const [violations, setViolations] = useState<string[]>([]);
  const [criticalViolations, setCriticalViolations] = useState<string[]>([]);
  const [warningViolations, setWarningViolations] = useState<string[]>([]);

  // Shuffle helper for dynamic question order
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // 10 DSA Coding Questions
  const questionBank = [
    {
      question: 'Implement a function to reverse a linked list.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Iterative or recursive reversal'
    },
    {
      question: 'Find the longest palindromic substring in a given string.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Expand around centers or dynamic programming'
    },
    {
      question: 'Implement binary search in a sorted array.',
      difficulty: 'Easy',
      points: 8,
      expectedApproach: 'Divide and conquer with two pointers'
    },
    {
      question: 'Detect if a linked list has a cycle.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Floyd\'s cycle detection (tortoise and hare)'
    },
    {
      question: 'Find the maximum depth of a binary tree.',
      difficulty: 'Easy',
      points: 8,
      expectedApproach: 'Recursive DFS or iterative BFS'
    },
    {
      question: 'Merge two sorted arrays in-place.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Two pointers from end to beginning'
    },
    {
      question: 'Find the first non-repeating character in a string.',
      difficulty: 'Easy',
      points: 8,
      expectedApproach: 'Hash map for frequency counting'
    },
    {
      question: 'Implement a stack using queues.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Two queues or one queue with rotation'
    },
    {
      question: 'Find the kth largest element in an array.',
      difficulty: 'Medium',
      points: 10,
      expectedApproach: 'Quick select or heap'
    },
    {
      question: 'Check if two strings are anagrams.',
      difficulty: 'Easy',
      points: 8,
      expectedApproach: 'Sorting or character frequency counting'
    }
  ];

  const [questions] = useState(() => shuffleArray(questionBank));

  const calculateScore = () => {
    let totalScore = 0;
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

    questions.forEach((q, index) => {
      const answer = answers[index];
      if (answer && answer.trim().length > 20) {
        const codeQuality = answer.length > 100 ? 0.8 : 0.6;
        totalScore += Math.floor(q.points * codeQuality);
      }
    });

    return { totalScore, maxScore };
  };

  const handleDisqualification = (reason: string) => {
    console.log('Student disqualified:', reason);
    setDisqualificationReason(reason);
    setIsDisqualified(true);
    setTimeout(() => {
      onComplete(0); // Zero score for disqualification
    }, 3000);
  };

  const flagViolation = (violation: string, type: 'critical' | 'warning') => {
    const timestamp = new Date().toLocaleTimeString();
    const violationWithTime = `${timestamp}: ${violation}`;

    if (type === 'critical') {
      setCriticalViolations(prev => [...prev, violationWithTime]);
      setIntegrityScore(prev => Math.max(0, prev - 40)); // Deduct 40 points for critical violations
    } else {
      setWarningViolations(prev => [...prev, violationWithTime]);
      setIntegrityScore(prev => Math.max(0, prev - 10)); // Deduct 10 points for warnings
    }

    setViolations(prev => [...prev, violationWithTime]);
    setSimulationLog(prev => [...prev, `[${Math.floor((Date.now() - startTime) / 1000)}s] ${type.toUpperCase()}: ${violation}`]);
  };

  // Monitoring profile selection and simulation
  const [selectedProfile, setSelectedProfile] = useState<MonitoringProfile>(monitoringProfiles[0]);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [integrityScore, setIntegrityScore] = useState<number>(100);
  const [startTime] = useState(Date.now());

  // Confirm-on-N-consecutive-checks trackers (mirrors proctorEngine.ts, used by the real
  // MediaPipe proctoring path) — replaces the old `currentTime % N === 0` checks, which double-fired
  // whenever two 500ms ticks landed in the same modulo bucket and never distinguished "one bad frame"
  // from "sustained bad state".
  const strikeTracker = useRef(createStrikeTracker()); // MULTIPLE_FACES, LOOKING_AWAY, TAB_HIDDEN
  // Dedicated tracker for NO_FACE: 20 consecutive checks at the 500ms poll rate below ≈ 10s,
  // matching the "No face visible for >10 seconds = Disqualification" rule shown on the start screen.
  const noFaceStrikeTracker = useRef(createStrikeTracker(20));
  const noFaceWarningTracker = useRef(createStrikeTracker(2)); // early, non-fatal "moved away" warning
  const violationPolicy = useRef(createViolationPolicy());
  const isPageVisibleRef = useRef(isPageVisible);
  const lastFlagRef = useRef<Record<string, number>>({});

  // handleWindowBlur/handleVisibilityChange are registered once per interview start (effect deps
  // don't include isPageVisible), so they'd otherwise close over a stale value from mount time.
  useEffect(() => {
    isPageVisibleRef.current = isPageVisible;
  }, [isPageVisible]);

  // Time-based cooldown for the profile-specific meta-heuristics below (suspicious activity) that
  // don't map onto proctorEngine's real violation taxonomy, so they don't get a strike tracker.
  const canFlag = (key: string, cooldownMs: number) => {
    const now = Date.now();
    if (now - (lastFlagRef.current[key] ?? 0) < cooldownMs) return false;
    lastFlagRef.current[key] = now;
    return true;
  };

  const recordConfirmed = (violation: ConfirmedViolation) => {
    flagViolation(violation.message, violation.severity);
    if (violation.severity === 'critical' && !isDisqualified) {
      const result = violationPolicy.current.record();
      if (result.shouldAutoSubmit) {
        handleDisqualification('Repeated critical proctoring violations exceeded the allowed threshold');
      }
    }
  };

  // Force update monitoring data when page visibility changes (not window focus)
  useEffect(() => {
    if (isStarted && !isPageVisible) {
      // Only force update when tab is actually hidden
      setMonitoringData({
        eyeTracking: 'alert',
        faceVisibility: 'not_visible',
        faceCount: 0
      });
      setLastMonitoringUpdate(new Date().toLocaleTimeString());
    }
  }, [isPageVisible, isStarted]);

  // Enhanced real-time monitoring with dynamic behavior detection
  const simulateMonitoring = () => {
    const elapsedTime = Date.now() - startTime;
    const currentTime = Math.floor(elapsedTime / 1000);

    // Create monitoring test function with current selected profile
    const monitoringTestFunction = createParameterizedMonitoringTest(selectedProfile);
    let newMonitoringData = monitoringTestFunction(elapsedTime);

    // Real-time behavior analysis
    const timeSinceLastTyping = Date.now() - lastTypingTime;
    const isRecentlyTyping = timeSinceLastTyping < 5000; // 5 seconds

    // Dynamic monitoring based on real user behavior
    if (!isPageVisible) {
      // Tab is hidden - immediate detection
      newMonitoringData = {
        eyeTracking: 'alert',
        faceVisibility: 'not_visible',
        faceCount: 0
      };
      setFocusLossCount(prev => prev + 1);
    } else {
      // Tab is visible - apply profile-based monitoring with real-time adjustments
      if (selectedProfile.id === 'baseline_candidate') {
        // Baseline with realistic variations
        const variation = Math.random();
        const typingBonus = isRecentlyTyping ? 0.1 : 0; // Better focus when typing

        if (variation < (0.02 - typingBonus)) {
          newMonitoringData = {
            eyeTracking: 'warning',
            faceVisibility: 'partial',
            faceCount: 1
          };
        } else if (variation < (0.01 - typingBonus)) {
          newMonitoringData = {
            eyeTracking: 'alert',
            faceVisibility: 'complete',
            faceCount: 1
          };
        } else {
          newMonitoringData = {
            eyeTracking: isRecentlyTyping ? 'good' : 'good',
            faceVisibility: 'complete',
            faceCount: 1
          };
        }
      } else if (selectedProfile.id === 'distracted_candidate') {
        // Add extra distraction when not typing
        if (!isRecentlyTyping && Math.random() < 0.3) {
          newMonitoringData = {
            eyeTracking: 'alert',
            faceVisibility: Math.random() < 0.5 ? 'partial' : 'not_visible',
            faceCount: Math.random() < 0.1 ? 0 : 1
          };
        }
      } else if (selectedProfile.id === 'cheating_candidate') {
        // Simulate more suspicious behavior during coding
        if (isRecentlyTyping && Math.random() < 0.4) {
          setSuspiciousActivity(prev => prev + 1);
          newMonitoringData = {
            ...newMonitoringData,
            faceCount: Math.random() < 0.6 ? 2 : newMonitoringData.faceCount,
            eyeTracking: 'alert'
          };
        }
      }
    }

    // Real-time violation detection — confirm on sustained state via strike trackers instead of
    // time-modulo sampling (see trackers declared above for why).
    if (isDisqualified) return;

    if (newMonitoringData.faceCount > 1) {
      const confirmed = strikeTracker.current.strike('MULTIPLE_FACES');
      if (confirmed) {
        // "Multiple faces detected = Immediate disqualification" (start screen) — the strike
        // requirement (3 consecutive ~500ms checks) exists only to absorb a single noisy frame,
        // not to give the candidate a grace period.
        flagViolation(`${newMonitoringData.faceCount} faces detected - potential cheating`, 'critical');
        handleDisqualification('Multiple faces detected in frame');
      }
    } else {
      strikeTracker.current.clear('MULTIPLE_FACES');
    }

    if (newMonitoringData.eyeTracking === 'alert' && newMonitoringData.faceCount > 0) {
      const confirmed = strikeTracker.current.strike('LOOKING_AWAY');
      // Warning only — "Eye tracking violations are monitored only" (start screen).
      if (confirmed) flagViolation('Eyes not focused on screen - looking elsewhere', 'warning');
    } else {
      strikeTracker.current.clear('LOOKING_AWAY');
    }

    if (newMonitoringData.faceVisibility === 'not_visible' && isPageVisible) {
      const warned = noFaceWarningTracker.current.strike('NO_FACE');
      if (warned) flagViolation('Face not visible - candidate may have moved away', 'warning');

      // "No face visible for >10 seconds = Disqualification" (start screen).
      const confirmed = noFaceStrikeTracker.current.strike('NO_FACE');
      if (confirmed) handleDisqualification('Face not visible for more than 10 seconds');
    } else {
      noFaceWarningTracker.current.clear('NO_FACE');
      noFaceStrikeTracker.current.clear('NO_FACE');
    }

    // Suspicious activity detection — profile-specific heuristic with no equivalent in
    // proctorEngine's real violation taxonomy, so it uses the plain time-cooldown instead of a
    // strike tracker.
    if (suspiciousActivity > 5 && canFlag('suspicious_activity', 15000)) {
      recordConfirmed({ type: 'IDENTITY_MISMATCH', severity: 'critical', message: 'Multiple suspicious activities detected' });
    }

    // Always update monitoring data
    setMonitoringData(newMonitoringData);
    setLastMonitoringUpdate(new Date().toLocaleTimeString());

    // Enhanced logging with more context
    if (currentTime % 3 === 0) { // More frequent logging
      const tabStatus = !isPageVisible ? '🔴 HIDDEN' : '🟢 ACTIVE';
      const typingStatus = isRecentlyTyping ? '⌨️ TYPING' : '⏸️ IDLE';
      const suspiciousStatus = suspiciousActivity > 0 ? `🚨 SUS:${suspiciousActivity}` : '✅ CLEAN';

      setSimulationLog(prev => [...prev,
      `[${currentTime}s] ${tabStatus} ${typingStatus} ${suspiciousStatus} | 👁️${newMonitoringData.eyeTracking} 👤${newMonitoringData.faceCount} 📷${newMonitoringData.faceVisibility}`
      ]);
    }
    // Tab-hidden is flagged once per edge transition by handleVisibilityChange below, not
    // polled here — polling it too caused every tab switch to log two "critical" violations
    // (one from the event, one from this loop) and double-deduct the integrity score.
  };

  useEffect(() => {
    if (isStarted && !isDisqualified) {
      // Simulate camera access
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.log('Camera access denied:', err));

      // Add page visibility and focus event listeners
      const handleVisibilityChange = () => {
        const isVisible = !document.hidden;
        setIsPageVisible(isVisible);
        isPageVisibleRef.current = isVisible;

        if (!isVisible) {
          setFocusLossCount(prev => prev + 1);
          recordConfirmed({ type: 'TAB_HIDDEN', severity: 'critical', message: 'Browser tab switched away from interview' });
          setSimulationLog(prev => [...prev, `[${Math.floor((Date.now() - startTime) / 1000)}s] 🔴 Tab became inactive`]);
        } else {
          setSimulationLog(prev => [...prev, `[${Math.floor((Date.now() - startTime) / 1000)}s] 🟢 Tab became active`]);
        }
      };

      const handleWindowBlur = () => {
        setIsWindowFocused(false);
        // Read the ref, not the isPageVisible closure var below — this listener is registered
        // once per interview start (effect deps don't include isPageVisible), so the plain
        // variable would freeze at whatever it was when the effect last ran.
        if (isPageVisibleRef.current) {
          flagViolation('Window lost focus - possible distraction', 'warning');
        }
      };

      const handleWindowFocus = () => {
        setIsWindowFocused(true);
        // Don't log every focus change to reduce noise
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);

      // Timer
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Monitoring simulation - runs every 500ms for more responsive updates
      const monitoringTracker = setInterval(simulateMonitoring, 500);

      // Trigger specific violations based on selected profile (separate from monitoring data)
      selectedProfile.simulatedViolations.forEach((violation) => {
        setTimeout(() => {
          flagViolation(violation.message, violation.type);
        }, violation.timestamp * 1000);
      });

      return () => {
        clearInterval(timer);
        clearInterval(monitoringTracker);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('focus', handleWindowFocus);
      };
    }
  }, [isStarted, isDisqualified, selectedProfile]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = () => {
    const { totalScore } = calculateScore();
    console.log('Interview completed with answers:', answers);
    setShowResults(true);
    setTimeout(() => {
      onComplete(totalScore);
    }, 3000);
  };

  const handleBackClick = () => {
    if (isStarted && Object.keys(answers).length > 0) {
      setShowExitConfirmation(true);
    } else {
      onBack();
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirmation(false);
    onBack();
  };

  const handleCancelExit = () => {
    setShowExitConfirmation(false);
  };

  const getFaceStatusBadgeVariant = () => {
    if (monitoringData.faceCount === 1 && monitoringData.faceVisibility === 'complete') {
      return 'default'; // Green - good
    } else if (monitoringData.faceCount === 1 && monitoringData.faceVisibility === 'partial') {
      return 'secondary'; // Yellow/Orange - acceptable
    } else {
      return 'destructive'; // Red - critical
    }
  };

  const getFaceStatusText = () => {
    if (monitoringData.faceCount === 0) return '❌ No Face Detected';
    if (monitoringData.faceCount === 1) {
      if (monitoringData.faceVisibility === 'complete') return '✅ Complete Face';
      if (monitoringData.faceVisibility === 'partial') return '⚠️ Partial Face';
      return '❌ Face Not Visible';
    }
    return `🚨 ${monitoringData.faceCount} Faces Detected`;
  };

  if (isDisqualified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-950 flex items-center justify-center p-4">
        <div className="relative backdrop-blur-xl bg-white/10 border border-red-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-red-300">Interview Terminated</h1>
          <p className="text-red-200/80">{disqualificationReason}</p>
          <p className="text-white/50 text-sm">Submitting your results...</p>
        </div>
      </div>
    );
  }

  if (showResults) {
    const { totalScore, maxScore } = calculateScore();
    const percentage = Math.round((totalScore / maxScore) * 100);

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-600 via-gray-800 to-black flex items-center justify-center p-4">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 -right-10 w-60 h-60 bg-teal-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute -bottom-10 left-1/2 w-80 h-80 bg-gray-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 max-w-4xl w-full shadow-2xl">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gray-500/50">
                <img src="/brain-logo.png" alt="Brain" className="w-10 h-10 object-contain" />
              </div>
              <div className="absolute inset-0 w-20 h-20 bg-emerald-500/30 rounded-full blur-xl mx-auto animate-ping"></div>
            </div>

            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-300 to-white bg-clip-text text-transparent">
              Interview Complete
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Score Section */}
              <div className="space-y-6">
                <div className="relative">
                  <div className="text-8xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                    {percentage}%
                  </div>
                  <div className="absolute inset-0 text-8xl font-bold text-emerald-400/20 blur-sm">
                    {percentage}%
                  </div>
                </div>

                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-2xl font-semibold text-white mb-2">
                    Score: {totalScore}/{maxScore}
                  </p>
                  <p className="text-emerald-200">
                    {percentage >= 70 ? '🚀 Outstanding coding skills!' :
                      percentage >= 50 ? '⭐ Good problem-solving ability!' : '📚 Keep practicing DSA!'}
                  </p>
                </div>
              </div>

              {/* Violations Report */}
              <div className="space-y-6">
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h4 className="font-semibold text-white mb-4 flex items-center justify-center gap-2">
                    <Shield className="w-5 h-5" />
                    Proctoring Report
                  </h4>

                  <div className="space-y-4">
                    {/* Critical Violations */}
                    {criticalViolations.length > 0 && (
                      <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-4">
                        <h5 className="font-semibold text-red-300 mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Critical Violations ({criticalViolations.length})
                        </h5>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {criticalViolations.slice(-5).map((violation, index) => (
                            <div key={index} className="text-red-200/80 text-sm bg-red-500/10 rounded px-2 py-1">
                              • {violation}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Warning Violations */}
                    {warningViolations.length > 0 && (
                      <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-4">
                        <h5 className="font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Warning Violations ({warningViolations.length})
                        </h5>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {warningViolations.slice(-5).map((violation, index) => (
                            <div key={index} className="text-yellow-200/80 text-sm bg-yellow-500/10 rounded px-2 py-1">
                              • {violation}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Violations */}
                    {criticalViolations.length === 0 && warningViolations.length === 0 && (
                      <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-4">
                        <div className="flex items-center justify-center gap-2 text-green-300">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="font-medium">No violations detected</span>
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="bg-slate-500/10 border border-slate-400/30 rounded-lg p-4">
                      <div className="flex justify-between text-sm text-slate-300">
                        <span>Total Monitoring Events:</span>
                        <span className="font-medium">{violations.length}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-300">
                        <span>Interview Duration:</span>
                        <span className="font-medium">{Math.floor((2700 - timeLeft) / 60)}m {Math.floor((2700 - timeLeft) % 60)}s</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={onBack}
              className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-0 rounded-xl px-8 py-3 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-gray-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 -right-10 w-60 h-60 bg-gray-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute -bottom-10 left-1/2 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 max-w-2xl w-full shadow-2xl">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-700 to-black rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gray-500/50">
                <Video className="w-10 h-10 text-white" />
              </div>
              <div className="absolute inset-0 w-20 h-20 bg-gray-500/30 rounded-full blur-xl mx-auto animate-ping"></div>
            </div>

            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-300 to-white bg-clip-text text-transparent">
              Live Proctored Interview
            </h1>

            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-gray-500/10 border border-gray-300/20 rounded-2xl p-6">
                <h3 className="font-semibold text-gray-300 mb-4 flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5" />
                  System Requirements
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-200/80">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    Camera access required
                  </div>
                  <div className="flex items-center gap-2 text-gray-200/80">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    Microphone access
                  </div>
                  <div className="flex items-center gap-2 text-gray-200/80">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    Face detection monitoring
                  </div>
                  <div className="flex items-center gap-2 text-gray-200/80">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    Duration: 45 minutes
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-amber-500/10 border border-amber-300/20 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3">
                    <h4 className="font-medium text-amber-300">Critical Disqualification Rules</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-amber-200/80">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        <strong>Multiple faces detected = Immediate disqualification</strong>
                      </div>
                      <div className="flex items-center gap-2 text-amber-200/80">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        <strong>No face visible for &gt;10 seconds = Disqualification</strong>
                      </div>
                      <div className="flex items-center gap-2 text-green-300/80">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Partial face visibility is acceptable
                      </div>
                      <div className="flex items-center gap-2 text-green-300/80">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Eye tracking violations are monitored only
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={handleBackClick}
                variant="outline"
                className="flex-1 bg-white/5 border-white/20 text-white hover:bg-white/10 rounded-xl backdrop-blur-sm transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <Button
                onClick={() => setIsStarted(true)}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white border-0 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <Code2 className="w-4 h-4 mr-2" />
                Start Interview
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 -right-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute -bottom-10 left-1/2 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-pink-500/20 rounded-full border border-red-300/30 backdrop-blur-sm">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                <span className="text-red-200 font-medium text-sm">LIVE INTERVIEW</span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full backdrop-blur-sm border border-white/10">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white/70 text-sm">Recording</span>
              </div>

              <span className="text-white/60 text-sm">
                Question {currentQuestion + 1} of {questions.length}
              </span>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm border border-white/10">
                <Clock className="w-4 h-4 text-white/70" />
                <span className={`font-mono text-lg font-bold ${timeLeft < 300 ? 'text-red-400' : 'text-white'}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>

              <div className={`px-4 py-2 rounded-full backdrop-blur-sm border ${answeredCount === questions.length
                ? 'bg-emerald-500/20 border-emerald-300/30 text-emerald-200'
                : 'bg-white/5 border-white/10 text-white/70'
                }`}>
                <span className="font-medium">{answeredCount}/{questions.length} Solved</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Interview Interface */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Feed & Monitoring */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Live Monitoring
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMicEnabled(!micEnabled)}
                  className={micEnabled ? 'text-green-600' : 'text-red-600'}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </CardTitle>

              {/* Profile Selection for Testing */}
              <div className="mt-3">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Simulation Profile:
                </label>
                <select
                  value={selectedProfile.id}
                  onChange={(e) => {
                    const profile = getMonitoringProfile(e.target.value);
                    if (profile) {
                      setSelectedProfile(profile);
                      setSimulationLog([`Starting simulation: ${profile.description}`]);
                      setIntegrityScore(100);
                      // Reset violations
                      setCriticalViolations([]);
                      setWarningViolations([]);
                      setViolations([]);
                    }
                  }}
                  className="mt-1 block w-full text-sm border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-700 dark:text-white"
                >
                  {monitoringProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 flex items-center space-x-2">
                  <div className="flex items-center space-x-2 bg-black/50 rounded-full px-3 py-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-white text-xs">LIVE</span>
                  </div>
                </div>
              </div>

              {/* Simplified Monitoring Display */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center">
                    <Eye className="w-4 h-4 mr-1" />
                    Eye Tracking
                  </span>
                  <Badge variant={
                    monitoringData.eyeTracking === 'good' ? 'default' :
                      monitoringData.eyeTracking === 'warning' ? 'secondary' : 'destructive'
                  }>
                    {monitoringData.eyeTracking === 'good' ? '✓ Focused' :
                      monitoringData.eyeTracking === 'warning' ? '⚠ Distracted' : '❌ Alert'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Face Status</span>
                  <Badge variant={getFaceStatusBadgeVariant()}>
                    {getFaceStatusText()}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Monitoring Events</span>
                  <div className="flex space-x-1">
                    {criticalViolations.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {criticalViolations.length} Critical
                      </Badge>
                    )}
                    {warningViolations.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {warningViolations.length} Warnings
                      </Badge>
                    )}
                    {criticalViolations.length === 0 && warningViolations.length === 0 && (
                      <Badge variant="default" className="text-xs">
                        Clean
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Real-time Monitoring Status */}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-300">📊 Live Monitoring</span>
                    <div className="flex items-center space-x-3">
                      {/* Tab Status */}
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${!isPageVisible ? 'bg-red-400' : 'bg-green-400'
                          }`}></div>
                        <span className={`text-xs ${!isPageVisible ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                          }`}>
                          {!isPageVisible ? 'HIDDEN' : 'ACTIVE'}
                        </span>
                      </div>

                      {/* Typing Status */}
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${isTyping ? 'bg-black dark:bg-white animate-pulse' : 'bg-gray-400'
                          }`}></div>
                        <span className={`text-xs ${isTyping ? 'text-black dark:text-white' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                          {isTyping ? 'TYPING' : 'IDLE'}
                        </span>
                      </div>

                      {/* Suspicious Activity Counter */}
                      {suspiciousActivity > 0 && (
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
                          <span className="text-xs text-orange-600 dark:text-orange-400">
                            SUS: {suspiciousActivity}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-center">
                      <div className="font-medium text-slate-600 dark:text-slate-300">Faces</div>
                      <div className={`font-bold text-lg ${monitoringData.faceCount === 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                        {monitoringData.faceCount}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-slate-600 dark:text-slate-300">Visibility</div>
                      <div className={`font-bold text-xs ${monitoringData.faceVisibility === 'complete' ? 'text-green-600 dark:text-green-400' :
                        monitoringData.faceVisibility === 'partial' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                        {monitoringData.faceVisibility === 'complete' ? '✅ Full' :
                          monitoringData.faceVisibility === 'partial' ? '⚠️ Part' : '❌ None'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-slate-600 dark:text-slate-300">Focus</div>
                      <div className={`font-bold text-xs ${monitoringData.eyeTracking === 'good' ? 'text-green-600 dark:text-green-400' :
                        monitoringData.eyeTracking === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                        {monitoringData.eyeTracking === 'good' ? '🎯 Good' :
                          monitoringData.eyeTracking === 'warning' ? '⚠️ Warn' : '🚨 Alert'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-slate-600 dark:text-slate-300">Activity</div>
                      <div className={`font-bold text-xs ${isTyping ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                        {isTyping ? '⌨️ Code' : '⏸️ Idle'}
                      </div>
                    </div>
                  </div>

                  {/* Real-time Stats */}
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="text-slate-500 dark:text-slate-400">Tab Switches</div>
                        <div className={`font-bold ${focusLossCount > 3 ? 'text-red-600' : 'text-slate-600'}`}>
                          {focusLossCount}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-500 dark:text-slate-400">Last Update</div>
                        <div className="font-mono text-slate-600 dark:text-slate-400">
                          {lastMonitoringUpdate.split(':').slice(1).join(':')}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-500 dark:text-slate-400">Code Lines</div>
                        <div className="font-bold text-slate-600 dark:text-slate-400">
                          {(answers[currentQuestion] || '').split('\n').length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status indicator */}
                <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${monitoringData.faceCount === 1 && (monitoringData.faceVisibility === 'complete' || monitoringData.faceVisibility === 'partial')
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-red-500 animate-pulse'
                      }`}></div>
                    <span className="text-sm font-medium dark:text-white">
                      {monitoringData.faceCount === 1 && (monitoringData.faceVisibility === 'complete' || monitoringData.faceVisibility === 'partial')
                        ? 'Interview Status: ACTIVE'
                        : 'Interview Status: WARNING'
                      }
                    </span>
                  </div>
                </div>

                {/* Integrity Score */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-300">🔒 Integrity Score</span>
                    <span className={`text-lg font-bold ${integrityScore > 70 ? 'text-green-600 dark:text-green-400' :
                      integrityScore > 40 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                      {integrityScore}%
                    </span>
                  </div>
                  <div className="mt-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${integrityScore > 70 ? 'bg-green-500' :
                          integrityScore > 40 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                        style={{ width: `${integrityScore}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Simulation Log */}
                {simulationLog.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">📋 Simulation Log</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {simulationLog.slice(-5).map((log, index) => (
                        <div key={index} className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 p-1 rounded">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Screen Recording</label>
                  <Switch
                    checked={screenRecording}
                    onCheckedChange={setScreenRecording}
                  />
                </div>
                <Button variant="outline" onClick={handleBackClick} className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Coding Area */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">DSA Coding Challenge</CardTitle>
                  <p className="text-slate-600 mt-1">{currentQ.question}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{currentQ.difficulty}</Badge>
                  <Badge variant="secondary">{currentQ.points} points</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Question Details */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4 border border-blue-200 dark:border-blue-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Problem Statement</h3>
                    <p className="text-blue-700 dark:text-blue-400 mb-3">{currentQ.question}</p>
                    <div className="text-sm text-blue-600 dark:text-blue-400">
                      <strong>Expected Approach:</strong> {currentQ.expectedApproach}
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="text-sm text-slate-600 dark:text-slate-400">Points</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{currentQ.points}</div>
                  </div>
                </div>
              </div>

              {/* Code Editor */}
              <div className="bg-slate-900 rounded-lg overflow-hidden mb-4 border border-slate-700">
                {/* Editor Header */}
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="ml-3 text-slate-400 text-sm font-mono">solution.py</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span>Lines: {(answers[currentQuestion] || '').split('\n').length}</span>
                    <span>|</span>
                    <span>Chars: {(answers[currentQuestion] || '').length}</span>
                  </div>
                </div>

                {/* Code Area */}
                <div className="flex">
                  {/* Line Numbers */}
                  <div className="bg-slate-800 px-3 py-4 text-slate-500 text-sm font-mono select-none border-r border-slate-700 min-w-[60px]">
                    {Array.from({ length: Math.max(15, (answers[currentQuestion] || '').split('\n').length) }, (_, i) => (
                      <div key={i} className="h-6 leading-6 text-right">
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Code Editor */}
                  <div className="flex-1 relative">
                    <textarea
                      placeholder={`# ${currentQ.question}
# Expected approach: ${currentQ.expectedApproach}

def solution():
    """
    Write your solution here
    """
    # Your code goes here
    pass

# Test your solution
if __name__ == "__main__":
    # Add test cases here
    result = solution()
    print(result)`}
                      value={answers[currentQuestion] || ''}
                      onChange={(e) => {
                        setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }));

                        // Track typing activity for real-time monitoring
                        setIsTyping(true);
                        setLastTypingTime(Date.now());

                        // Clear typing status after 2 seconds of inactivity
                        setTimeout(() => setIsTyping(false), 2000);

                        // Log significant coding milestones
                        const codeLength = e.target.value.length;
                        const currentTime = Math.floor((Date.now() - startTime) / 1000);

                        if (codeLength > 0 && codeLength % 100 === 0) {
                          setSimulationLog(prev => [...prev, `[${currentTime}s] 💻 ${codeLength} characters written`]);
                        }

                        if (e.target.value.includes('def ') && !answers[currentQuestion]?.includes('def ')) {
                          setSimulationLog(prev => [...prev, `[${currentTime}s] 🔧 Function definition started`]);
                        }

                        if (e.target.value.includes('return') && !answers[currentQuestion]?.includes('return')) {
                          setSimulationLog(prev => [...prev, `[${currentTime}s] ↩️ Return statement added`]);
                        }
                      }}
                      className="w-full h-96 bg-transparent text-green-400 font-mono border-none resize-none focus:outline-none focus:ring-0 text-sm p-4"
                      style={{
                        lineHeight: '1.5',
                        tabSize: 4,
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        backgroundColor: 'transparent'
                      }}
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                    />
                  </div>
                </div>

                {/* Code Stats */}
                <div className="bg-slate-800 px-4 py-2 border-t border-slate-700">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center space-x-4">
                      <span>Python</span>
                      <span>UTF-8</span>
                      <span>Spaces: 4</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      {answers[currentQuestion] && answers[currentQuestion].length > 50 && (
                        <span className="text-green-400">✓ Code written</span>
                      )}
                      {answers[currentQuestion] && answers[currentQuestion].includes('def ') && (
                        <span className="text-blue-400">✓ Function defined</span>
                      )}
                      {answers[currentQuestion] && answers[currentQuestion].includes('return') && (
                        <span className="text-purple-400">✓ Return statement</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress and Navigation */}
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Question {currentQuestion + 1} of {questions.length}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {Object.keys(answers).length} answered
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-3">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                  ></div>
                </div>

                {/* Question Navigation */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {questions.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentQuestion(index)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${index === currentQuestion
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg'
                        : answers[index] && answers[index].length > 50
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                      title={`${q.difficulty} - ${q.points} points`}
                    >
                      Q{index + 1}
                      {answers[index] && answers[index].length > 50 && (
                        <span className="ml-1">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestion === 0}
                  className="flex items-center space-x-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </Button>

                <div className="flex items-center space-x-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAnswers(prev => ({ ...prev, [currentQuestion]: '' }));
                      setSimulationLog(prev => [...prev, `[${Math.floor((Date.now() - startTime) / 1000)}s] 🗑️ Code cleared for Q${currentQuestion + 1}`]);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Clear Code
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      const template = `def solution():
    """
    ${currentQ.question}
    Expected approach: ${currentQ.expectedApproach}
    """
    # Write your solution here
    pass`;
                      setAnswers(prev => ({ ...prev, [currentQuestion]: template }));
                      setSimulationLog(prev => [...prev, `[${Math.floor((Date.now() - startTime) / 1000)}s] 📝 Template loaded for Q${currentQuestion + 1}`]);
                    }}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    Load Template
                  </Button>
                </div>

                {currentQuestion === questions.length - 1 ? (
                  <Button onClick={handleComplete} className="bg-green-500 hover:bg-green-600">
                    Submit Interview
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating Violations Panel */}
      {isStarted && (
        <div className="fixed bottom-4 right-4 z-40">
          <Button
            onClick={() => setShowViolationsPanel(!showViolationsPanel)}
            className="bg-red-500 hover:bg-red-600 text-white shadow-lg"
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            Violations ({criticalViolations.length + warningViolations.length})
          </Button>

          {showViolationsPanel && (
            <Card className="absolute bottom-12 right-0 w-80 max-h-96 bg-white shadow-xl border border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Real-time Violations</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowViolationsPanel(false)}
                    className="h-6 w-6 p-0"
                  >
                    ×
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-64 overflow-y-auto">
                {criticalViolations.length === 0 && warningViolations.length === 0 ? (
                  <div className="text-center text-green-600 text-sm py-4">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      ✓
                    </div>
                    No violations detected
                  </div>
                ) : (
                  <>
                    {criticalViolations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-red-600 text-sm flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Critical ({criticalViolations.length})
                        </h4>
                        <div className="space-y-1">
                          {criticalViolations.slice(-3).map((violation, index) => (
                            <div key={index} className="text-xs bg-red-50 text-red-700 p-2 rounded border border-red-200">
                              {violation}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {warningViolations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-yellow-600 text-sm flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Warnings ({warningViolations.length})
                        </h4>
                        <div className="space-y-1">
                          {warningViolations.slice(-3).map((violation, index) => (
                            <div key={index} className="text-xs bg-yellow-50 text-yellow-700 p-2 rounded border border-yellow-200">
                              {violation}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      {showExitConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 bg-white">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">Leave Interview?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 text-center">
                You have answered {Object.keys(answers).length} questions.
                Are you sure you want to leave? Your progress will be lost.
              </p>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={handleCancelExit}
                  className="flex-1"
                >
                  Continue Interview
                </Button>
                <Button
                  onClick={handleConfirmExit}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  Leave Interview
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LiveInterview;