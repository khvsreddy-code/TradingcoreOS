import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DemoModeContextType {
  isDemoMode: boolean;
  connectedBroker: string | null;
  isBrokerModalOpen: boolean;
  brokerModalMessage: string;
  setConnectedBroker: (broker: string | null) => void;
  openBrokerRequiredModal: (customMessage?: string) => void;
  closeBrokerRequiredModal: () => void;
  enableDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export const DemoModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectedBroker, setConnectedBrokerState] = useState<string | null>(null);
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [brokerModalMessage, setBrokerModalMessage] = useState('Connect a broker to execute live trades.');

  const isDemoMode = connectedBroker === null;

  const setConnectedBroker = (broker: string | null) => {
    setConnectedBrokerState(broker);
  };

  const enableDemoMode = () => {
    setConnectedBrokerState(null);
  };

  const openBrokerRequiredModal = (customMessage?: string) => {
    if (customMessage) {
      setBrokerModalMessage(customMessage);
    } else {
      setBrokerModalMessage('Connect a broker to execute live trades.');
    }
    setIsBrokerModalOpen(true);
  };

  const closeBrokerRequiredModal = () => {
    setIsBrokerModalOpen(false);
  };

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        connectedBroker,
        isBrokerModalOpen,
        brokerModalMessage,
        setConnectedBroker,
        openBrokerRequiredModal,
        closeBrokerRequiredModal,
        enableDemoMode,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
};

export const useDemoMode = (): DemoModeContextType => {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return context;
};
