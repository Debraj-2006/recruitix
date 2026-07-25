import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Peer from 'peerjs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Laptop, Smartphone, MonitorUp, Mic, CheckCircle2, AlertCircle } from 'lucide-react';
import { proctoringEngine, ProctoringConfig } from '@/utils/proctoringEngine';

interface ProctoringSetupProps {
  sessionId: string;
  userId: string;
  onComplete: () => void;
}

export const ProctoringSetup: React.FC<ProctoringSetupProps> = ({ sessionId, userId, onComplete }) => {
  const [permissions, setPermissions] = useState({
    camera: false,
    mic: false,
    screen: false,
    mobile: false
  });
  const [error, setError] = useState<string | null>(null);

  const laptopVideoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const peerRef = useRef<Peer | null>(null);

  const mobileUrl = `${window.location.origin}/mobile-proctor?session=${sessionId}`;

  const requestLaptopMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (laptopVideoRef.current) {
        laptopVideoRef.current.srcObject = stream;
      }
      
      const audioStream = new MediaStream(stream.getAudioTracks());
      micStreamRef.current = audioStream;

      setPermissions(prev => ({ ...prev, camera: true, mic: true }));
      setError(null);
    } catch (err) {
      console.error('Camera/Mic error:', err);
      setError('Please allow Camera and Microphone permissions.');
    }
  };

  const requestScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setPermissions(prev => ({ ...prev, screen: true }));
      setError(null);
    } catch (err) {
      console.error('Screen share error:', err);
      setError('Please share your entire screen.');
    }
  };

  useEffect(() => {
    // Setup Peer for receiving mobile stream
    const peer = new Peer(`${sessionId}-laptop`);
    peerRef.current = peer;

    peer.on('open', () => {
      console.log('Laptop Peer server listening...');
    });

    peer.on('call', (call) => {
      call.answer(); // Answer the call with no stream
      call.on('stream', (remoteStream) => {
        if (mobileVideoRef.current) {
          mobileVideoRef.current.srcObject = remoteStream;
          setPermissions(prev => ({ ...prev, mobile: true }));
        }
      });
      call.on('close', () => {
        setPermissions(prev => ({ ...prev, mobile: false }));
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
    });

    return () => {
      peer.destroy();
    };
  }, [sessionId]);

  const handleStartExam = async () => {
    // Initialize Proctoring Engine
    const config: ProctoringConfig = {
      sessionId,
      userId,
      laptopVideo: laptopVideoRef.current,
      mobileVideo: mobileVideoRef.current,
      screenStream: screenStreamRef.current,
      micStream: micStreamRef.current,
    };
    
    await proctoringEngine.init(config);
    proctoringEngine.start();
    onComplete();
  };

  const allReady = permissions.camera && permissions.mic && permissions.screen && permissions.mobile;

  return (
    <Card className="w-full max-w-4xl mx-auto my-8 bg-zinc-950 text-white border-zinc-800">
      <CardHeader className="text-center border-b border-zinc-800 pb-6">
        <CardTitle className="text-2xl">Exam Environment Setup</CardTitle>
        <CardDescription className="text-zinc-400">
          Please complete all checks to verify your testing environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 grid md:grid-cols-2 gap-8">
        
        {/* Left Side: Device Checks */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Laptop className="w-5 h-5" /> 1. Laptop Permissions
            </h3>
            <Button 
              variant={permissions.camera && permissions.mic ? "secondary" : "default"} 
              className="w-full justify-start gap-4" 
              onClick={requestLaptopMedia}
            >
              <Mic className="w-4 h-4" /> 
              {permissions.camera && permissions.mic ? 'Camera & Mic Granted' : 'Allow Camera & Microphone'}
              {permissions.camera && permissions.mic && <CheckCircle2 className="w-4 h-4 ml-auto text-green-500" />}
            </Button>
            
            <Button 
              variant={permissions.screen ? "secondary" : "default"} 
              className="w-full justify-start gap-4" 
              onClick={requestScreenShare}
            >
              <MonitorUp className="w-4 h-4" /> 
              {permissions.screen ? 'Screen Share Active' : 'Share Screen'}
              {permissions.screen && <CheckCircle2 className="w-4 h-4 ml-auto text-green-500" />}
            </Button>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Smartphone className="w-5 h-5" /> 2. Secondary Camera
            </h3>
            <p className="text-sm text-zinc-400">Scan this QR code with your mobile phone and position it to view your workspace.</p>
            
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <QRCodeSVG value={mobileUrl} size={150} />
            </div>
            
            <div className={`p-3 rounded flex items-center gap-3 ${permissions.mobile ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              {permissions.mobile ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="text-sm font-medium">
                {permissions.mobile ? 'Mobile camera connected' : 'Waiting for mobile connection...'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Previews */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg mb-2">Camera Previews</h3>
          
          <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
            <video
              ref={laptopVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!permissions.camera && <span className="text-zinc-600 text-sm font-medium">Laptop Camera Offline</span>}
          </div>

          <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
            <video
              ref={mobileVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!permissions.mobile && <span className="text-zinc-600 text-sm font-medium">Mobile Camera Offline</span>}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-sm mt-4">
              {error}
            </div>
          )}

          <div className="pt-6">
            <Button 
              size="lg" 
              className="w-full font-bold bg-blue-600 hover:bg-blue-700 text-white" 
              disabled={!allReady}
              onClick={handleStartExam}
            >
              Begin Exam
            </Button>
            {!allReady && <p className="text-xs text-center mt-2 text-zinc-500">Please complete all steps to continue.</p>}
          </div>
        </div>

      </CardContent>
    </Card>
  );
};
