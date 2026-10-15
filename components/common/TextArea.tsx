import React from 'react';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const TextArea: React.FC<TextAreaProps> = ({ className = '', ...props }) => {
  const baseStyles = "block w-full p-3 border rounded text-xs leading-relaxed text-zinc-100 placeholder-zinc-500 bg-zinc-950 border-zinc-800 hover:border-zinc-700 focus:border-zinc-500 focus:outline-none disabled:opacity-50 disabled:bg-zinc-800 transition-colors";
  
  return (
    <textarea
      className={`${baseStyles} ${className}`}
      {...props}
    />
  );
};
