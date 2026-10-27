"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string; hint?: string };

/**
 * Styled replacement for <select> that still submits with the surrounding form (hidden
 * input). Pops up above the trigger when there isn't room below.
 */
export function Dropdown({
  name,
  label,
  options,
  defaultValue = "",
  icon,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search…",
  className = "",
}: {
  name: string;
  label: string;
  options: DropdownOption[];
  defaultValue?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [placeAbove, setPlaceAbove] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(option: DropdownOption) {
    setValue(option.value);
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>("button[data-trigger]")?.focus();
  }

  // Decide whether to open upward based on the space below the trigger.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuHeight = Math.min(320, (searchable ? 56 : 0) + options.length * 40 + 12);
    setPlaceAbove(window.innerHeight - rect.bottom < menuHeight + 16 && rect.top > menuHeight + 16);
  }, [open, options.length, searchable]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    if (searchable) searchRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, searchable]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <button
        type="button"
        data-trigger
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        className={`group flex w-full items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-left transition ${
          open ? "border-brand-500 ring-2 ring-brand-500/15" : "border-zinc-200 hover:border-zinc-300"
        } disabled:cursor-not-allowed disabled:bg-zinc-50`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-zinc-500">{label}</span>
          <span className={`block truncate text-sm font-medium ${disabled ? "text-zinc-400" : "text-zinc-900"}`}>
            {selected?.label}
          </span>
        </span>
        {icon ?? (
          <svg
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180 text-brand-600" : ""}`}
            fill="currentColor"
            aria-hidden
          >
            <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className={`absolute left-0 z-50 w-full min-w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-black/15 ring-1 ring-black/5 ${
            placeAbove ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
          } animate-[dropdown-in_120ms_ease-out]`}
        >
          {searchable && (
            <div className="border-b border-zinc-100 p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:bg-zinc-100"
              />
            </div>
          )}
          <ul ref={listRef} id={`${id}-list`} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 && <li className="px-3 py-2.5 text-sm text-zinc-400">No matches</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value || "__any"}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                    i === active ? "bg-brand-50" : ""
                  } ${isSelected ? "font-semibold text-brand-700" : "text-zinc-700"}`}
                >
                  <span className="truncate">
                    {o.label}
                    {o.hint && <span className="ml-1.5 text-xs font-normal text-zinc-400">{o.hint}</span>}
                  </span>
                  {isSelected && (
                    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-brand-600" fill="currentColor" aria-hidden>
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
