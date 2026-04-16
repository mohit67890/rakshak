# Contributing to Rakshak

Thank you for considering a contribution. Rakshak exists because workplace harassment reporting systems have failed real people, and we believe open-source software can help fix that.

## Who We Need

Contributions of all kinds are welcome, but we're especially looking for:

- **POSH Act practitioners** — HR professionals, lawyers, or ICC members who can validate the legal accuracy of the system prompt and conversation flows
- **Regional language speakers** — Hindi, Marathi, Tamil, Telugu, Kannada — for future localization
- **Accessibility experts** — ensuring the bot and tab are usable by everyone
- **Azure/Teams developers** — improving the deployment, provisioning, and Teams integration
- **Security researchers** — hardening encryption, auth, and data isolation

## Ground Rules

1. **Privacy is sacred.** Never add logging that could expose complaint content. Log IDs and actions, never descriptions or names.
2. **Legal accuracy is non-negotiable.** If you change anything in `src/services/llm/prompts.ts` or any legal knowledge, cite the specific section of the statute. If you're unsure, open an issue instead of guessing.
3. **Tone matters.** Bot responses should feel like a trusted colleague — warm, calm, clear. No corporate jargon. No "we regret to inform you."
4. **Keep it simple.** This software should be deployable by a developer at a 50-person Indian company. No clever abstractions. Clear variable names.

## Getting Started

1. Fork the repository
2. Follow the [Setup Guide](docs/SETUP.md) to get the project running locally
3. Create a feature branch from `main`
4. Make your changes
5. Run the tests: `npm test` (all 159 tests should pass)
6. Submit a pull request

## Development Workflow

### Branch naming

```
feature/short-description
fix/what-was-broken
docs/what-was-documented
```

### Commit messages

Write clear, descriptive commit messages. No strict format required, but prefer:

```
Add inquiry deadline reminders to ICC dashboard

The ICC dashboard now shows a warning banner when complaints
are within 15 days of the 90-day inquiry deadline.
```

### Testing

- All changes must pass existing tests: `npm test`
- New features should include tests where practical
- We use Vitest with mocked Cosmos DB and LLM for unit tests
- Integration tests run against a real Cosmos DB (skipped in CI if no connection string)

### Code Style

- TypeScript strict mode — no `any`
- `async/await` — no raw Promises or callbacks
- Explicit return types on all functions
- `interface` for data shapes, `type` for unions
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components

## What to Work On

Check the [GitHub Issues](https://github.com/mohit67890/rakshak/issues) for open items. Issues labeled `good first issue` are a good starting point.

Current priorities from the roadmap:

- **Criminal threshold detection alerts** — Surface BNS section alerts in the ICC dashboard
- **Multi-language support** — Start with Hindi (the system prompt and bot responses)
- **Client-side PDF export** — "Export as PDF" button on the complaint detail page
- **Annual report orchestrator** — Auto-generate the Board's annual POSH disclosure data

## Reporting Security Issues

If you find a security vulnerability — especially anything related to complaint data exposure, auth bypass, or encryption — please **do not** open a public issue. Email **mohit@datapuls.ai** directly. We treat these with the highest urgency.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Questions? Reach out at <a href="mailto:mohit@datapuls.ai">mohit@datapuls.ai</a></sub>
</p>
