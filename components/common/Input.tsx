import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className = '', ...props }) => {
  const baseStyles = "block w-full h-9 px-3 border rounded text-xs text-zinc-100 placeholder-zinc-500 bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 focus:border-zinc-500 focus:outline-none disabled:opacity-50 disabled:bg-zinc-800 transition-colors";
  
  return (
    <input
      className={`${baseStyles} ${className}`}
      {...props}
    />
  );
};
