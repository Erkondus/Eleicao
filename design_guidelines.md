# Design Guidelines: Brazilian Electoral Simulation System

## Design Approach
**Government Dashboard System** - Professional institutional interface inspired by TSE (Tribunal Superior Eleitoral) and Power BI dashboards. This is a data-dense, utility-focused application prioritizing clarity, authority, and comprehensive information display.

## Core Design Principles
1. **Institutional Authority**: Professional government-style interface that conveys trust and credibility
2. **Data Clarity**: Complex electoral calculations presented with absolute clarity
3. **Hierarchical Organization**: Clear information architecture with tabs, sections, and cards
4. **Responsive Professionalism**: Maintains formal design integrity across all devices

## Typography System

**Font Families:**
- Primary: Roboto (headings, UI elements, buttons)
- Secondary: Open Sans (body text, descriptions)
- Monospace: Roboto Mono (numerical data, calculations, audit logs)

**Hierarchy:**
- Page Titles: text-4xl font-bold (Roboto)
- Section Headers: text-2xl font-semibold (Roboto)
- Card Titles: text-xl font-medium (Roboto)
- Body Text: text-base (Open Sans)
- Data/Numbers: text-lg font-mono (Roboto Mono)
- Labels: text-sm font-medium uppercase tracking-wide
- Captions: text-xs text-gray-600

## Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, 8, and 12
- Component padding: p-6
- Card spacing: space-y-4, gap-6
- Section margins: mb-8, mt-12
- Grid gaps: gap-4 for dense data, gap-6 for cards

**Container Strategy:**
- Dashboard: max-w-7xl with full-width data tables
- Forms: max-w-3xl centered
- Sidebar navigation: w-64 fixed

**Grid Patterns:**
- Simulation cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Metrics/stats: grid-cols-2 md:grid-cols-4
- Data tables: full-width responsive with horizontal scroll

## Component Library

### Navigation
- **Top Bar**: Fixed header with logo, system name, user menu, notification icon
- **Sidebar**: Fixed left navigation with role-based menu items, collapsible on mobile
- **Breadcrumbs**: Always present for deep navigation paths
- **Tabs**: Primary navigation within sections (simulations, parties, candidates, audit)

### Data Display
- **Cards**: Elevated (shadow-md) with p-6, rounded-lg, bg-white
- **Tables**: Striped rows, sticky headers, sortable columns, pagination footer
- **Charts**: Recharts bar/pie charts with institutional color scheme
- **Metrics Cards**: Large numbers with labels, icon indicators, trend arrows
- **Status Badges**: Rounded-full px-3 py-1 with role-specific colors

### Forms
- **Input Fields**: Bordered (border-2), rounded-md, p-3, with floating labels
- **Dropdowns**: Full-width selects with search capability for parties/candidates
- **Number Inputs**: Roboto Mono font for vote counts and calculations
- **Multi-step Forms**: Progress indicator at top for scenario creation
- **Validation**: Inline error messages in alert color, success checkmarks in green

### Interactive Elements
- **Primary Buttons**: bg-[#003366] text-white px-6 py-3 rounded-md font-medium
- **Secondary Buttons**: border-2 border-[#003366] text-[#003366] px-6 py-3
- **Icon Buttons**: For table actions (edit, delete, view) with tooltips
- **Calculation Trigger**: Prominent "Calculate Results" button in gold accent
- **Export Buttons**: PDF/CSV download buttons with document icons

### Dashboards
- **Summary Row**: 4-column metric cards showing key statistics
- **Main Content**: 2-column layout (left: filters/controls, right: results visualization)
- **Results Display**: Tabbed interface (table view, chart view, detailed breakdown)
- **AI Predictions Panel**: Distinct card with loading states and confidence indicators

### Audit Trail
- **Log Table**: Chronological list with timestamp, user, action, details columns
- **Filters**: Date range picker, user selector, action type dropdown
- **Details Modal**: Expandable view showing complete change data in JSON format

## Visual Patterns

**Electoral Calculation Display:**
- Quociente eleitoral shown prominently with formula visualization
- Party results in sortable table with seat allocation columns
- D'Hondt method breakdown in expandable accordion
- Color-coded party rows (using party-specific colors where available)

**Scenario Management:**
- Card grid for saved scenarios with quick stats preview
- "New Scenario" prominent card with dashed border
- Comparison view: side-by-side tables for multiple scenarios

**Authentication & Access:**
- Clean login page with institutional logo and tagline
- Role indicator badge always visible in top bar
- Permission-based UI element visibility (no hidden features, clear disabled states)

## Responsive Behavior
- Desktop (lg:): Full sidebar, 3-column grids, expanded tables
- Tablet (md:): Collapsible sidebar, 2-column grids, scrollable tables
- Mobile: Hamburger menu, stacked cards, mobile-optimized table cards

## Images
No hero images required. This is a dashboard application focused on data and functionality. Use institutional logo and icons throughout.

**Icon Strategy:**
- Use Heroicons for consistent UI icons
- Party/candidate photos in circular avatars (w-12 h-12)
- TSE logo in header for institutional branding

## Critical UI States
- **Loading**: Skeleton screens for tables, spinner for calculations
- **Empty States**: Helpful illustrations with "Add First Party/Candidate" CTAs
- **Error States**: Alert color banners with retry actions
- **Success**: Green confirmation toasts for saved operations
- **Calculation Progress**: Progress bar for complex simulations

This comprehensive design creates a professional, data-rich electoral simulation platform that balances governmental authority with modern usability.