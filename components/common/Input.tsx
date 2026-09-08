import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className = '', ...props }) => {
  const baseStyles = "block w-full p-2.5 border rounded-sm text-sm text-zinc-100 placeholder-zinc-500 bg-zinc-900 border-zinc-700/80 focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 disabled:opacity-50 disabled:bg-zinc-800 transition-colors";
  
  return (
    <input
      className={`${baseStyles} ${className}`}
      {...props}
    />
  );
};
