---
project: "10xBoar"
version: 1
status: draft
created: 2026-06-14
updated: 2026-06-22
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xBoar

> Wyprowadzona z `context/foundation/prd.md` (v1) + auto-zbadana baza kodu.
> Edytuj w miejscu; archiwizuj, gdy zdezaktualizowana.
> Slice'y poniżej są w kolejności zależności. Tabela "Skrót" jest indeksem.

## Vision recap

10xBoar to prosty tracker treningu siłowego dla hobbystów, który łączy szybką rejestrację sesji z propozycjami generowanymi z **własnej historii** użytkownika — nie z gotowych szablonów. Wyróżnik produktu (cecha, która po usunięciu czyni go nieodróżnialnym od zwykłego trackera) to: propozycja treningu opiera się na realnych danych historycznych użytkownika dla wybranej partii mięśniowej, a nie na generycznym planie. Istniejące aplikacje (Strong, Hevy, FitNotes) są albo przeładowane funkcjami, albo oferują generyczne plany.

## North star

**S-03: użytkownik dostaje propozycję treningu na wybraną partię mięśniową opartą na własnej historii** — to milestone walidacyjny, bo udowadnia rdzeń hipotezy produktu; przy celu `speed` cała reszta ma znaczenie tylko wtedy, gdy ten przepływ działa.

> Gwiazda przewodnia (north star) = najmniejszy kompletny przepływ użytkownika, którego udane dostarczenie udowadnia główną hipotezę produktu — umieszczony tak wcześnie, jak pozwalają warunki wstępne, bo wszystko inne liczy się dopiero wtedy, gdy ten działa. Tutaj propozycja wymaga najpierw zalogowanej historii (S-01) i trybu planowania do akceptacji (S-02), więc trafia za nie w sekwencji.

## At a glance

| ID   | Change ID                | Outcome (użytkownik może …)                                              | Prerequisites    | PRD refs              | Status   |
| ---- | ------------------------ | ------------------------------------------------------------------------ | ---------------- | --------------------- | -------- |
| F-01 | seed-exercise-catalog    | (foundation) wbudowany katalog ćwiczeń per partia mięśniowa jest zasiany | —                | FR-001                | done     |
| S-01 | log-a-workout            | zalogować trening (ćwiczenie + serie + ciężar) w < 1 min, prywatnie      | F-01             | FR-003                | proposed |
| S-02 | plan-future-workout      | ręcznie zaplanować trening na przyszły dzień                             | F-01, S-01       | FR-004                | proposed |
| S-03 | history-based-proposal   | dostać propozycję treningu z własnej historii i przyjąć ją jako plan     | F-01, S-01, S-02 | US-01, FR-005         | blocked  |
| S-04 | weight-progress-stats    | zobaczyć statystyki progresu ciężaru dla każdego ćwiczenia               | S-01             | FR-006                | proposed |
| S-05 | workout-calendar         | zobaczyć kalendarz z dniami treningowymi i szczegóły treningu po kliknięciu dnia | S-01     | FR-003 (odczyt) · nowy | proposed |
| S-06 | edit-workout             | edytować zapisany trening (z widoku szczegółów)                          | S-01, S-05       | nowy (rozszerza zakres) | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy dzielące łańcuch warunków wstępnych. Kanoniczna kolejność żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania.

| Stream | Theme                          | Chain                                  | Note                                                               |
| ------ | ------------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| A      | Rdzeń: rejestracja → propozycja | `F-01` → `S-01` → `S-02` → `S-03`     | Ścieżka krytyczna do gwiazdy przewodniej; zgodna z celem `speed`.  |
| B      | Wgląd w postępy                | `S-04`                                 | Odgałęzia się od Stream A na `S-01`; równoległy do S-02/S-03.       |
| C      | Historia i edycja              | `S-01` → `S-05` → `S-06`               | Odgałęzia się od Stream A na `S-01`; drugorzędny, poza ścieżką krytyczną. |

## Baseline

Co już jest w bazie kodu na dzień `2026-06-14` (auto-zbadane + potwierdzone przez użytkownika).
Fundamenty poniżej zakładają, że to istnieje, i NIE budują tego ponownie.

- **Frontend:** present — Astro v6 + React 19 (wyspy), Tailwind v4, prymitywy UI (`src/components/ui/button.tsx`, lucide-react); strony `index`, `auth/*`, `dashboard`.
- **Backend / API:** present — Astro SSR, trasy API `src/pages/api/auth/*.ts`, `src/middleware.ts`.
- **Data:** partial — klient Supabase `@supabase/ssr` (`src/lib/supabase.ts`), ale tylko `auth.users`; brak tabel domenowych, brak migracji (`supabase/` = sam `config.toml`).
- **Auth:** present — pełny flow signup/signin/signout; middleware ustawia `locals.user`; `PROTECTED_ROUTES`; działa na produkcji (`deploy-plan.md` faza 7).
- **Deploy / infra:** present — Cloudflare Workers na żywo (`boar.boc-katarzyna.workers.dev`), Workers Builds CD, branch protection, CI lint+build.
- **Observability:** absent — brak logowania/error-trackingu/metryk; `wrangler tail` jest tylko live (`infrastructure.md`).

## Foundations

### F-01: Zasianie katalogu ćwiczeń

- **Outcome:** (foundation) wbudowany katalog ćwiczeń z przypisaniem do partii mięśniowych jest zasiany i odpytywalny; brak UI własnego po stronie użytkownika.
- **Change ID:** seed-exercise-catalog
- **PRD refs:** FR-001
- **Unlocks:** S-01 (wybór ćwiczenia przy logowaniu), S-02 (wybór przy planowaniu), S-03 (propozycja operuje na istniejącym katalogu — patrz Non-Goal "brak generowania nowych ćwiczeń przez AI").
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najmniejszy wspólny zasób trzech slice'ów; sekwencjonowany pierwszy, bo bez katalogu żaden przepływ wyboru ćwiczenia nie jest planowalny. Ryzyko: zbyt szeroki zakres taksonomii partii mięśniowych — trzymać minimalny zestaw pokrywający persony.
- **Status:** done

## Slices

### S-01: Logowanie treningu

- **Outcome:** użytkownik może zalogować trening (ćwiczenie z katalogu + liczba serii + ciężar) dla danego dnia w < 1 min, a dane są trwałe i widoczne wyłącznie dla niego.
- **Change ID:** log-a-workout
- **PRD refs:** FR-003 — oraz NFR (izolacja danych per-użytkownik, potwierdzenie operacji < 2 s) i Guardrail (zapisany trening dostępny przy następnym logowaniu).
- **Prerequisites:** F-01 (katalog do wyboru ćwiczenia)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy izolacja per-użytkownik egzekwowana jest na poziomie zapytania (konwencja `createClient` per-request) czy dodatkowo regułami bazy? — Owner: user. Block: no.
- **Risk:** Twardy warunek wstępny dla gwiazdy przewodniej i nośnik schematu treningu + izolacji per-użytkownik. Sekwencjonowany zaraz po katalogu, bo bez zalogowanej historii nie ma czego analizować. Ryzyko: UI niezoptymalizowane pod < 1 min podważa główne kryterium sukcesu.
- **Status:** proposed

### S-02: Planowanie treningu na przyszły dzień

- **Outcome:** użytkownik może ręcznie zaplanować trening (ćwiczenia z katalogu) na wybrany przyszły dzień.
- **Change ID:** plan-future-workout
- **PRD refs:** FR-004
- **Prerequisites:** F-01 (katalog), S-01 (schemat wpisu treningu wielokrotnie użyty)
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Tryb pełnej ręcznej kontroli (PRD: planowanie ≠ automatyczna propozycja). Sekwencjonowany przed S-03, bo akceptacja propozycji tworzy zaplanowany trening — S-03 konsumuje tę zdolność. Ryzyko: dublowanie logiki wpisu z S-01, jeśli schemat nie jest współdzielony.
- **Status:** proposed

### S-03: Propozycja treningu z historii

- **Outcome:** użytkownik może poprosić o propozycję treningu na wybraną partię mięśniową i docelowy dzień, zobaczyć plan oparty na własnej historii, a następnie przyjąć go jako zaplanowany trening lub zignorować.
- **Change ID:** history-based-proposal
- **PRD refs:** US-01, FR-005
- **Prerequisites:** F-01 (katalog), S-01 (historia treningów), S-02 (przyjęcie propozycji = zaplanowany trening)
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Jaka minimalna liczba zalogowanych sesji jest wymagana, zanim aplikacja wygeneruje sensowną propozycję? — Owner: user. Block: yes.
  - Jak zachować się przy braku historii dla danej partii (empty-state z Acceptance Criteria US-01)? — Owner: user. Block: no.
- **Risk:** Gwiazda przewodnia — udowadnia wyróżnik produktu. Zablokowana, bo propozycja z zerową/zbyt małą historią szkodzi zaufaniu (Otwarte pytanie). Sekwencjonowana na końcu ścieżki krytycznej, bo wymaga realnych danych z S-01 i trybu planu z S-02.
- **Status:** blocked

### S-04: Statystyki progresu ciężaru

- **Outcome:** użytkownik może zobaczyć statystyki/wykres progresu ciężaru dla każdego ćwiczenia.
- **Change ID:** weight-progress-stats
- **PRD refs:** FR-006 (Kryteria sukcesu → Secondary)
- **Prerequisites:** S-01 (zalogowana historia do agregacji)
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Widok tylko-do-odczytu nad tą samą historią; niezależny od propozycji, więc może iść równolegle. Sekwencjonowany po S-01, bo bez historii nie ma czego wykreślać. Ryzyko: niskie — wartość drugorzędna, nie blokuje ścieżki krytycznej.
- **Status:** proposed

### S-05: Kalendarz historii treningów

- **Outcome:** użytkownik widzi kalendarz z oznaczonymi dniami, w których ma zapisany trening, i po kliknięciu dnia widzi szczegóły treningu (ćwiczenia + serie + powtórzenia + ciężar). Tylko do odczytu.
- **Change ID:** workout-calendar
- **PRD refs:** FR-003 (odczyt zapisanej historii) — brak dedykowanego FR dla widoku kalendarza; do potwierdzenia przy planowaniu.
- **Prerequisites:** S-01 (zapisana historia + schemat `workouts`/`workout_exercises`, helper `getRecentWorkouts`)
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Zakres widoku (miesiąc vs tydzień) i sposób oznaczania dni z treningiem. — Owner: user. Block: no.
  - Strefa czasowa dla przypisania treningu do dnia (UTC zegara Workers vs lokalny dzień użytkownika — patrz F2 z S-01). — Owner: user. Block: no.
- **Risk:** Widok tylko-do-odczytu nad historią z S-01; niezależny od ścieżki krytycznej (jak S-04), może iść równolegle. Ryzyko niskie. Reużywa helpera odczytu z S-01 zamiast odpytywać Supabase ad hoc.
- **Status:** proposed

### S-06: Edycja treningu

- **Outcome:** użytkownik może edytować zapisany trening (ćwiczenia / serie / powtórzenia / ciężar / data) z widoku szczegółów dnia.
- **Change ID:** edit-workout
- **PRD refs:** brak — **rozszerza zakres poza pierwotny Non-Goal S-01** ("brak edycji/usuwania treningów"); wymaga potwierdzenia w PRD przed implementacją.
- **Prerequisites:** S-01 (schemat + dane), S-05 (wejście w edycję z widoku szczegółów)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy edycja obejmuje także usuwanie treningu/ćwiczenia? — Owner: user. Block: no.
  - Czy zmiana daty treningu jest dozwolona (i czy nadal obowiązuje reguła "nie w przyszłości")? — Owner: user. Block: no.
- **Risk:** Odwraca decyzję S-01 (brak edycji). Wymaga **nowej migracji: polityka RLS UPDATE na `workouts`** keyed to `auth.uid()` (dziś istnieją tylko SELECT/INSERT/DELETE), a edycja wierszy ćwiczeń idzie przez własność tranzytywną (`workout_exercises` ma już politykę `for all`). Ryzyko: spójność przy edycji wielu dzieci (insert/update/delete ćwiczeń w jednej sesji) — bez transakcji po stronie PostgREST, jak w F1 z S-01.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                              | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------ | -------------------------------------------------- | --------------------- | ----- |
| F-01       | seed-exercise-catalog    | Zasianie wbudowanego katalogu ćwiczeń per partia   | yes                   | Uruchom `/10x-plan seed-exercise-catalog` |
| S-01       | log-a-workout            | Logowanie treningu w < 1 min z izolacją per-user   | no                    | Wymaga F-01 |
| S-02       | plan-future-workout      | Ręczne planowanie treningu na przyszły dzień       | no                    | Wymaga F-01, S-01 |
| S-03       | history-based-proposal   | Propozycja treningu z własnej historii (gwiazda)   | no                    | Zablokowana: minimalna historia (Otwarte pytanie) |
| S-04       | weight-progress-stats    | Statystyki progresu ciężaru per ćwiczenie          | no                    | Wymaga S-01 |
| S-05       | workout-calendar         | Kalendarz historii treningów z podglądem dnia      | no                    | Wymaga S-01 (po merge) |
| S-06       | edit-workout             | Edycja zapisanego treningu                         | no                    | Wymaga S-01, S-05; rozszerza zakres PRD (potwierdzić) |

## Open Roadmap Questions

1. **Jaka minimalna liczba zalogowanych sesji jest wymagana, zanim aplikacja wygeneruje sensowną propozycję?** — Owner: user. Block: S-03. (Z PRD §Otwarte pytania — wciąż otwarte; propozycja z zerową historią szkodzi zaufaniu do produktu.)

## Parked

- **FR-002: import własnych ćwiczeń z CSV** — Why parked: nice-to-have w PRD; przy celu `speed` poza ścieżką wymagań koniecznych.
- **Współdzielenie treningów / profile publiczne / funkcje społecznościowe** — Why parked: PRD §Non-Goals (dane prywatne).
- **Natywna aplikacja mobilna (iOS/Android)** — Why parked: PRD §Non-Goals (dostęp przez przeglądarkę mobilną).
- **Rekomendacje dietetyczne (kalorie, makra, posiłki)** — Why parked: PRD §Non-Goals (tylko treningi siłowe).
- **Generowanie nowych ćwiczeń spoza katalogu przez AI** — Why parked: PRD §Non-Goals (propozycja operuje na istniejącym katalogu).

## Done

- **F-01: (foundation) wbudowany katalog ćwiczeń z przypisaniem do partii mięśniowych jest zasiany i odpytywalny; brak UI własnego po stronie użytkownika.** — Archived 2026-06-19 → `context/archive/2026-06-16-seed-exercise-catalog/`. Lesson: —.
