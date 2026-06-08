---
project: "10xBoar"
version: 1
status: draft
created: 2026-05-24
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: "2026-08-10"
  after_hours_only: true
---

## Vision & Problem Statement

Hobbyiści trenujący siłowo nie mają prostego narzędzia, które łączy rejestrację treningów z inteligentnym generowaniem propozycji opartych na ich własnej historii — istniejące aplikacje (Strong, Hevy, FitNotes) są albo zbyt rozbudowane i przeładowane funkcjami, albo oferują generyczne plany niepowiązane z rzeczywistą historią użytkownika.

10xBoar wygrywa trzema rzeczami jednocześnie — prostotą obsługi (trening dodany w < 1 minucie), propozycjami generowanymi na podstawie własnych danych historycznych użytkownika (nie gotowych szablonów) oraz pełną kontrolą nad własną bazą ćwiczeń. Żadna prosta aplikacja nie łączy tych trzech cech.

## User & Persona

**Główna persona: Marcin — hobbyista trenujący siłowo amatorsko**

- Rola: osoba prywatna ćwicząca regularnie na siłowni lub w domu, bez trenera personalnego
- Kontekst: trenuje kilka razy w tygodniu, chce śledzić postępy i planować kolejne sesje bez poświęcania dużo czasu na administrację
- Moment sięgnięcia po aplikację: tuż przed lub po treningu — chce szybko zarejestrować co zrobił (serie, ciężary) i sprawdzić co robić następnym razem
- Obecny koszt: ręczne notatki lub arkusze kalkulacyjne — żadna analiza ani propozycja nie pojawia się automatycznie

## Success Criteria

### Primary
- Użytkownik dodaje trening (ćwiczenie + serie + ciężary) w czasie krótszym niż 1 minuta
- Aplikacja generuje sensowną propozycję treningu dla wybranej partii mięśniowej na podstawie historii użytkownika

### Secondary
- Użytkownik widzi wykres progresu ciężaru dla każdego ćwiczenia

### Guardrails
- Zapisany trening musi być dostępny przy następnym logowaniu — utrata danych jest niedopuszczalna

## User Stories

### US-01: Generowanie propozycji treningu na wybraną partię ciała

- **Given** użytkownik jest zalogowany do aplikacji i ma zalogowany jakikolwiek trening
- **When** użytkownik prosi o propozycję treningu na dany dzień (dzisiaj lub w przyszłości) na daną partię ciała
- **Then** widzi plan treningowy oparty na historii

#### Acceptance Criteria
- Plan zawiera ćwiczenia przypisane do wybranej partii mięśniowej
- Plan jest oparty na danych historycznych użytkownika (nie jest generyczny)
- Jeśli użytkownik nie ma historii dla danej partii, aplikacja informuje o tym zamiast pokazywać pusty plan

## Functional Requirements

### Baza ćwiczeń
- FR-001: Użytkownik wybiera ćwiczenia z wbudowanej bazy przypisanej do partii mięśniowych. Priority: must-have
  > Socrates: Kontrargument rozważony: "wbudowana baza eliminuje potrzebę ręcznego dodawania ćwiczeń, przyspiesza onboarding." Rezolucja: FR-001 zrewidowany — zamiast "dodaj własne ćwiczenie" → "wybierz z wbudowanego katalogu." Kontrola nad własną bazą (insight z fazy discovery) przeniesiona do FR-002 jako nice-to-have rozszerzenie.
- FR-002: Użytkownik może rozszerzyć wbudowaną bazę o własne ćwiczenia poprzez import z CSV. Priority: nice-to-have
  > Socrates: Kontrargument rozważony: "po rewizji FR-001 import CSV mógłby stracić sens." Rezolucja: zachowany jako nice-to-have dla zaawansowanych użytkowników chcących niestandardowych ćwiczeń spoza katalogu.

### Rejestracja treningu
- FR-003: Użytkownik może zalogować trening dla danego dnia (ćwiczenie + liczba serii + ciężar). Priority: must-have
  > Socrates: Kontrargument rozważony: "ręczne logowanie każdej serii może być żmudne i nieosiągalne < 1 min." Rezolucja: FR stoi — UI musi być zoptymalizowane pod szybkość; kryterium '< 1 minuty' jest testem akceptacji dla implementacji.
- FR-004: Użytkownik może zaplanować trening na przyszły dzień. Priority: must-have
  > Socrates: Kontrargument rozważony: "propozycja (FR-005) już pełni rolę planowania." Rezolucja: dwa różne tryby użycia — propozycja to automatyzacja, planowanie ręczne to pełna kontrola użytkownika. Oba mają miejsce.

### Generowanie i analiza
- FR-005: Aplikacja generuje propozycję treningu dla wybranej partii mięśniowej na podstawie historii użytkownika. Priority: must-have
  > Socrates: Kontrargument rozważony: "algorytm przy małej historii daje słabe propozycje i podważa zaufanie." Rezolucja: FR stoi — ryzyko adresowane w Acceptance Criteria US-01 (empty-state dla braku historii). Minimalna ilość danych wymagana do propozycji to Open Question.
- FR-006: Użytkownik widzi statystyki progresu ciężaru dla każdego ćwiczenia. Priority: must-have
  > Socrates: Kontrargument rozważony: "wizualizacja to v2 jeśli propozycja działa." Rezolucja: FR stoi — progres ciężaru to podstawowa motywacja w treningu siłowym; bez tego aplikacja jest ślepa na własne dane.

## Non-Functional Requirements

- Każda operacja inicjowana przez użytkownika (logowanie serii, generowanie propozycji) daje widoczne potwierdzenie w czasie < 2 sekund; operacje trwające dłużej pokazują ciągłe informacje o postępie.
- Dane treningowe użytkownika nie są widoczne ani dostępne dla żadnego innego konta — każdy użytkownik widzi wyłącznie swoje własne dane.
- Interfejs działa poprawnie na dwóch ostatnich wersjach głównych przeglądarek desktopowych oraz na przeglądarce mobilnej (bez natywnej aplikacji).

## Business Logic

Aplikacja analizuje historię treningów użytkownika i generuje plan na wybraną grupę mięśniową wraz z sugerowanymi obciążeniami i liczbą serii.

Wejście (podawane przez użytkownika): partia mięśniowa (np. "Plecy", "Całe ciało") oraz docelowy dzień treningu. Aplikacja odczytuje historyczne sesje dla tej partii i na ich podstawie wyznacza ćwiczenia, ciężary i serie. Użytkownik napotyka wynik jako gotowy plan widoczny przed sesją — może go zaakceptować jako zaplanowany trening lub zignorować.

Minimalna ilość historii wymagana do wygenerowania sensownej propozycji pozostaje otwartym pytaniem — patrz Open Questions.

## Access Control

- Mechanizm dostępu: login (e-mail + hasło lub OAuth)
- Model ról: płaski — każdy zalogowany użytkownik widzi wyłącznie swoje dane, brak ról administracyjnych w MVP
- Rejestracja: nowy użytkownik zakłada konto, a następnie loguje się przy każdej sesji
- Niezalogowany użytkownik: brak dostępu do jakichkolwiek danych aplikacji

## Non-Goals

- Brak współdzielenia treningów z innymi użytkownikami — dane są prywatne; żadnych profili publicznych, udostępniania planów ani funkcji społecznościowych.
- Brak natywnej aplikacji mobilnej (iOS / Android) — dostęp przez przeglądarkę mobilną; nie App Store, nie Google Play.
- Brak rekomendacji dietetycznych — aplikacja dotyczy wyłącznie treningów siłowych; żadnych kalorii, makr ani posiłków.
- Brak generowania nowych ćwiczeń spoza wbudowanej bazy przez AI — propozycja działa na istniejącym katalogu; aplikacja nie tworzy nowych ćwiczeń.

## Open Questions

1. **Jaka minimalna liczba zalogowanych sesji jest wymagana, zanim aplikacja wygeneruje sensowną propozycję?** — Do ustalenia przed implementacją algorytmu. Blokuje: tak (propozycja z zerową historią szkodzi zaufaniu do produktu).
