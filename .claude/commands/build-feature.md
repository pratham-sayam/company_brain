I want to build a new feature for Orvyn.

Before writing any code:
1. Read CLAUDE.md — especially Section 3 (layer responsibilities), Section 7 (prohibitions),
   and Section 4 (runtime config rules)
2. Read .claude/context/features.md — check if this feature already exists or is in progress
3. Read design-system/Orvyn/MASTER.md — follow design tokens for any UI work
4. Check which layers this feature touches (electron, frontend, express-backend, python-backend)
5. If adding IPC channels, follow the pattern in CLAUDE.md Section 17
6. If adding Redux state, follow the pattern in CLAUDE.md Section 19
7. List every file you plan to modify BEFORE writing code

Then implement the feature step by step, committing logical units.

Feature to build: $ARGUMENTS