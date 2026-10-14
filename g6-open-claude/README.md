---
title: G6 Open Claude
emoji: 🧠
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# G6 Open Claude

Private control/orchestration layer for the existing G6 automation system.

## Architecture
Voice/typed command → policy gate → G6 orchestrator → Make adapter → existing G6 scenarios and connected business tools → audit log.

## Space secrets
Add only the existing production endpoints as Hugging Face Space Secrets. Do not commit secrets.

- `MAKE_COMMAND_WEBHOOK_URL` — existing G6 command/router webhook.
- Additional endpoint secrets can be introduced only when the existing G6 topology requires them.

Without the Make secret, the UI and approval engine run safely in adapter-ready demo mode and do not pretend to execute external actions.

## Protected actions
Payments/refunds, public publishing, contract execution, destructive deletion, and security/credential changes require an exact action-specific approval.

## Endpoints
- `GET /api/health`
- `GET /api/tools`
- `POST /api/command`
- `GET /api/approvals`
- `POST /api/approvals/{token}/approve`
- `POST /api/approvals/{token}/reject`
- `GET /api/audit`
