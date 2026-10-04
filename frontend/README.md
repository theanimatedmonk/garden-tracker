# Wildlife Observer — frontend (dummy UI)

React + Vite placeholder for the Observer, My Wildlife, and Soundscape screens from `plan.md`. Rive animations come later.

## Run

Start the backend first (`backend/README.md`), then:

```bash
cd frontend
npm install
npm run dev
```

Mobile-first UI with bottom tabs: **Observer** (vertical reel cards), **Soundscape** (daily graph), **Logbook** (search + filters).

Open http://localhost:5173 — best at phone width (~480px). API calls go to port 8000.

## Notes

- Live updates use SSE (`/api/events/stream`).
- Audio playback uses `/api/recordings/:id` from the backend.
- Supabase is not connected; all data is from the in-memory backend store.
