Review and refine the UI of a specific page or component in Orvyn.

Before making changes:
1. Read design-system/Orvyn/MASTER.md for color tokens, typography, and spacing
2. Check if design-system/Orvyn/pages/ has a page-specific override
3. Read CLAUDE.md Section 11 (theme rules) — all UI must support light + dark
4. Read CLAUDE.md Section 14 (responsive rules) — must work across resolutions
5. Never hardcode colors — use CSS custom properties scoped to data-theme
6. Theme applies at app-shell level, not document/html/body (CLAUDE.md Section 11)

Then review the component for:
- Visual consistency with the design system
- Light/dark theme support via CSS variables
- Responsive layout (Flexbox/Grid, no fixed widths)
- Accessibility (keyboard nav, contrast, focus states)
- Enterprise-grade polish

Component or page to refine: $ARGUMENTS