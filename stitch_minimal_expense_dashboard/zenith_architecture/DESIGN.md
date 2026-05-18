---
name: Zenith Architecture
colors:
  surface: '#fcf8f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0edec'
  surface-container-high: '#ebe7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#464554'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#575992'
  on-secondary: '#ffffff'
  secondary-container: '#bdbefe'
  on-secondary-container: '#494b83'
  tertiary: '#904900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b55d00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#13144a'
  on-secondary-fixed-variant: '#404178'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#703700'
  background: '#fcf8f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-xs:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 240px
  content_max_width: 1400px
  gutter: 24px
  container_padding: 32px
  stack_sm: 8px
  stack_md: 16px
  stack_lg: 24px
---

## Brand & Style

This design system embodies a **Hyper-Minimalist / Utility-First** aesthetic, drawing direct inspiration from productivity powerhouses like Linear and Things 3. The personality is focused, quiet, and intentional, designed to disappear so that the user’s content remains the primary focus.

The visual language relies on precision rather than decoration. It utilizes high-quality typography, generous white space, and a restrained color palette to create a sense of order and calm. Depth is achieved through subtle tonal shifts and crisp borders rather than heavy drop shadows, resulting in a professional, "pro-tool" interface that feels both contemporary and timeless.

## Colors

The palette is strictly monochromatic with a single functional accent. In **Light Mode**, the interface uses a soft off-white (`#FAFAFA`) to reduce eye strain compared to pure white, paired with high-contrast text (`#0A0A0A`). **Dark Mode** inverts this logic using a deep black base.

The primary accent, **Indigo (`#6366F1`)**, must be used with extreme discipline. It is reserved exclusively for:
1. Primary call-to-action buttons.
2. Active navigation states.
3. Critical focus indicators.
4. Selection checkboxes/radios.

Borders are the primary method of structural separation, using `#E5E5E5` in light mode and `#262626` in dark mode to maintain a sharp, thin-line aesthetic.

## Typography

The system uses **Inter** for its neutral, systematic character. The typographic hierarchy is intentionally tight, favoring the `text-sm` (14px) standard for body copy to mimic the information density of high-end desktop applications.

- **Numbers/Metrics:** Use `display-xl` with semi-bold weighting for high-impact data points.
- **Section Headers:** Use `headline-lg` (24px) for major view titles.
- **Micro-copy:** Use `label-xs` for metadata, tags, and helper text, often in a secondary gray color to maintain hierarchy.

## Layout & Spacing

The layout follows a **Fixed-Fluid hybrid** model. A persistent left sidebar at **240px** handles primary navigation. The main content area lives within a constrained max-width of **1200px to 1400px** to ensure line lengths remain readable and the UI doesn't feel sparse on ultra-wide monitors.

Spacing follows an 8px base grid. Content within cards and main views should default to **24px (stack_lg)** padding to provide a luxurious, airy feel that offsets the density of the 14px typography. On mobile, the sidebar collapses into a bottom sheet or a hidden drawer, and container padding reduces to 16px.

## Elevation & Depth

This design system avoids traditional box shadows in favor of **Tonal Elevation** and **Hard Borders**.

- **Level 0 (Background):** The base canvas (`#FAFAFA`).
- **Level 1 (Cards/Sidebar):** Separated by a 1px solid border (`#E5E5E5`). No shadow.
- **Level 2 (Popovers/Modals):** A very slight, highly diffused shadow (e.g., `0 4px 12px rgba(0,0,0,0.05)`) is permissible only to separate floating elements from the level 1 surface. 
- **Active States:** Subtle background shifts (e.g., `$background-light` to a slightly darker gray) indicate hover, while the Indigo accent indicates selection.

## Shapes

The shape language is precise and geometric. We utilize two specific radii to create a subtle nested effect:
- **Large Containers & Cards:** 8px radius.
- **Interactive Elements (Buttons, Inputs, Chips):** 6px radius.

This slight difference ensures that when a button sits inside a card, the corner curves feel harmonious and optically corrected. All icons should utilize the **Lucide** set with a **1.5px stroke** to match the weight of the typography.

## Components

### Buttons
- **Primary:** Indigo background, white text, 6px radius. High contrast.
- **Secondary:** Transparent background, 1px border (`#E5E5E5`), `#0A0A0A` text.
- **Ghost:** No border or background unless hovered. Used for sidebar items and utility actions.

### Cards
- **Construction:** 1px border, 8px radius, 24px padding.
- **Behavior:** Background is typically the same as the canvas or pure white if the canvas is slightly off-white.

### Input Fields
- **Default:** 1px border (`#E5E5E5`), 6px radius, 14px text.
- **Focus:** Border color changes to Indigo with a 1px solid Indigo ring or high-contrast black.

### Navigation (Sidebar)
- 14px medium weight text.
- Active state indicated by a subtle background fill or a 2px vertical Indigo bar on the far left.

### Lists
- Minimalist rows separated by 1px horizontal dividers. 
- High horizontal padding (12px-16px) and vertical padding (8px-12px) to maintain "Things 3" levels of clarity.