import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) => {
  const baseStyles = "font-medium rounded-sm focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-zinc-900 transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";
  
  const variantStyles = {
    primary: 'bg-zinc-100 hover:bg-white text-zinc-900 focus:ring-zinc-400 border border-zinc-200',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 focus:ring-zinc-500',
    danger: 'bg-red-950/60 hover:bg-red-900/60 text-red-200 border border-red-800/80 focus:ring-red-500',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
