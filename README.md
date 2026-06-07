# Belo'ren Raid Dashboard

Local Warcraft Logs triage dashboard for Belo'ren.

## Run Locally

1. Copy `.env.example` to `.env`.
2. Add Warcraft Logs client credentials.
3. Start the server:

```bash
npm start
```

The app listens on `PORT` when set, otherwise `4173`.

## Deploy

Deploy the `work/` directory as the app root.

Required environment variables:

```bash
WARCRAFT_LOGS_CLIENT_ID
WARCRAFT_LOGS_CLIENT_SECRET
```

Start command:

```bash
npm start
```

Health check:

```text
/api/health
```

For Render, `render.yaml` is included. Set the two Warcraft Logs env vars in the service dashboard after creating the service.
