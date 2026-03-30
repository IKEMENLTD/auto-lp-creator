/**
 * アプリケーションルート
 *
 * パスワード認証ゲート + Dashboard。
 * 認証状態はsessionStorage（タブ閉じでリセット）。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './pages/Dashboard';

const AUTH_KEY = 'app_authenticated';
const TOKEN_KEY = 'app_auth_token';

export const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === 'true') {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json() as { success?: boolean; error?: string; token?: string };

      if (data.success) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        if (data.token) {
          sessionStorage.setItem(TOKEN_KEY, data.token);
        }
        setAuthenticated(true);
      } else {
        setError(data.error || 'パスワードが正しくありません');
      }
    } catch {
      setError('サーバーに接続できません');
    } finally {
      setLoading(false);
    }
  }, [password]);

  if (checking) return null;

  if (authenticated) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8"
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-white text-lg font-bold">アクセス認証</h1>
          <p className="text-gray-500 text-sm mt-1">パスワードを入力してください</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          autoFocus
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
        />

        {error && (
          <p className="text-red-400 text-sm mt-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full mt-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg transition-colors"
        >
          {loading ? '確認中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
};
