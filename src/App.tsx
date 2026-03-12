/**
 * アプリケーションルート
 *
 * 1画面構成。ルーティング不要。
 */

import React from 'react';
import { Dashboard } from './pages/Dashboard';

export const App: React.FC = () => {
  return <Dashboard />;
};
