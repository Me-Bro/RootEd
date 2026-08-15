import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const COLOR_PRESETS = [
  { name: 'Brand', primary: 'oklch(0.488 0.243 264.376)', fg: 'oklch(0.985 0 0)' },
  { name: 'Black', primary: 'oklch(0.205 0 0)', fg: 'oklch(0.985 0 0)' },
  { name: 'Blue', primary: 'oklch(0.588 0.198 248)', fg: 'oklch(0.985 0 0)' },
  { name: 'Red', primary: 'oklch(0.528 0.196 27)', fg: 'oklch(0.985 0 0)' },
  { name: 'Green', primary: 'oklch(0.648 0.175 145)', fg: 'oklch(0.985 0 0)' },
  { name: 'Purple', primary: 'oklch(0.545 0.218 295)', fg: 'oklch(0.985 0 0)' },
  { name: 'Orange', primary: 'oklch(0.698 0.165 55)', fg: 'oklch(0.985 0 0)' },
  { name: 'Pink', primary: 'oklch(0.658 0.188 350)', fg: 'oklch(0.985 0 0)' },
];

const FONT_OPTIONS = [
  { label: 'Geist', value: "'Geist Variable', system-ui, sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
];

const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16];

const STORAGE_KEY = 'theme-config';

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_CONFIG = {
  primaryColor: 'oklch(0.488 0.243 264.376)',
  primaryFg: 'oklch(0.985 0 0)',
  borderRadius: 0.625,
  fontFamily: "'Geist Variable', system-ui, sans-serif",
  fontSize: 14,
};

// eslint-disable-next-line react-refresh/only-export-components
export function applyThemeConfig(config) {
  const root = document.documentElement;
  root.style.setProperty('--primary', config.primaryColor);
  root.style.setProperty('--primary-foreground', config.primaryFg);
  root.style.setProperty('--sidebar-primary', config.primaryColor);
  root.style.setProperty('--sidebar-primary-foreground', config.primaryFg);
  root.style.setProperty('--ring', config.primaryColor);
  root.style.setProperty('--sidebar-ring', config.primaryColor);
  root.style.setProperty('--radius', `${config.borderRadius}rem`);
  root.style.setProperty('--theme-font-family', config.fontFamily);
  root.style.setProperty('--theme-font-size-base', `${config.fontSize}px`);
}

// eslint-disable-next-line react-refresh/only-export-components
export function loadPersistedTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Migrate: old default was black primary, clear so brand purple takes effect
    if (saved.primaryColor === 'oklch(0.205 0 0)') {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    applyThemeConfig(saved);
  } catch {
    /* ignore corrupt data */
  }
}

export function ThemeConfiguratorTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="Theme settings"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <ThemeConfigurator open={open} onOpenChange={setOpen} />
    </>
  );
}

function ThemeConfigurator({ open, onOpenChange }) {
  const { resolvedTheme, setTheme } = useTheme();

  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  useEffect(() => {
    applyThemeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  function set(updates) {
    setConfig((prev) => ({ ...prev, ...updates }));
  }

  function reset() {
    setConfig(DEFAULT_CONFIG);
    applyThemeConfig(DEFAULT_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Theme Settings</SheetTitle>
          <SheetDescription>Customize colors, typography, and radius.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          {/* Primary Color */}
          <div className="flex flex-col gap-3">
            <Label>Primary Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  title={preset.name}
                  onClick={() => set({ primaryColor: preset.primary, primaryFg: preset.fg })}
                  className={cn(
                    'h-8 w-full rounded-md border-2 transition-all',
                    config.primaryColor === preset.primary
                      ? 'border-foreground scale-110 shadow-sm'
                      : 'border-transparent hover:border-muted-foreground'
                  )}
                  style={{ backgroundColor: preset.primary }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Active:{' '}
              {COLOR_PRESETS.find((p) => p.primary === config.primaryColor)?.name ?? 'Custom'}
            </p>
          </div>

          {/* Border Radius */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Border Radius</Label>
              <span className="text-xs text-muted-foreground">{config.borderRadius}rem</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.125}
              value={config.borderRadius}
              onChange={(e) => set({ borderRadius: parseFloat(e.target.value) })}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>None</span>
              <span>Rounded</span>
              <span>Pill</span>
            </div>
          </div>

          {/* Font Family */}
          <div className="flex flex-col gap-2">
            <Label>Font Family</Label>
            <div className="flex flex-col gap-1">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set({ fontFamily: opt.value })}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm text-left transition-colors',
                    config.fontFamily === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'
                  )}
                  style={{ fontFamily: opt.value }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="flex flex-col gap-2">
            <Label>Font Size</Label>
            <div className="flex gap-2">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => set({ fontSize: size })}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-sm transition-colors border',
                    config.fontSize === size
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted text-foreground'
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between">
            <Label>Dark Mode</Label>
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                resolvedTheme === 'dark' ? 'bg-primary' : 'bg-muted'
              )}
              aria-label="Toggle dark mode"
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  resolvedTheme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={reset} className="w-full">
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
