import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { Card } from '@/components/ui/card';

const MobileProctor = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const [status, setStatus] = useState('Initializing...');
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('Invalid session link.');
      return;
    }

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setStatus('Connecting to laptop...');
        
        // Setup Peer
        const peer = new Peer(`${sessionId}-mobile`);
        peerRef.current = peer;

        peer.on('open', () => {
          setStatus('Calling laptop...');
          const call = peer.call(`${sessionId}-laptop`, stream);
          
          call.on('close', () => {
            setStatus('Call ended.');
          });
          
          call.on('error', (err) => {
            setStatus(`Call error: ${err.message}`);
          });

          setStatus('Connected and streaming.');
        });
        
        peer.on('error', (err) => {
          setStatus(`Connection error: ${err.type}`);
          console.error(err);
        });
      } catch (err) {
        setStatus('Camera access denied or unavailable.');
        console.error(err);
      }
    };

    initCamera();

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 bg-zinc-900 text-white border-zinc-800">
        <h2 className="text-xl font-semibold mb-4 text-center">Mobile Proctoring</h2>
        <p className="text-center mb-4 text-zinc-400">{status}</p>
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
        <p className="text-xs text-center mt-4 text-zinc-500">
          Please keep this phone positioned to view your screen and workspace. Do not lock your phone or close this tab.
        </p>
      </Card>
    </div>
  );
};

export default MobileProctor;
