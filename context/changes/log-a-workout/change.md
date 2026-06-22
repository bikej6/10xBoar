---
change_id: log-a-workout
title: Logowanie treningu w < 1 min z izolacją per-użytkownik
status: implemented
created: 2026-06-19
updated: 2026-06-22
archived_at: null
---

## Notes

Roadmap slice **S-01** (Stream A, ścieżka krytyczna do gwiazdy przewodniej S-03).

- **Outcome:** użytkownik może zalogować trening (ćwiczenie z katalogu + liczba serii + ciężar) dla danego dnia w < 1 min; dane trwałe i widoczne wyłącznie dla niego.
- **PRD refs:** FR-003 + NFR (izolacja per-użytkownik, potwierdzenie < 2 s) + Guardrail (zapisany trening dostępny przy następnym logowaniu).
- **Prerequisites:** F-01 (seed-exercise-catalog) — done, katalog odpytywalny.
- **Open unknown (Owner: user, Block: no):** czy izolacja per-użytkownik jest egzekwowana na poziomie zapytania (konwencja `createClient` per-request) czy dodatkowo regułami bazy (RLS)?
- **Risk:** UI niezoptymalizowane pod < 1 min podważa główne kryterium sukcesu.
