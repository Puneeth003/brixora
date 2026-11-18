"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string; hint?: string; disabled?: boolean; group?: string };

/**
 * Styled replacement for <select>: use it for every choice list (never a bare <select>).
 * Submits with the surrounding form through a hidden input, and pops up above the
 * trigger when there isn't room below.
 *
 * - variant "floating" (default): the label sits inside the trigger (search filters).
 * - variant "field": looks like an `.input`; put a <label htmlFor={id}> above it.
 * - Uncontrolled with `defaultValue`, or controlled with `value` + `onChange`.
 * - `submitOnChange` submits the surrounding form after a choice (GET filter bars).
 * - `required` blocks form submission while nothing (empty value) is chosen.
 */
export function Dropdown({
  name,
  label,
  options,
  defaultValue = "",
  value: controlled,
  onChange,
  id: idProp,
  variant = "floating",
  placeholder,
  required = false,
  submitOnChange = false,
  form,
  icon,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search…",
  className = "",
  buttonClassName = "",
}: {
  name?: string;
  label: string;
  options: DropdownOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  variant?: "floating" | "field";
  placeholder?: string;
  required?: boolean;
  submitOnChange?: boolean;
  form?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [placeAbove, setPlaceAbove] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // With a placeholder, an unmatched value shows the placeholder instead of the first option,
  // and submits nothing rather than a value the list doesn't offer.
  const matched = options.find((o) => o.value === value);
  const selected = matched ?? (placeholder ? undefined : options[0]);
  const submitted = selected?.value ?? "";

  // form.reset() puts an uncontrolled dropdown back to its default, like a native <select>.
  useEffect(() => {
    if (controlled !== undefined) return;
    const formEl = rootRef.current?.closest("form") ?? (form ? (document.getElementById(form) as HTMLFormElement | null) : null);
    if (!formEl) return;
    const onReset = () => setOwn(defaultValue);
    formEl.addEventListener("reset", onReset);
    return () => formEl.removeEventListener("reset", onReset);
  }, [controlled, defaultValue, form]);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(option: DropdownOption) {
    if (option.disabled) return;
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>("button[data-trigger]")?.focus();
    if (option.value === value) return;
    setOwn(option.value);
    onChange?.(option.value);
    if (submitOnChange) {
      // Let the hidden input pick up the new value before submitting.
      const formEl = rootRef.current?.closest("form") ?? (form ? document.getElementById(form) : null);
      setTimeout(() => (formEl as HTMLFormElement | null)?.requestSubmit(), 0);
    }
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
      {name && <input type="hidden" name={name} value={submitted} disabled={disabled} form={form} />}
      {required && (
        // Native "please choose" validation, anchored to the dropdown.
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={submitted}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            openMenu();
          }}
          form={form}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      )}
      <button
        type="button"
        id={id}
        data-trigger
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? placeholder ?? ""}`}
        className={
          variant === "field"
            ? `input flex items-center gap-2 text-left ${open ? "border-[var(--brand,#0e5e44)]" : ""} disabled:cursor-not-allowed disabled:opacity-70 ${buttonClassName}`
            : `group flex w-full items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-left transition ${
                open ? "border-brand-500 ring-2 ring-brand-500/15" : "border-zinc-200 hover:border-zinc-300"
              } disabled:cursor-not-allowed disabled:bg-zinc-50 ${buttonClassName}`
        }
      >
        {variant === "field" ? (
          <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-zinc-400"}`}>{selected?.label ?? placeholder ?? "Choose…"}</span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-zinc-500">{label}</span>
            <span className={`block truncate text-sm font-medium ${disabled ? "text-zinc-400" : selected ? "text-zinc-900" : "text-zinc-400"}`}>
              {selected?.label ?? placeholder}
            </span>
          </span>
        )}
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
              const heading = o.group && o.group !== filtered[i - 1]?.group ? o.group : null;
              return (
                <Fragment key={o.value || "__any"}>
                {heading && (
                  <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                    {heading}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  data-index={i}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                    o.disabled ? "cursor-not-allowed text-zinc-300" : "cursor-pointer"
                  } ${i === active && !o.disabled ? "bg-brand-50" : ""} ${isSelected ? "font-semibold text-brand-700" : o.disabled ? "" : "text-zinc-700"}`}
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
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
