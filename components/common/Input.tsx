import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className = '', ...props }) => {
  const baseStyles = "block w-full p-2.5 border rounded-md shadow-sm text-sm text-slate-100 placeholder-slate-400 bg-slate-700 border-slate-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-70 disabled:bg-slate-800";
  
  return (
    <input
      className={`${baseStyles} ${className}`}
      {...props}
    />
  );
};
