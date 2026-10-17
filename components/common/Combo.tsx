import React, { useEffect, useRef, useState } from 'react';
import { Input } from './Input';

export interface ComboOption { value: string; label?: string }

/**
 * A field a person may type in, with a list of choices under it. Opened, it shows the whole list,
 * whatever is in the field: a list that narrows to what is already there shows only the choice
 * already made. It narrows only to what is typed after it was opened, which is how a long list
 * of models is searched. With no choices to show it is a plain field.
 */
export const Combo: React.FC<{ id: string; value: string; onChange: (value: string) => void; options: ComboOption[]; placeholder?: string; className?: string; selectionOnly?: boolean }> = ({ id, value, onChange, options, placeholder, className = '', selectionOnly = false }) => {
  const [open, setOpen] = useState(false);
  // Whether the person has typed since the list was opened: only then does the list follow the text.
  const [typed, setTyped] = useState(false);
  const show = () => { if (!open) setTyped(false); setOpen(true); };
  const sought = value.trim().toLowerCase();
  const narrowed = !selectionOnly && typed && sought ? options.filter(option => `${option.value} ${option.label || ''}`.toLowerCase().includes(sought)) : options;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Input id={id} type="text" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off" readOnly={selectionOnly} aria-autocomplete={selectionOnly?'none':'list'} value={selectionOnly?(options.find(option=>option.value===value)?.label||value):value} placeholder={placeholder}
        onChange={event => { onChange(event.target.value); setTyped(true); setOpen(true); }} onFocus={show} onClick={show}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) show(); else box.current?.querySelector<HTMLButtonElement>('[role=option] button')?.focus(); } else if (event.key === 'Enter') { event.preventDefault(); setOpen(!open); } else if (event.key === 'Escape' || event.key === 'Tab') setOpen(false); }}
        className={`pr-8 ${selectionOnly?'cursor-pointer':''} ${className}`} />
      {options.length > 0 && <button type="button" tabIndex={-1} aria-label="Show choices" onClick={() => { if (open) setOpen(false); else show(); }} className="absolute inset-y-0 right-0 w-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8l5 5 5-5" /></svg>
      </button>}
      {open && narrowed.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded border border-zinc-700/80 bg-zinc-900 light:bg-white light:border-zinc-300 shadow-xl py-1">
          {narrowed.map(option => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              {/* mousedown, so the choice is taken before the field loses focus */}
              <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.value); box.current?.querySelector<HTMLInputElement>('input')?.focus(); setOpen(false); }}
                onKeyDown={event=>{if(event.key==='Escape'){box.current?.querySelector<HTMLInputElement>('input')?.focus();setOpen(false);}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const row=event.currentTarget.closest('li');const next=event.key==='ArrowDown'?row?.nextElementSibling:row?.previousElementSibling;next?.querySelector<HTMLButtonElement>('button')?.focus();}}}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-baseline gap-2 hover:bg-zinc-800 light:hover:bg-zinc-100 ${option.value === value ? 'bg-zinc-800/70 light:bg-zinc-100' : ''}`}>
                <span className="font-mono text-zinc-200 light:text-zinc-900 shrink-0">{selectionOnly?(option.label||option.value):option.value}</span>
                {!selectionOnly && option.label && <span className="text-zinc-500 truncate">{option.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
