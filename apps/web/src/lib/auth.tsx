'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// ============================================
// Types
// ============================================

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string) => void;
  logout: () => void;
}

// ============================================
// Mock Auth Context
// ============================================

const AuthContext = createContext<AuthContextType | null>(null);

// Default demo user (matches seeded database user)
const DEMO_USER: User = {
  id: '91b4d85d-1b51-4a7b-8470-818b75979913',
  email: 'demo@twin.dev',
};

const STORAGE_KEY = 'twin-auth';

// ============================================
// Auth Provider
// ============================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (email: string) => {
    const newUser: User = {
      id: `user-${Date.now()}`,
      email,
    };
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      // In a real app, redirect to login
      // For now, auto-login with demo user
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_USER));
        window.location.reload();
      }
    }
  }, [user, isLoading]);

  return { user, isLoading };
}

export function useUserId(): string {
  const { user } = useAuth();
  // Return demo user ID if not logged in (for development)
  return user?.id || DEMO_USER.id;
}
