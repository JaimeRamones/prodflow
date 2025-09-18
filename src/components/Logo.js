// Ruta: src/components/Logo.js

import React from 'react';

const Logo = ({ 
  size = "default", 
  showText = true, 
  className = "",
  textColor = "text-white" 
}) => {
  const sizeClasses = {
    small: "h-8 w-8",
    default: "h-10 w-10", 
    large: "h-12 w-12",
    xl: "h-16 w-16"
  };

  const textSizeClasses = {
    small: "text-lg",
    default: "text-xl",
    large: "text-2xl", 
    xl: "text-3xl"
  };
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src="/logo.svg" 
        alt="ProdFlow Logo" 
        className={`${sizeClasses[size]} object-contain`}
      />
      {showText && (
        <span className={`font-bold ${textSizeClasses[size]} ${textColor} tracking-tight`}>
          ProdFlow
        </span>
      )}
    </div>
  );
};

export default Logo;