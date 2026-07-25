import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export interface ActiveUser {
  uid: string;
  email: string;
  displayName?: string;
  userType: 'candidate' | 'recruiter';
  status: 'active' | 'inactive';
  loginTime: Timestamp | null;
  lastActivity: Timestamp | null;
  currentPage?: string;
  deviceInfo?: string;
  biometricId?: string;
  timeSinceLogin?: string;
  timeSinceActivity?: string;
}

export const useRealtimeUsers = (userType?: 'candidate' | 'recruiter') => {
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const usersCollection = collection(db, 'userActivity');
      let q;

      if (userType) {
        q = query(usersCollection, where('userType', '==', userType));
      } else {
        q = query(usersCollection, where('status', '==', 'active'));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userData: ActiveUser[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            uid: data.uid,
            email: data.email,
            displayName: data.displayName,
            userType: data.userType,
            status: data.status,
            loginTime: data.loginTime,
            lastActivity: data.lastActivity,
            currentPage: data.currentPage,
            deviceInfo: data.deviceInfo,
            biometricId: data.biometricId,
            timeSinceLogin: calculateTimeDifference(data.loginTime),
            timeSinceActivity: calculateTimeDifference(data.lastActivity),
          };
        });

        setUsers(userData);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  }, [userType]);

  return { users, loading, error };
};

export const useActiveUserCount = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const q = query(
        collection(db, 'userActivity'),
        where('status', '==', 'active')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCount(snapshot.docs.length);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      setLoading(false);
    }
  }, []);

  return { count, loading };
};

const calculateTimeDifference = (timestamp: Timestamp | null): string => {
  if (!timestamp) return 'N/A';

  const now = new Date();
  const then = timestamp.toDate();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

export interface ExamViolation {
  id: string;
  sessionId: string;
  userId: string;
  type: string;
  message: string;
  timestamp: Timestamp | null;
}

export const useExamViolations = () => {
  const [violations, setViolations] = useState<ExamViolation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const q = query(collection(db, 'exam_violations'));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const viols: ExamViolation[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ExamViolation));
        
        // Sort by timestamp descending
        viols.sort((a, b) => {
          const tA = a.timestamp?.toMillis() || 0;
          const tB = b.timestamp?.toMillis() || 0;
          return tB - tA;
        });
        
        setViolations(viols);
        setLoading(false);
      });
      
      return () => unsubscribe();
    } catch (err) {
      setLoading(false);
    }
  }, []);

  return { violations, loading };
};
