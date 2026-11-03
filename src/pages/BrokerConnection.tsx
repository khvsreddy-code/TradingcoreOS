import React from 'react';
import { BrokerConnectionRequiredPage } from './BrokerConnectionRequiredPage';
import { useAuth } from '../auth/hooks/useAuth';

interface BrokerConnectionProps {
  onCompleteOnboarding?: () => void;
  onLogout?: () => void;
}

export const BrokerConnection: React.FC<BrokerConnectionProps> = ({
  onCompleteOnboarding,
  onLogout,
}) => {
  const { user, logout } = useAuth();
  return (
    <BrokerConnectionRequiredPage
      userEmail={user?.email ?? null}
      onLogout={onLogout ?? (() => { void logout(); })}
      onBack={() => window.history.back()}
      onBrokerConnected={() => {
        if (onCompleteOnboarding) {
          onCompleteOnboarding();
        }
      }}
    />
  );
};

export default BrokerConnection;
