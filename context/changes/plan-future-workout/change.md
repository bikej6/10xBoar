---
change_id: plan-future-workout
title: Ręczne planowanie treningu (status planned) na przyszły dzień
status: impl_reviewed
created: 2026-06-22
updated: 2026-06-23
archived_at: null
---

## Notes

Roadmap slice **S-02** (Stream A, ścieżka krytyczna; sekwencjonowany przed gwiazdą przewodnią S-03). Seed z `context/foundation/roadmap.md`.

- **Outcome:** użytkownik może ręcznie zaplanować trening (ćwiczenia z katalogu) na wybrany przyszły dzień.
- **PRD refs:** FR-004 (planowanie ręczne ≠ automatyczna propozycja).
- **Prerequisites:** F-01 (katalog ćwiczeń) — done; S-01 (`log-a-workout`, schemat wpisu treningu + helpery) — merged (PR #10).
- **Reuse z S-01:** tabele `workouts` / `workout_exercises` i helpery `src/lib/workouts.ts`; kolumna `status` już istnieje (`logged` | `planned`) i została zaprojektowana tak, by **S-02 wprowadzał `planned`** jako zmianę addytywną (bez przebudowy schematu).
- **Sequenced before S-03:** przyjęcie propozycji (S-03) tworzy zaplanowany trening, więc S-03 konsumuje tę zdolność.
- **Risk (z roadmapy):** dublowanie logiki wpisu z S-01, jeśli schemat/formularz nie jest współdzielony — preferować ponowne użycie ścieżki zapisu i UI z S-01.
- **Otwarte do rozstrzygnięcia w planie:** czy planowanie reużywa formularza logowania z trybem daty przyszłej, czy osobny ekran; jak prezentować zaplanowane treningi (lista vs przyszły kalendarz — por. S-05).
