# Code Clash Node server

Deploy this folder as a Node.js application on GoDaddy/cPanel.

## Environment variables

- `GOOGLE_CLIENT_ID` = Google OAuth web client ID
- `FRONTEND_ORIGINS` = `https://games.learnwithchampak.live`
- `PORT` is normally supplied by cPanel/Passenger.

## Routes

- `GET /health`
- `POST /api/google`
- `GET /api/me`
- `POST /api/logout`
- Socket.IO path: `/games/code-clash/socket.io`

## Matchmaking

Six seats per match. Real signed-in users are grouped first; after 8 seconds, simulated candidates fill unused seats.

Current state is in memory only. Restarting the Node process clears active sessions/matches. MySQL persistence is intentionally deferred until gameplay is approved.
