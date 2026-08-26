# Security Policy

## Supported versions

Security fixes are applied to the latest version on the `main` branch and to the latest GitHub release when one exists.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use the repository's private security advisory form instead:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, a minimal reproduction, impact, and any suggested mitigation.

If private reporting is unavailable, contact the repository owner through their GitHub profile and include `web-task-agent security report` in the first line. Do not include credentials, customer data, private URLs, or exploit payloads in public channels.

We aim to acknowledge a report within seven days and will coordinate a fix before public disclosure whenever practical.

## Security boundaries

Web Task Agent executes browser research on the operator's machine and can send selected prompt/source content to a configured LLM endpoint. Treat every source and prompt as untrusted input. Never configure the app with credentials that are broader than the task requires.

The project must not be used to bypass access controls, solve CAPTCHAs, evade a site's terms, or automate high-risk external actions.
