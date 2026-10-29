# Security

## Reporting a vulnerability

Please report security problems privately, not in public issues: use **Report a vulnerability** on this repository's [Security tab](https://github.com/edgegap/llm-agent-skills/security/advisories/new). For problems with the Edgegap platform itself, contact Edgegap support through the dashboard.

Useful in a report: which skill, template or script is affected, what an agent or attacker could do with it, and steps to reproduce. Never include real API tokens, registry credentials or matchmaker tokens; revoke any you exposed while testing.

## What counts

- A skill or template that leads an agent to expose the Edgegap API token, registry credentials or a deployment's self-stop token (in files, logs, game clients or images).
- A skill that leads an agent to stop, modify or deploy resources the developer did not ask about.
- Template code (C#, Dockerfiles, scripts) with an exploitable flaw.
- Anything in the repository that should not be public.

## Scope notes

The Edgegap API token is organization-wide and cannot be scoped; the skills are written so it stays in the MCP configuration or the developer's backend. The matchmaker Auth Token is designed to ship in game clients and is not a secret.
