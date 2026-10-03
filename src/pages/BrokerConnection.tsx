import React from 'react';
import { BrokerConnectionRequiredPage } from './BrokerConnectionRequiredPage';

interface BrokerConnectionProps {
  onCompleteOnboarding?: () => void;
  onLogout?: () => void;
}

export const BrokerConnection: React.FC<BrokerConnectionProps> = ({
  onCompleteOnboarding,
}) => {
  return (
    <BrokerConnectionRequiredPage
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
