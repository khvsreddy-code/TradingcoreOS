import React from 'react';
import { AuthModal } from '../../auth/components/AuthModal';

interface AuthModalPlaceholderProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchWorkspace?: () => void;
}

export const AuthModalPlaceholder: React.FC<AuthModalPlaceholderProps> = ({
  isOpen,
  onClose,
  onLaunchWorkspace,
}) => {
  return (
    <AuthModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onLaunchWorkspace}
    />
  );
};
