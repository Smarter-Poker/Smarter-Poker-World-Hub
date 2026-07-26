import React from 'react';

export interface UniversalHeaderProps {
    pageDepth?: number;
    showSearch?: boolean;
    onSearchClick?: () => void;
    onMenuClick?: () => void;
    onSettingsClick?: () => void;
    onBackClick?: () => void;
    hideLeftIcon?: boolean;
}

declare const UniversalHeader: React.FC<UniversalHeaderProps>;
export default UniversalHeader;
