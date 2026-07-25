import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MonitorUp, Mic, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

interface DeviceSetupGateProps {
  onReady: (streams: { screenStream: MediaStream; micStream: MediaStream }) => void;
  onCancel: () => void;
}

/**
 * Mandatory pre-exam gate (mirrors ExamFaceGate's strictness): candidate must grant screen
 * share and microphone access before the exam can start. Both streams are handed up via
 * onReady rather than stopped here, since ExamRunner needs them alive for the whole exam.
 */
const DeviceSetupGate = ({ onReady, onCancel }: DeviceSetupGateProps) => {
  const [screenGranted, setScreenGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [notFullScreen, setNotFullScreen] = useState(false);
  const [error, setError] = useState('');

  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  // Flips true right before onReady hands the streams off to the parent — after that, this
  // component must not stop them on unmount since ExamRunner becomes their owner.
  const handedOffRef = useRef(false);

  useEffect(() => {
    return () => {
      if (handedOffRef.current) return;
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const requestScreenShare = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setNotFullScreen(settings?.displaySurface !== undefined && settings.displaySurface !== 'monitor');
      setScreenGranted(true);
    } catch {
      setError('Please share your screen to continue — this is required for the exam.');
    }
  };

  const requestMic = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicGranted(true);
    } catch {
      setError('Please allow microphone access to continue — this is required for the exam.');
    }
  };

  const handleContinue = () => {
    if (!screenStreamRef.current || !micStreamRef.current) return;
    handedOffRef.current = true;
    onReady({ screenStream: screenStreamRef.current, micStream: micStreamRef.current });
  };

  const allReady = screenGranted && micGranted;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-2xl text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" /> Exam Environment Setup
          </CardTitle>
          <CardDescription className="text-slate-300">
            Screen sharing and microphone access are monitored continuously throughout the exam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant={screenGranted ? 'secondary' : 'default'}
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={requestScreenShare}
          >
            <MonitorUp className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{screenGranted ? 'Screen Share Active' : 'Share Your Entire Screen'}</span>
            {screenGranted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          </Button>

          {notFullScreen && (
            <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                It looks like you shared a tab or window rather than your entire screen. Please redo this and choose
                "Entire Screen".
              </p>
            </div>
          )}

          <Button
            variant={micGranted ? 'secondary' : 'default'}
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={requestMic}
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{micGranted ? 'Microphone Granted' : 'Allow Microphone Access'}</span>
            {micGranted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          </Button>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <Button
            onClick={handleContinue}
            disabled={!allReady}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg"
          >
            Continue to Exam
          </Button>
          {!allReady && <p className="text-xs text-center text-slate-500">Complete both steps above to continue.</p>}

          <Button onClick={onCancel} variant="outline" className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800">
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceSetupGate;
