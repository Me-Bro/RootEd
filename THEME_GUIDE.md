# Material Shadcn — Theme & UI System Guide

Portable reference for replicating this design system in another project.

---

## Stack

| Layer | Library | Version |
|---|---|---|
| Components | shadcn/ui (new-york style) | latest |
| Primitives | Radix UI (13+ packages) | latest |
| Styling | TailwindCSS | 3.4.17 |
| Dark Mode | next-themes | 0.4.6 |
| Animations | Framer Motion | 11.13.1 |
| Charts | Recharts | 2.15.2 |
| Icons | Lucide React | 0.453.0 |
| Variants | Class Variance Authority (CVA) | latest |
| Class Merge | tailwind-merge + clsx | latest |
| Forms | React Hook Form + Zod | latest |

---

## Core Config Files to Copy

```
tailwind.config.ts      → project root
components.json         → project root
postcss.config.js       → project root
client/src/index.css    → your src/index.css or globals.css
client/src/lib/utils.ts → your src/lib/utils.ts  (cn() helper)
```

---

## 1. CSS Variables — Full Theme

Paste into your `globals.css` or `index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 97%;
    --foreground: 20 14.3% 4.1%;

    --muted: 60 4.8% 95.9%;
    --muted-foreground: 25 5.3% 44.7%;

    --popover: 0 0% 100%;
    --popover-foreground: 20 14.3% 4.1%;

    --card: 0 0% 100%;
    --card-foreground: 20 14.3% 4.1%;

    --border: 214 32% 91%;
    --input: 214 32% 91%;

    --primary: 0 0% 0%;
    --primary-foreground: 0 0% 100%;

    --secondary: 60 4.8% 95.9%;
    --secondary-foreground: 24 9.8% 10%;

    --accent: 60 4.8% 95.9%;
    --accent-foreground: 24 9.8% 10%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 60 9.1% 97.8%;

    --ring: 0 0% 0%;
    --radius: 0.75rem;

    /* Sidebar */
    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 20 14.3% 4.1%;
    --sidebar-primary: 0 0% 0%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 60 4.8% 95.9%;
    --sidebar-accent-foreground: 24 9.8% 10%;
    --sidebar-border: 214 32% 91%;
    --sidebar-ring: 0 0% 0%;

    /* Charts */
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;

    /* Dynamic theme overrides (set via JS) */
    --theme-font-family: 'Inter', system-ui, -apple-system, sans-serif;
    --theme-font-size-base: 14px;
    --theme-font-weight-normal: 400;
    --theme-font-weight-medium: 500;
    --theme-font-weight-semibold: 600;
    --theme-font-weight-bold: 700;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;

    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;

    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;

    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;

    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;

    --primary: 0 0% 100%;
    --primary-foreground: 0 0% 0%;

    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;

    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;

    --ring: 0 0% 100%;
    --radius: 0.5rem;

    /* Sidebar */
    --sidebar-background: 240 10% 3.9%;
    --sidebar-foreground: 0 0% 98%;
    --sidebar-primary: 0 0% 100%;
    --sidebar-primary-foreground: 0 0% 0%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 0 0% 100%;

    /* Charts */
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
  }
}

/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: hsl(var(--muted));
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground));
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--foreground));
}

/* Optional grain texture overlay */
.grain-texture::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.08;
  z-index: 1;
  background: url("/images/texture-background.jpg") center / cover no-repeat;
}
```

---

## 2. tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
```

---

## 3. components.json (shadcn config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## 4. src/lib/utils.ts

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 5. Theme Configurator (Runtime Theming)

### ThemeConfig type

```typescript
interface ThemeConfig {
  primaryColor: string;              // HSL: "0 0% 0%"
  primaryColorForeground: string;    // HSL: "0 0% 100%"
  secondaryColor: string;            // HSL: "60 4.8% 95.9%"
  secondaryColorForeground: string;  // HSL: "24 9.8% 10%"
  borderRadius: number;              // rem value, e.g. 0.75
  fontFamily: string;                // "Inter"
  fontSize: number;                  // pixels, e.g. 14
  fontWeight: {
    normal: number;                  // 400
    medium: number;                  // 500
    semibold: number;                // 600
    bold: number;                    // 700
  };
  darkMode: boolean;
}
```

### Default theme

```typescript
const defaultTheme: ThemeConfig = {
  primaryColor: "0 0% 0%",
  primaryColorForeground: "0 0% 100%",
  secondaryColor: "60 4.8% 95.9%",
  secondaryColorForeground: "24 9.8% 10%",
  borderRadius: 0.75,
  fontFamily: "Inter",
  fontSize: 14,
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  darkMode: false,
};
```

### Predefined color palette

| Name | Primary HSL | Foreground HSL |
|---|---|---|
| Black | `0 0% 0%` | `0 0% 100%` |
| Blue | `207 90% 54%` | `0 0% 100%` |
| Red | `0 72% 51%` | `0 0% 100%` |
| Green | `142 71% 45%` | `0 0% 100%` |
| Purple | `262 83% 58%` | `0 0% 100%` |
| Orange | `25 95% 53%` | `0 0% 100%` |
| Pink | `330 81% 60%` | `0 0% 100%` |
| Cyan | `198 93% 60%` | `0 0% 100%` |

### applyTheme function

```typescript
function applyTheme(config: ThemeConfig) {
  const root = document.documentElement;

  root.style.setProperty("--primary", config.primaryColor);
  root.style.setProperty("--primary-foreground", config.primaryColorForeground);
  root.style.setProperty("--secondary", config.secondaryColor);
  root.style.setProperty("--secondary-foreground", config.secondaryColorForeground);
  root.style.setProperty("--sidebar-primary", config.primaryColor);
  root.style.setProperty("--sidebar-primary-foreground", config.primaryColorForeground);
  root.style.setProperty("--ring", config.primaryColor);
  root.style.setProperty("--sidebar-ring", config.primaryColor);
  root.style.setProperty("--radius", `${config.borderRadius}rem`);
  root.style.setProperty("--theme-font-family", `'${config.fontFamily}', system-ui, sans-serif`);
  root.style.setProperty("--theme-font-size-base", `${config.fontSize}px`);
  root.style.setProperty("--theme-font-weight-normal", String(config.fontWeight.normal));
  root.style.setProperty("--theme-font-weight-medium", String(config.fontWeight.medium));
  root.style.setProperty("--theme-font-weight-semibold", String(config.fontWeight.semibold));
  root.style.setProperty("--theme-font-weight-bold", String(config.fontWeight.bold));

  if (config.darkMode) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  localStorage.setItem("theme-config", JSON.stringify(config));
}
```

---

## 6. Components Included

44 shadcn/ui components (new-york style):

```
Accordion        Alert            Alert Dialog     Aspect Ratio
Avatar           Badge            Breadcrumb       Button
Calendar         Card             Carousel         Chart
Checkbox         Collapsible      Command          Context Menu
Dialog           Drawer           Dropdown Menu    Form
Hover Card       Input            Input OTP        Label
Menubar          Navigation Menu  Pagination       Popover
Progress         Radio Group      Resizable        Scroll Area
Select           Separator        Sheet            Sidebar
Skeleton         Slider           Switch           Table
Tabs             Textarea         Toast/Toaster    Toggle/Toggle Group
Tooltip
```

---

## 7. Typography

### Font families (configurable)
- Inter (default)
- Roboto
- Open Sans
- Lato
- Montserrat
- Poppins

### Scale
| Token | Default |
|---|---|
| Base size | 14px |
| Weight normal | 400 |
| Weight medium | 500 |
| Weight semibold | 600 |
| Weight bold | 700 |

### Common text patterns
```
Card title:    text-2xl font-semibold leading-none tracking-tight
Dialog title:  text-lg font-semibold leading-none tracking-tight
Label:         text-sm font-normal leading-none
Muted text:    text-sm text-muted-foreground
```

---

## 8. Component Variants

### Button
```
default     → bg-primary text-primary-foreground shadow-sm hover:shadow-md
destructive → bg-destructive text-destructive-foreground
outline     → border border-input bg-background hover:bg-accent
secondary   → bg-secondary text-secondary-foreground shadow-sm
ghost       → hover:bg-accent hover:text-accent-foreground
link        → text-primary underline-offset-4 hover:underline
```

### Badge
```
default     → bg-primary text-primary-foreground
secondary   → bg-secondary text-secondary-foreground
destructive → bg-destructive text-destructive-foreground
outline     → border border-input text-foreground
```

---

## 9. Border Radius

```
--radius: 0.75rem (light) / 0.5rem (dark)

lg  → var(--radius)
md  → calc(var(--radius) - 2px)
sm  → calc(var(--radius) - 4px)

Buttons:    rounded-lg (md: calc(r-2px))
Cards:      rounded-lg
Inputs:     rounded-md
Badges:     rounded-full
Switches:   rounded-full
Checkboxes: rounded-sm
```

---

## 10. Shadows

```
shadow-sm  → 0 1px 2px 0 rgb(0 0 0 / 5%)
shadow-md  → 0 4px 6px -1px rgb(0 0 0 / 10%)
shadow-lg  → 0 10px 15px -3px rgb(0 0 0 / 10%)
shadow-xl  → 0 20px 25px -5px rgb(0 0 0 / 10%)

Button default:  shadow-sm → hover:shadow-md
Dialog:          shadow-lg
Chart tooltip:   shadow-xl
```

---

## 11. Animations

```
accordion-down  → height 0 → content-height, 0.2s ease-out
accordion-up    → height content-height → 0, 0.2s ease-out

Radix built-ins (via tailwindcss-animate):
  data-[state=open]:animate-in
  data-[state=closed]:animate-out
  fade-in-0 / fade-out-0
  zoom-in-95 / zoom-out-95
  slide-in-from-* / slide-out-to-*
```

---

## 12. Setup in New Project

```bash
# 1. Init shadcn
npx shadcn@latest init
#    Style: new-york
#    Base color: Neutral
#    CSS variables: Yes

# 2. Install extras
npm install tailwindcss-animate @tailwindcss/typography
npm install next-themes
npm install framer-motion          # if using animations
npm install lucide-react           # icons
npm install recharts               # charts
npm install react-hook-form zod    # forms

# 3. Add components
npx shadcn@latest add button card badge input label
npx shadcn@latest add dialog sheet sidebar toast
# ... add whatever you need

# 4. Copy files
#    Replace tailwind.config.ts, src/index.css, src/lib/utils.ts

# 5. Wrap app with ThemeProvider
```

```tsx
// app/layout.tsx or _app.tsx
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

## 13. Customizing Brand Colors

Change primary color in CSS:
```css
:root {
  --primary: 207 90% 54%;           /* your brand HSL */
  --primary-foreground: 0 0% 100%;  /* text on primary */
}
```

Or set at runtime:
```typescript
applyTheme({ ...defaultTheme, primaryColor: "207 90% 54%" });
```

All components using `bg-primary`, `text-primary`, `border-primary` update automatically.

---

## 14. tsconfig Path Aliases

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

For Vite projects also add to `vite.config.ts`:
```typescript
import { resolve } from "path";

export default {
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
};
```
