Run a security review on the recent changes in this repository.

Check against CLAUDE.md Section 7 (strict prohibitions) and Section 12 (security hardening):
1. Exposed secrets or API keys in code
2. Missing input validation on Express routes (must use Joi)
3. Missing Pydantic validation on FastAPI endpoints
4. Electron webSecurity or CSP misconfigurations
5. SQL injection risks in SQLite queries
6. Missing rate limiting on new API endpoints
7. Session/auth bypass possibilities
8. IPC channels that could be exploited from renderer
9. React directly calling Python or Express (CLAUDE.md Section 4 violation)
10. import.meta.env used for runtime config (CLAUDE.md Section 4 violation)

Reference @cc-skill-security-review for methodology.