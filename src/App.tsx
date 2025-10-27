import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navigation from './components/layout/Navigation';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import ChatsPage from './pages/ChatsPage';
import ChatConversationPage from './pages/ChatConversationPage';
import ProfileView from './components/profile/ProfileView';
import SearchInterface from './components/search/SearchInterface';
import CompatibilityPage from './pages/CompatibilityPage';
import './i18n';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <OnboardingPage />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Navigation - hidden on mobile for main content */}
      <div className="hidden md:block">
        <Navigation />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col pb-20 md:pb-0">
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/search" element={<SearchInterface />} />
          <Route path="/compatibility" element={<CompatibilityPage />} />
          <Route path="/" element={<Navigate to="/chat" replace />} />
        </Routes>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <Navigation />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;