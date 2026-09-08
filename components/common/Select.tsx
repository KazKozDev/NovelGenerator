import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select: React.FC<SelectProps> = ({ 
  label, 
  error, 
  helperText, 
  className = '', 
  children,
  ...props 
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold uppercaser text-zinc-300 mb-1">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-3 py-2 rounded
          bg-zinc-900 border border-zinc-700/80
          text-zinc-100 text-sm
          focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {helperText && (
        <p className="text-xs text-zinc-400 mt-1">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
};
