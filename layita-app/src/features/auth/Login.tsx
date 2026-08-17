// src/features/auth/Login.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuth } from './useAuth';
import logo from '../../assets/layitalogosvg.svg';
import '../../styles/auth.css';

const Login = () => {
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && session) return <Navigate to="/map" replace />;

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero" aria-label="Layita introduction">
        <img src={logo} alt="Layita Logo" className="auth-logo" />
        <h1>Welcome to Layita ECDC Network</h1>
        <p>Connecting and supporting early childhood development centers.</p>
      </section>

      <main className="auth-panel">
        <div className="auth-card">
          <h2>Login to your account</h2>
          <form onSubmit={handleLogin}>
            <div className="auth-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>

            {error && <p className="auth-error">{error}</p>}
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
