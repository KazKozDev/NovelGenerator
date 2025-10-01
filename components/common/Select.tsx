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
        <label className="block text-sm font-medium text-sky-300 mb-1">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-3 py-2 rounded-md
          bg-slate-700 border border-slate-600
          text-slate-100
          focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {helperText && !error && (
        <p className="text-xs text-slate-400 mt-1">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
};
